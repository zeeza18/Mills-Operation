"""
Turns raw 1-minute sensor readings into features an anomaly model can
actually use.

A raw vibration reading of 9.5 mm/s doesn't mean anything on its own.
It only means something relative to what that stand's normal running
value looks like, and whether it's trending. So for each signal we add:

  - a rolling mean and rolling std over the last 60 minutes (is the
    stand currently running hotter/noisier than its own recent normal)
  - a 15-minute rate of change (is it actively trending, not just
    sitting at an elevated-but-stable level)

This is deliberately simple, no FFT/frequency-domain features, no
cross-signal interaction terms. Started there on purpose: see
docs/ai-partnership-log.md for why I didn't reach for something
fancier first.
"""

import pandas as pd

SIGNAL_COLUMNS = [
    "vibration_rms_mm_s",
    "bearing_temp_c",
    "motor_current_a",
    "line_speed_mpm",
    "coolant_pressure_psi",
]

ROLLING_WINDOW_MIN = 60
ROC_WINDOW_MIN = 15


def build_features(readings: pd.DataFrame) -> pd.DataFrame:
    readings = readings.sort_values(["stand_id", "timestamp"]).reset_index(drop=True)
    grouped = readings.groupby("stand_id", group_keys=False)

    feature_frames = [readings[["timestamp", "stand_id"]]]

    for col in SIGNAL_COLUMNS:
        roll = grouped[col].rolling(ROLLING_WINDOW_MIN, min_periods=ROLLING_WINDOW_MIN)
        rolling_mean = roll.mean().reset_index(level=0, drop=True)
        rolling_std = roll.std().reset_index(level=0, drop=True)
        roc = grouped[col].diff(ROC_WINDOW_MIN)

        feature_frames.append(pd.DataFrame({
            col: readings[col],
            f"{col}_roll_mean": rolling_mean,
            f"{col}_roll_std": rolling_std,
            f"{col}_roc_15m": roc,
        }))

    features = pd.concat(feature_frames, axis=1)
    # first 60 minutes of each stand-day have no full rolling window yet, drop them
    features = features.dropna().reset_index(drop=True)
    return features


def feature_columns() -> list[str]:
    cols = []
    for col in SIGNAL_COLUMNS:
        cols += [col, f"{col}_roll_mean", f"{col}_roll_std", f"{col}_roc_15m"]
    return cols
