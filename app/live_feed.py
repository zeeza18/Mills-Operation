"""
A live, continuously-growing sensor feed, separate from the static
sensor_readings.csv used for training/evaluation.

Ticks once per real minute (see run_forever below), appends one new row
per stand to data/synthetic/live_readings.csv, and scores the running
buffer with the same trained detector the static dashboard uses. This is
what backs the "Live Monitor" tab: same graphs, but the data and the
model's calls on it are happening in real time instead of being read from
a fixed, already-scored CSV.

Two deliberate simplifications versus data/generate_synthetic_data.py:

  - Failure odds and duration are both compressed here, not the literal
    22%-per-day / 6-48 REAL HOURS used to build the training data. Those
    numbers were chosen to make training data realistic, not to be
    watched live; at the literal rate, a demo could sit at "all normal"
    for hours before anything happened at all. See P_START_DEGRADE below
    for the actual numbers and why. The model itself is untouched, only
    how often and how fast the live narration plays out for a viewer.
  - State (which stands are mid-failure, how far along) lives in this
    process's memory, not in the CSV. Restarting the API resets it.
"""

import asyncio
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from app import model_store
from app.detector import find_alerts_with_backstop, score
from app.features import SIGNAL_COLUMNS, build_features
from app.signal_profile import BASELINE, FAILURE_TARGETS, interpolate, ramp_curve

DATA_DIR = Path("data/synthetic")
LIVE_CSV = DATA_DIR / "live_readings.csv"

N_STANDS = 6
STAND_IDS = [f"STAND-{i:02d}" for i in range(1, N_STANDS + 1)]

SEED_MINUTES = 150          # >= 60 (rolling window) + 15 (roc) with margin
MAX_BUFFER_MINUTES = 6 * 60  # keep last 6 hours in memory/API; CSV keeps everything
TICK_SECONDS = 60

MIN_DEGRADE_MINUTES = 10
MAX_DEGRADE_MINUTES = 40
FAILED_HOLD_MIN_MINUTES = 30
FAILED_HOLD_MAX_MINUTES = 90
RECOVER_MINUTES = 15

# Per-tick probability of a new failure starting. The first version of this
# matched FAILURE_RATE literally (~22% odds per stand per real DAY), which
# meant an idle demo would sit at "all normal" for hours, sometimes days,
# before anything happened, exactly the "no fun in an interview" problem
# this was calibrated for. This is deliberately juiced instead: about a
# 1-in-100 chance per stand per minute, which works out to roughly an 8
# minute average wait for SOME stand (out of 6) to start degrading, and a
# full degrade-to-alert cycle finishing well within a normal demo window.
# It's still genuinely random (not "always broken", not scripted to a
# fixed time), just tuned for watchability instead of statistical realism.
# See docs/architecture.md if this needs retuning again.
P_START_DEGRADE = 0.01


@dataclass
class Episode:
    phase: str  # "degrading" | "failed" | "recovering"
    tick: int = 0
    duration_minutes: int = 0
    start_values: dict = field(default_factory=dict)


_rng = np.random.default_rng()
_buffer: pd.DataFrame = pd.DataFrame(columns=["timestamp", "stand_id", *SIGNAL_COLUMNS])
_scored: pd.DataFrame = pd.DataFrame()
_episodes: dict[str, Episode | None] = {sid: None for sid in STAND_IDS}


def _now_floored() -> pd.Timestamp:
    return pd.Timestamp.now().floor("min")


def _normal_noise() -> dict[str, float]:
    return {col: float(_rng.normal(mean, std)) for col, (mean, std) in BASELINE.items()}


def _seed_buffer() -> pd.DataFrame:
    end = _now_floored()
    start = end - pd.Timedelta(minutes=SEED_MINUTES - 1)
    timestamps = pd.date_range(start, end, freq="1min")
    rows = []
    for sid in STAND_IDS:
        for ts in timestamps:
            rows.append({"timestamp": ts, "stand_id": sid, **_normal_noise()})
    return pd.DataFrame(rows)


def _tick_stand(sid: str, last_values: dict) -> dict:
    episode = _episodes[sid]

    if episode is None:
        values = _normal_noise()
        if _rng.random() < P_START_DEGRADE:
            duration = int(_rng.integers(MIN_DEGRADE_MINUTES, MAX_DEGRADE_MINUTES + 1))
            _episodes[sid] = Episode(phase="degrading", tick=0, duration_minutes=duration,
                                      start_values={c: last_values[c] for c in SIGNAL_COLUMNS})
        return values

    episode.tick += 1

    if episode.phase == "degrading":
        progress = ramp_curve(episode.tick / episode.duration_minutes)
        values = {}
        for col in SIGNAL_COLUMNS:
            # ramps from THIS episode's actual starting point (wherever normal
            # noise happened to leave it), not the generic baseline mean, so
            # there's no jump at the moment a failure starts
            start = episode.start_values[col]
            values[col] = start + (FAILURE_TARGETS[col] - start) * progress
            values[col] += float(_rng.normal(0, BASELINE[col][1] * progress * 1.5))
        if episode.tick >= episode.duration_minutes:
            hold = int(_rng.integers(FAILED_HOLD_MIN_MINUTES, FAILED_HOLD_MAX_MINUTES + 1))
            _episodes[sid] = Episode(phase="failed", tick=0, duration_minutes=hold)
        return values

    if episode.phase == "failed":
        values = {col: FAILURE_TARGETS[col] + float(_rng.normal(0, BASELINE[col][1] * 1.5))
                  for col in SIGNAL_COLUMNS}
        if episode.tick >= episode.duration_minutes:
            _episodes[sid] = Episode(phase="recovering", tick=0, duration_minutes=RECOVER_MINUTES)
        return values

    # recovering
    progress = 1 - ramp_curve(episode.tick / episode.duration_minutes)
    values = interpolate(progress)
    values = {col: v + float(_rng.normal(0, BASELINE[col][1] * 0.5)) for col, v in values.items()}
    if episode.tick >= episode.duration_minutes:
        _episodes[sid] = None
    return values


def _rescore():
    global _scored
    features = build_features(_buffer)
    if features.empty:
        _scored = features.assign(anomaly_score=pd.Series(dtype=float), is_alert=pd.Series(dtype=bool))
        return
    detector = model_store.get_detector()
    baseline_stats = model_store.get_baseline_stats()
    features = features.copy()
    features["anomaly_score"] = score(detector, features)
    features["is_alert"] = find_alerts_with_backstop(features, detector.alert_threshold, baseline_stats)
    _scored = features


def tick_once() -> None:
    """Advances the live feed by exactly one minute. Exposed separately from
    the sleep loop so it can be called directly (e.g. from a test or a
    manual "step" endpoint) without waiting on real time."""
    global _buffer
    if _buffer.empty:
        _buffer = _seed_buffer()

    new_ts = _buffer["timestamp"].max() + pd.Timedelta(minutes=1)
    last_row = _buffer[_buffer.timestamp == _buffer.timestamp.max()].set_index("stand_id")

    new_rows = []
    for sid in STAND_IDS:
        last_values = last_row.loc[sid, SIGNAL_COLUMNS].to_dict()
        values = _tick_stand(sid, last_values)
        new_rows.append({"timestamp": new_ts, "stand_id": sid, **values})

    new_df = pd.DataFrame(new_rows)
    _buffer = pd.concat([_buffer, new_df], ignore_index=True)
    cutoff = new_ts - pd.Timedelta(minutes=MAX_BUFFER_MINUTES)
    _buffer = _buffer[_buffer.timestamp >= cutoff].reset_index(drop=True)

    LIVE_CSV.parent.mkdir(parents=True, exist_ok=True)
    new_df.round(3).to_csv(LIVE_CSV, mode="a", header=not LIVE_CSV.exists(), index=False)

    _rescore()


def get_scored() -> pd.DataFrame:
    if _buffer.empty:
        tick_once()
    return _scored


async def run_forever():
    """Ticks once immediately (so the API has live data right away), then
    once every real minute after that."""
    tick_once()
    while True:
        await asyncio.sleep(TICK_SECONDS - (time.time() % TICK_SECONDS))
        tick_once()
