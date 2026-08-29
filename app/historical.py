"""
Scores the FULL historical synthetic dataset (45 days ending yesterday),
not just the 9-or-so held-out test days already in
data/synthetic/test_scored.csv.

The live dashboard's date-range filter lets a viewer pick a range going
back toward the start of the synthetic data, so the chart can show the
original training-period incidents on the same timeline as today's live
feed. test_scored.csv alone doesn't cover that far back; this reuses the
SAME trained detector to score the rest, purely for display. No
retraining happens here or anywhere in this refresh: the model only ever
sees engineered features (rolling stats), never calendar dates, and
data/generate_synthetic_data.py uses a fixed random seed, so regenerating
it produces byte-identical signal sequences no matter what dates get
stamped on them. The already-trained model.joblib stays exactly as valid
against freshly-dated data as it was against the original.
"""

from pathlib import Path

import pandas as pd

from app import model_store
from app.detector import find_alerts_with_backstop, score
from app.features import build_features
from data.generate_synthetic_data import main as regenerate_synthetic_data

DATA_DIR = Path("data/synthetic")
CACHE_PATH = DATA_DIR / "full_scored.csv"
READINGS_PATH = DATA_DIR / "sensor_readings.csv"

_cache: pd.DataFrame | None = None
_bounds_cache: tuple[pd.Timestamp, pd.Timestamp] | None = None


def ensure_fresh() -> None:
    """Regenerates the historical dataset if it's gone stale (more than a
    day behind "now"), so reopening the app after being closed for a
    while (a day, a weekend, whatever) auto-backfills the gap instead of
    leaving a hole between wherever the old data stopped and today's live
    feed. Cheap to check (one column) and cheap to regenerate (a few
    seconds, no model training), so this runs unconditionally at API
    startup rather than needing anyone to remember a manual step.
    """
    global _cache, _bounds_cache
    yesterday = pd.Timestamp.now().normalize() - pd.Timedelta(days=1)

    if READINGS_PATH.exists():
        existing_max = pd.read_csv(READINGS_PATH, usecols=["timestamp"], parse_dates=["timestamp"]).timestamp.max()
        if existing_max >= yesterday:
            return  # already covers through yesterday, nothing to do

    regenerate_synthetic_data()
    CACHE_PATH.unlink(missing_ok=True)  # stale relative to the readings just regenerated
    _cache = None
    _bounds_cache = None


def get_date_bounds() -> tuple[pd.Timestamp, pd.Timestamp]:
    """(min, max) timestamp in the historical set, read cheaply (one column,
    no feature engineering or scoring) so callers can decide whether a
    requested range overlaps it at all before paying for get_scored()."""
    global _bounds_cache
    if _bounds_cache is None:
        ts = pd.read_csv(READINGS_PATH, usecols=["timestamp"], parse_dates=["timestamp"])
        _bounds_cache = (ts.timestamp.min(), ts.timestamp.max())
    return _bounds_cache


def get_scored() -> pd.DataFrame:
    """Scoring 388K rows through LocalOutlierFactor takes well over a
    minute, way too slow to do inside a request. Result is cached to disk
    (full_scored.csv) after the first computation, so it only ever runs
    once, not once per server restart."""
    global _cache
    if _cache is not None:
        return _cache

    if CACHE_PATH.exists():
        _cache = pd.read_csv(CACHE_PATH, parse_dates=["timestamp"])
        return _cache

    readings = pd.read_csv(READINGS_PATH, parse_dates=["timestamp"])
    features = build_features(readings)
    detector = model_store.get_detector()
    baseline_stats = model_store.get_baseline_stats()
    features = features.copy()
    features["anomaly_score"] = score(detector, features)
    features["is_alert"] = find_alerts_with_backstop(features, detector.alert_threshold, baseline_stats)

    features.to_csv(CACHE_PATH, index=False)
    _cache = features
    return _cache
