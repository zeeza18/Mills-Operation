"""
Trains a LocalOutlierFactor model on "normal" operating windows and scores
every row for how anomalous it looks relative to that baseline.

Why LocalOutlierFactor: this used to be IsolationForest, chosen by reasoning
alone (see git history and docs/ai-partnership-log.md). That reasoning was
never actually tested against alternatives. notebooks/model_comparison.ipynb
runs an actual bake off: a naive max abs z score baseline, IsolationForest,
LocalOutlierFactor, OneClassSVM, and EllipticEnvelope, all trained on the
same features and graded on the same lead time and false alarm metrics.
LocalOutlierFactor won outright: zero false alarms on the held out test
window versus about 0.8% for IsolationForest, and roughly ten times more
warning time before failure (about 9 hours median versus under an hour).
IsolationForest partitions the whole feature space globally, so it tends to
only flag a stand once a reading is extreme relative to everything. A
degrading bearing's early trajectory is unusual relative to that specific
stand's own recent neighborhood well before it's globally extreme, and
LocalOutlierFactor's local density comparison catches that earlier. See
docs/architecture.md for the full writeup, including caveats: this was
still evaluated on synthetic data with one engineered failure signature,
and would need to be re run against real historian data before trusting it
in production.
"""

from dataclasses import dataclass

import joblib
import numpy as np
import pandas as pd
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler

from app.features import feature_columns

CONTAMINATION = 0.01
N_NEIGHBORS = 35
RANDOM_STATE = 42
ALERT_PERSISTENCE_MIN = 5  # consecutive flagged minutes required before we call it an "alert"

# Found by the bake off in notebooks/model_comparison.ipynb: swept 90th to 99.5th
# percentile of train scores, same range used to tune the old IsolationForest
# threshold. 99.5th is the point where LocalOutlierFactor still catches every
# held out failure with a 0.00% false alarm rate on normal minutes, the best
# operating point in the swept range. See docs/ai-partnership-log.md for the
# earlier IsolationForest tuning story this range originally came from.
ALERT_THRESHOLD_PERCENTILE = 99.5


@dataclass
class TrainedDetector:
    scaler: StandardScaler
    model: LocalOutlierFactor
    alert_threshold: float


def train(train_normal: pd.DataFrame) -> TrainedDetector:
    cols = feature_columns()
    X = train_normal[cols].to_numpy()

    scaler = StandardScaler().fit(X)
    X_scaled = scaler.transform(X)

    model = LocalOutlierFactor(
        n_neighbors=N_NEIGHBORS,
        contamination=CONTAMINATION,
        novelty=True,  # lets the fitted model score new, unseen rows later
    ).fit(X_scaled)

    # anomaly_score: higher = more anomalous (flipped sklearn's score_samples sign)
    train_scores = -model.score_samples(X_scaled)
    alert_threshold = float(np.percentile(train_scores, ALERT_THRESHOLD_PERCENTILE))

    return TrainedDetector(scaler=scaler, model=model, alert_threshold=alert_threshold)


def score(detector: TrainedDetector, df: pd.DataFrame) -> pd.Series:
    cols = feature_columns()
    X_scaled = detector.scaler.transform(df[cols].to_numpy())
    return pd.Series(-detector.model.score_samples(X_scaled), index=df.index)


def find_alerts(df: pd.DataFrame, threshold: float) -> pd.Series:
    """A row is an 'alert' only once anomaly_score has stayed above threshold
    for ALERT_PERSISTENCE_MIN consecutive minutes. A single noisy spike
    shouldn't page a shift supervisor."""
    flagged = df["anomaly_score"] > threshold
    persistent = (
        flagged.groupby(df["stand_id"])
        .transform(lambda s: s.rolling(ALERT_PERSISTENCE_MIN, min_periods=ALERT_PERSISTENCE_MIN).sum()
                   >= ALERT_PERSISTENCE_MIN)
    )
    return persistent.fillna(False)


# LocalOutlierFactor measures local density: how isolated a point is from its
# own nearest neighbors. That's exactly why it beat IsolationForest in the
# notebooks/model_comparison.ipynb bake off (it catches subtle early drift an
# IsolationForest partition misses). It has a blind spot on the other end,
# though: if a stand stays broken for hours, the later minutes of that same
# failure all look similar to EACH OTHER, so they become each other's "normal"
# local neighborhood and the score quietly drops back under threshold, even
# though the raw reading never recovered. Confirmed on real output: STAND-01's
# vibration was still 8-10.6 mm/s (baseline mean 2.54) six hours after its
# 18:01 failure, but anomaly_score had settled to ~1.0-1.1, under the 1.299
# threshold.
#
# BACKSTOP_Z_THRESHOLD/_PERSISTENCE_MIN below is a safety net that doesn't
# depend on the model at all: it compares raw signals to the STABLE,
# whole-training-period baseline (never shifts, unlike a rolling window) and
# forces an alert if a signal is still clearly abnormal after a long enough
# stretch. It's deliberately slower to trigger (20 min vs. the model's 5) since
# its job is "are we still actually broken", not early warning.
BACKSTOP_Z_THRESHOLD = 3.5
BACKSTOP_PERSISTENCE_MIN = 20


def backstop_flags(df: pd.DataFrame, baseline_stats: dict) -> pd.Series:
    max_abs_z = pd.Series(0.0, index=df.index)
    for col, stats in baseline_stats.items():
        z = (df[col] - stats["mean"]) / stats["std"]
        max_abs_z = np.maximum(max_abs_z, z.abs())

    flagged = max_abs_z > BACKSTOP_Z_THRESHOLD
    persistent = (
        flagged.groupby(df["stand_id"])
        .transform(lambda s: s.rolling(BACKSTOP_PERSISTENCE_MIN, min_periods=BACKSTOP_PERSISTENCE_MIN).sum()
                   >= BACKSTOP_PERSISTENCE_MIN)
    )
    return persistent.fillna(False)


def find_alerts_with_backstop(df: pd.DataFrame, threshold: float, baseline_stats: dict) -> pd.Series:
    return find_alerts(df, threshold) | backstop_flags(df, baseline_stats)


def save(detector: TrainedDetector, path: str) -> None:
    joblib.dump(detector, path)


def load(path: str) -> TrainedDetector:
    return joblib.load(path)
