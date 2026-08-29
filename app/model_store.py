"""
Loads the trained detector and its metadata once and caches them in memory.

Three call sites need the same trained model now: the static API (already
scored offline), the live feed, and the degradation simulator. Loading the
joblib file and parsing model_meta.json on every request/tick would work
but is wasted I/O for something that never changes while the server runs.
"""

import json
from pathlib import Path

from app import detector

MODEL_PATH = "app/model.joblib"
META_PATH = Path("data/synthetic/model_meta.json")

_cache: dict = {}


def get_detector() -> detector.TrainedDetector:
    if "detector" not in _cache:
        _cache["detector"] = detector.load(MODEL_PATH)
    return _cache["detector"]


def get_meta() -> dict:
    if "meta" not in _cache:
        _cache["meta"] = json.loads(META_PATH.read_text())
    return _cache["meta"]


def get_baseline_stats() -> dict:
    return get_meta()["baseline_stats"]
