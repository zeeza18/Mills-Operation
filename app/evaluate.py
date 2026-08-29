"""
Runs the full pipeline end to end: load data -> build features -> train
on normal history -> score the held-out days -> report two numbers that
actually matter for a shift supervisor:

  1. Lead time: for failures in the test window, how far in advance
     did the model raise a persistent alert before the actual failure?
  2. False positive rate: of all the normal minutes in the test
     window, what fraction got flagged? (This is the number that
     determines whether a supervisor starts ignoring the tool.)

Run: python -m app.evaluate
"""

import json

import pandas as pd

from app import detector
from app.features import build_features, SIGNAL_COLUMNS
from app.labels import attach_time_to_failure, is_clean_normal, split_train_test

DATA_DIR = "data/synthetic"
MODEL_PATH = "app/model.joblib"


def load_data():
    readings = pd.read_csv(f"{DATA_DIR}/sensor_readings.csv", parse_dates=["timestamp"])
    events = pd.read_csv(f"{DATA_DIR}/failure_events.csv", parse_dates=["failure_timestamp", "degrade_start_timestamp"])
    return readings, events


def evaluate_lead_times(test_scored: pd.DataFrame, events: pd.DataFrame, threshold: float,
                         baseline_stats: dict) -> pd.DataFrame:
    test_scored = test_scored.copy()
    test_scored["is_alert"] = detector.find_alerts_with_backstop(test_scored, threshold, baseline_stats)

    rows = []
    for _, ev in events.iterrows():
        stand_rows = test_scored[
            (test_scored.stand_id == ev.stand_id)
            & (test_scored.timestamp >= ev.degrade_start_timestamp)
            & (test_scored.timestamp <= ev.failure_timestamp)
        ]
        if stand_rows.empty:
            continue  # this failure event isn't in the held-out test window

        alerts = stand_rows[stand_rows.is_alert]
        if alerts.empty:
            rows.append({"stand_id": ev.stand_id, "failure_timestamp": ev.failure_timestamp,
                         "detected": False, "lead_time_min": None})
        else:
            first_alert = alerts.timestamp.min()
            lead_min = (ev.failure_timestamp - first_alert).total_seconds() / 60
            rows.append({"stand_id": ev.stand_id, "failure_timestamp": ev.failure_timestamp,
                         "detected": True, "lead_time_min": lead_min})

    return pd.DataFrame(rows)


def evaluate_false_positive_rate(test_scored: pd.DataFrame, threshold: float,
                                  baseline_stats: dict) -> float:
    test_scored = test_scored.copy()
    test_scored["is_alert"] = detector.find_alerts_with_backstop(test_scored, threshold, baseline_stats)
    # is_clean_normal excludes rows both approaching a failure AND recovering
    # from one (see app/labels.py). Recovery matters here: the generator holds
    # a stand at failed values for the rest of the day once it fails, so the
    # hour after a failure is still visibly broken, not a clean baseline
    # minute, even though it may be well over 24h before the NEXT failure.
    normal_rows = test_scored[is_clean_normal(test_scored)]
    if normal_rows.empty:
        return float("nan")
    return normal_rows["is_alert"].mean()


def main():
    print("Loading data...")
    readings, events = load_data()

    print("Building features...")
    features = build_features(readings)
    labeled = attach_time_to_failure(features, events)

    print("Splitting train/test by day (time-based, not random)...")
    train_normal, test = split_train_test(labeled)
    print(f"  train_normal rows: {len(train_normal):,}")
    print(f"  test rows: {len(test):,}")

    # Stable, whole-training-period normal stats per raw signal. Not a rolling
    # window. Computed here, before scoring, because it's now used for two
    # things: the copilot layer's "is this reading actually abnormal" judgment
    # (a rolling mean measured *during* an active fault is itself mid-collapse
    # and gives misleading direction, see docs/ai-partnership-log.md for the
    # case that caught this), and now also detector.find_alerts_with_backstop,
    # the fix for LocalOutlierFactor losing track of a sustained failure once
    # its own recent minutes become each other's local "normal" (see the
    # comment on BACKSTOP_Z_THRESHOLD in app/detector.py).
    baseline_stats = {
        col: {"mean": float(train_normal[col].mean()), "std": float(train_normal[col].std())}
        for col in SIGNAL_COLUMNS
    }

    print("Training LocalOutlierFactor on normal operating windows...")
    trained = detector.train(train_normal)
    detector.save(trained, MODEL_PATH)
    print(f"  alert_threshold ({detector.ALERT_THRESHOLD_PERCENTILE}th pct of train anomaly scores): {trained.alert_threshold:.3f}")

    print("Scoring held-out test window...")
    test = test.copy()
    test["anomaly_score"] = detector.score(trained, test)
    test["is_alert"] = detector.find_alerts_with_backstop(test, trained.alert_threshold, baseline_stats)

    print("\n--- Evaluation ---")
    lead_times = evaluate_lead_times(test, events, trained.alert_threshold, baseline_stats)
    n_events_in_window = len(lead_times)
    n_detected = int(lead_times["detected"].sum()) if n_events_in_window else 0
    print(f"Failure events in held-out test window: {n_events_in_window}")
    print(f"Detected before failure: {n_detected}/{n_events_in_window}")
    if n_detected:
        detected = lead_times[lead_times.detected]
        print(f"Lead time (minutes), median: {detected.lead_time_min.median():.0f}, "
              f"mean: {detected.lead_time_min.mean():.0f}, "
              f"min: {detected.lead_time_min.min():.0f}, "
              f"max: {detected.lead_time_min.max():.0f}")

    fp_rate = evaluate_false_positive_rate(test, trained.alert_threshold, baseline_stats)
    print(f"False positive rate on normal test minutes: {fp_rate:.4%}")

    test.to_csv(f"{DATA_DIR}/test_scored.csv", index=False)
    lead_times.to_csv(f"{DATA_DIR}/evaluation_lead_times.csv", index=False)

    meta = {
        "alert_threshold": trained.alert_threshold,
        "alert_threshold_percentile": detector.ALERT_THRESHOLD_PERCENTILE,
        "false_positive_rate": fp_rate,
        "failures_in_test_window": n_events_in_window,
        "failures_detected": n_detected,
        "baseline_stats": baseline_stats,
    }
    with open(f"{DATA_DIR}/model_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nSaved scored test set -> {DATA_DIR}/test_scored.csv")
    print(f"Saved lead-time evaluation -> {DATA_DIR}/evaluation_lead_times.csv")
    print(f"Saved model metadata -> {DATA_DIR}/model_meta.json")


if __name__ == "__main__":
    main()
