"""
Shaping helpers shared by the static (test_scored.csv) and live timeseries
endpoints: collapsing an is_alert column into contiguous bands, and evenly
downsampling a long series for charting. Pulled out of app/api.py once the
live feed needed the exact same shaping for a second data source.
"""

import numpy as np
import pandas as pd


def alert_bands(df: pd.DataFrame) -> list[dict]:
    """Collapses a boolean is_alert column into contiguous {start, end} ranges."""
    alert = df["is_alert"].to_numpy()
    if not alert.any():
        return []
    change = np.diff(alert.astype(int), prepend=0, append=0)
    starts = np.where(change == 1)[0]
    ends = np.where(change == -1)[0] - 1
    timestamps = df["timestamp"].astype(str).to_numpy()
    return [{"start": timestamps[s], "end": timestamps[e]} for s, e in zip(starts, ends)]


def downsample(df: pd.DataFrame, target_points: int) -> pd.DataFrame:
    """Evenly samples down to target_points; a plain even sample, since alert
    visibility no longer depends on which rows survive (see alert_bands)."""
    if len(df) <= target_points:
        return df.sort_values("timestamp")
    step = len(df) // target_points
    return df.iloc[::step].sort_values("timestamp")
