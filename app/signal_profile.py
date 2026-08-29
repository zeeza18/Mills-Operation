"""
Shared normal-baseline and failure-target values for the five signals.

Mirrors data/generate_synthetic_data.py's BASELINE/FAILURE_TARGETS (that
script already ran and its output is committed, so it's left untouched
rather than refactored to import from here). This copy is what the live
feed (app/live_feed.py) and the degradation simulator (app/simulator.py)
use to generate new synthetic minutes on the fly, so both stay physically
consistent with the data the model was actually trained on.
"""

from app.features import SIGNAL_COLUMNS

BASELINE = {
    "vibration_rms_mm_s": (2.2, 0.35),   # (mean, std) under normal operation
    "bearing_temp_c": (58.0, 2.5),
    "motor_current_a": (410.0, 12.0),
    "line_speed_mpm": (620.0, 20.0),
    "coolant_pressure_psi": (85.0, 3.0),
}

FAILURE_TARGETS = {
    "vibration_rms_mm_s": 9.5,
    "bearing_temp_c": 92.0,
    "motor_current_a": 470.0,
    "line_speed_mpm": 560.0,
    "coolant_pressure_psi": 55.0,
}

FAILURE_RATE = 0.22


def ramp_curve(fraction: float) -> float:
    """Same non-linear bearing-wear ramp shape as the generator: slow at
    first, accelerating near failure. fraction is 0..1 elapsed time, not
    signal progress."""
    fraction = max(0.0, min(1.0, fraction))
    return fraction ** 2.2


def interpolate(progress: float) -> dict[str, float]:
    """All five signals at a given 0..1 progress between normal baseline
    and full failure target, no noise added."""
    progress = max(0.0, min(1.2, progress))  # allow a little overshoot past the target
    return {
        col: BASELINE[col][0] + (FAILURE_TARGETS[col] - BASELINE[col][0]) * progress
        for col in SIGNAL_COLUMNS
    }


def progress_from_value(signal: str, value: float) -> float:
    """Inverts interpolate() for one signal: given a value the user typed
    in, what progress fraction (0..1ish) does it imply? Used so editing one
    field can drive the other four via the same shared curve."""
    base = BASELINE[signal][0]
    target = FAILURE_TARGETS[signal]
    if target == base:
        return 0.0
    return (value - base) / (target - base)
