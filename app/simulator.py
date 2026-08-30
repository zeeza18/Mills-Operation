"""
Backs the "Degradation Simulator" tab: one virtual roll stand a user can
push toward failure by hand and watch the real trained model react.

Editing one signal field auto-correlates the other four (see correlate())
using the same normal-baseline -> failure-target curve the live feed and
the training generator both use, so "turn vibration up" moves temperature,
current, speed, and pressure the way a real degrading bearing would, not
independently.

Starting a run (start_degrade) then ticking (tick_degrade) appends real
rows to an in-memory buffer for stand id SIM_STAND_ID and scores it with
the exact same feature pipeline and trained detector as everywhere else,
so "does this alert" is a genuine model call, not a canned animation.
"""

import threading
from dataclasses import dataclass

import numpy as np
import pandas as pd

from app import model_store
from app.detector import find_alerts_with_backstop, score
from app.features import SIGNAL_COLUMNS, build_features
from app.signal_profile import BASELINE, FAILURE_TARGETS, progress_from_value, ramp_curve

SIM_STAND_ID = "SIM-STAND"
SEED_MINUTES = 150       # matches live_feed: >= 60 rolling + 15 roc, with margin
MAX_BUFFER_MINUTES = 500

_rng = np.random.default_rng()
_buffer: pd.DataFrame = pd.DataFrame(columns=["timestamp", "stand_id", *SIGNAL_COLUMNS])
# FastAPI runs each sync endpoint in a worker thread, and _buffer/_run below
# are plain module globals, so two requests landing close together (a stale
# tick from a closed browser tab racing a fresh reset, say) can genuinely
# interleave. That surfaced as a real crash under test: one thread's "run
# just finished, clear it" set _run to None while another thread was still
# mid-tick, and the second thread's next line then hit
# AttributeError: 'NoneType' object has no attribute 'tick'. Reentrant since
# start_degrade and current_values can each call reset() while already
# holding the lock themselves.
_lock = threading.RLock()


@dataclass
class DegradeRun:
    start_values: dict
    duration_minutes: int
    tick: int = 0


_run: DegradeRun | None = None


def _normal_noise() -> dict[str, float]:
    return {col: float(_rng.normal(mean, std)) for col, (mean, std) in BASELINE.items()}


def _seed() -> pd.DataFrame:
    end = pd.Timestamp.now().floor("min")
    start = end - pd.Timedelta(minutes=SEED_MINUTES - 1)
    timestamps = pd.date_range(start, end, freq="1min")
    rows = [{"timestamp": ts, "stand_id": SIM_STAND_ID, **_normal_noise()} for ts in timestamps]
    return pd.DataFrame(rows)


def reset() -> None:
    global _buffer, _run
    with _lock:
        _buffer = _seed()
        _run = None


def correlate(signal: str, value: float) -> dict[str, float]:
    """Given one signal's new value, returns all five signals' values at the
    matching point on the shared normal-to-failure curve."""
    progress = progress_from_value(signal, value)
    progress = max(0.0, min(1.2, progress))
    return {
        col: round(BASELINE[col][0] + (FAILURE_TARGETS[col] - BASELINE[col][0]) * progress, 3)
        for col in SIGNAL_COLUMNS
    }


def current_values() -> dict[str, float]:
    with _lock:
        if _buffer.empty:
            reset()
        latest = _buffer.iloc[-1]
        return {col: round(float(latest[col]), 3) for col in SIGNAL_COLUMNS}


def start_degrade(start_values: dict[str, float], duration_minutes: int) -> None:
    global _run
    with _lock:
        if _buffer.empty:
            reset()
        _run = DegradeRun(start_values=dict(start_values), duration_minutes=max(1, duration_minutes))


def _score_latest() -> dict:
    features = build_features(_buffer)
    detector = model_store.get_detector()
    baseline_stats = model_store.get_baseline_stats()
    # find_alerts_with_backstop needs a real trailing window of scores (it
    # requires ALERT_PERSISTENCE_MIN consecutive flagged minutes), not just
    # the latest row, so the whole tail gets scored, not only the newest point.
    features = features.copy()
    features["anomaly_score"] = score(detector, features)
    is_alert = bool(find_alerts_with_backstop(features, detector.alert_threshold, baseline_stats).iloc[-1])
    anomaly_score = float(features["anomaly_score"].iloc[-1])
    return {"anomaly_score": round(anomaly_score, 4), "isAlerting": is_alert,
            "alertThreshold": round(detector.alert_threshold, 4)}


def tick_degrade() -> dict:
    """Advances the active run by one simulated minute and scores it. Raises
    if no run is active (the frontend should not be polling this then)."""
    global _buffer, _run
    with _lock:
        if _run is None:
            raise RuntimeError("No degradation run in progress")

        _run.tick += 1
        progress = ramp_curve(min(1.0, _run.tick / _run.duration_minutes))

        values = {}
        for col in SIGNAL_COLUMNS:
            start = _run.start_values[col]
            values[col] = start + (FAILURE_TARGETS[col] - start) * progress
            values[col] += float(_rng.normal(0, BASELINE[col][1] * progress * 1.5))

        new_ts = _buffer["timestamp"].max() + pd.Timedelta(minutes=1)
        new_row = pd.DataFrame([{"timestamp": new_ts, "stand_id": SIM_STAND_ID, **values}])
        _buffer = pd.concat([_buffer, new_row], ignore_index=True)
        cutoff = new_ts - pd.Timedelta(minutes=MAX_BUFFER_MINUTES)
        _buffer = _buffer[_buffer.timestamp >= cutoff].reset_index(drop=True)

        result = _score_latest()
        done = _run.tick >= _run.duration_minutes
        result.update({
            "timestamp": str(new_ts),
            "tick": _run.tick,
            "durationMinutes": _run.duration_minutes,
            "progress": round(progress, 4),
            "done": done,
            **{col: round(v, 3) for col, v in values.items()},
        })
        if done:
            _run = None
        return result
