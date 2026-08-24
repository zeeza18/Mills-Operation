"""
Synthetic mill sensor data generator.

Simulates multiple roll stands on a hot mill line over many days of
operation, each emitting five signals at 1-minute resolution:

  vibration_rms_mm_s   - bearing vibration, RMS velocity
  bearing_temp_c       - bearing housing temperature
  motor_current_a      - drive motor current
  line_speed_mpm       - line speed, meters per minute
  coolant_pressure_psi - bearing coolant supply pressure

Most stand-days are normal operation with sensor noise around a stable
baseline. A subset of stand-days end in an unplanned downtime event,
preceded by a gradual degradation window (rising vibration/temp,
falling coolant pressure) that starts 6-48 hours before the failure
timestamp. This mimics real bearing-wear failure signatures without
using any real Nucor data.

Output:
  data/synthetic/sensor_readings.csv  - one row per stand per minute
  data/synthetic/failure_events.csv   - one row per injected failure

Not proprietary data of any kind. See docs/data-strategy.md for how a
production version of this would be sourced from Nucor's historian.
"""

import numpy as np
import pandas as pd
from pathlib import Path

RNG_SEED = 42
N_STANDS = 6
N_DAYS = 45
FAILURE_RATE = 0.22        # fraction of stand-days that end in a failure
MIN_DEGRADE_HOURS = 6
MAX_DEGRADE_HOURS = 48
FREQ_MINUTES = 1

BASELINE = {
    "vibration_rms_mm_s": (2.2, 0.35),   # (mean, std) under normal operation
    "bearing_temp_c": (58.0, 2.5),
    "motor_current_a": (410.0, 12.0),
    "line_speed_mpm": (620.0, 20.0),
    "coolant_pressure_psi": (85.0, 3.0),
}

FAILURE_TARGETS = {
    # value each signal drifts toward right at the failure timestamp
    "vibration_rms_mm_s": 9.5,
    "bearing_temp_c": 92.0,
    "motor_current_a": 470.0,
    "line_speed_mpm": 560.0,     # line speed is throttled back as a symptom
    "coolant_pressure_psi": 55.0,  # pressure drops as the seal degrades
}


def simulate_stand_day(rng, stand_id, day_start, will_fail):
    n_points = int(24 * 60 / FREQ_MINUTES)
    timestamps = pd.date_range(day_start, periods=n_points, freq=f"{FREQ_MINUTES}min")

    signals = {
        name: rng.normal(mean, std, n_points)
        for name, (mean, std) in BASELINE.items()
    }

    failure_ts = None
    degrade_start_ts = None
    if will_fail:
        # cap the degrade window so it always fits inside a single simulated day
        max_hours = min(MAX_DEGRADE_HOURS, (n_points - 60) / 60)
        degrade_hours = rng.uniform(MIN_DEGRADE_HOURS, max_hours)
        degrade_minutes = int(degrade_hours * 60)
        failure_minute = rng.integers(degrade_minutes, n_points)
        failure_ts = timestamps[failure_minute]
        degrade_start_minute = max(0, failure_minute - degrade_minutes)
        degrade_start_ts = timestamps[degrade_start_minute]

        span = failure_minute - degrade_start_minute
        # non-linear ramp: slow at first, accelerates near failure (typical bearing wear curve)
        progress = np.zeros(n_points)
        ramp = np.linspace(0, 1, span) ** 2.2
        progress[degrade_start_minute:failure_minute] = ramp
        progress[failure_minute:] = 1.0

        for name, target in FAILURE_TARGETS.items():
            base_mean = BASELINE[name][0]
            drift = (target - base_mean) * progress
            signals[name] = signals[name] + drift
            # widen noise as the fault develops — real bearings get noisier, not just shifted
            signals[name] += rng.normal(0, BASELINE[name][1] * progress * 1.5, n_points)

    df = pd.DataFrame({"timestamp": timestamps, "stand_id": stand_id, **signals})
    return df, failure_ts, degrade_start_ts


def main():
    rng = np.random.default_rng(RNG_SEED)
    out_dir = Path(__file__).parent / "synthetic"
    out_dir.mkdir(exist_ok=True)

    all_readings = []
    failure_events = []

    for stand in range(1, N_STANDS + 1):
        stand_id = f"STAND-{stand:02d}"
        for day in range(N_DAYS):
            day_start = pd.Timestamp("2026-01-01") + pd.Timedelta(days=day)
            will_fail = rng.random() < FAILURE_RATE
            df, failure_ts, degrade_start_ts = simulate_stand_day(rng, stand_id, day_start, will_fail)
            all_readings.append(df)
            if failure_ts is not None:
                failure_events.append({
                    "stand_id": stand_id,
                    "failure_timestamp": failure_ts,
                    "degrade_start_timestamp": degrade_start_ts,
                })

    readings = pd.concat(all_readings, ignore_index=True)
    readings = readings.round(3)
    events = pd.DataFrame(failure_events).sort_values(["stand_id", "failure_timestamp"])

    readings.to_csv(out_dir / "sensor_readings.csv", index=False)
    events.to_csv(out_dir / "failure_events.csv", index=False)

    print(f"Wrote {len(readings):,} sensor readings across {N_STANDS} stands / {N_DAYS} days")
    print(f"Wrote {len(events)} failure events -> {out_dir / 'failure_events.csv'}")


if __name__ == "__main__":
    main()
