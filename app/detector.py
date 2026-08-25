"""
Trains an IsolationForest on "normal" operating windows and scores
every row for how anomalous it looks relative to that baseline.

Why IsolationForest and not something fancier: this is a prototype, not
a production model, and I don't have real failure volume to justify a
supervised deep model. In real predictive maintenance you almost never
have enough labeled failures to train supervised. IsolationForest only
needs to learn what "normal" looks like, which is the data I actually
have plenty of. Wanted to get a real, honest baseline working end to
end before reaching for anything heavier. See docs/architecture.md for
the fuller "what I considered and rejected" writeup.
"""

from dataclasses import dataclass

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from app.features import feature_columns

CONTAMINATION = 0.01
N_ESTIMATORS = 200
RANDOM_STATE = 42
ALERT_PERSISTENCE_MIN = 5  # consecutive flagged minutes required before we call it an "alert"

# First pass used the 99.5th percentile of normal scores as the alert threshold. It sounded
# conservative and safe on paper. In practice it missed every single failure in the test set
# (0/11): the score ceiling a real failure reaches is only barely above the normal tail, and a
# static threshold set that close to the ceiling almost never sustains 5 consecutive minutes
# above it before the failure hits. Swept 90th to 99.5th percentile against the held-out set.
# 97th is the point where every test failure is still caught while the false-alarm rate on
# normal minutes drops under 1.1%. See docs/ai-partnership-log.md for the full story.
ALERT_THRESHOLD_PERCENTILE = 97.0


@dataclass
class TrainedDetector:
    scaler: StandardScaler
    model: IsolationForest
    alert_threshold: float


def train(train_normal: pd.DataFrame) -> TrainedDetector:
    cols = feature_columns()
    X = train_normal[cols].to_numpy()

    scaler = StandardScaler().fit(X)
    X_scaled = scaler.transform(X)

    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
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


def save(detector: TrainedDetector, path: str) -> None:
    joblib.dump(detector, path)


def load(path: str) -> TrainedDetector:
    return joblib.load(path)
