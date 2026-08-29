"""
Deterministic query functions the fleet copilot can call as tools, plus
their Claude tool-use schemas.

This is the retrieval half of "RAG for structured data." Vector search
solves a problem that doesn't exist here (a text corpus too big to fit in
context); dumping the whole fleet's history into every prompt instead
works but wastes tokens and makes it easy for an unrelated number to leak
into an unrelated answer. Tool use is the middle path: Claude picks which
of these narrow, real functions to call based on the actual question,
gets back only the numbers relevant to answering it, and every number it
sees came straight out of computed data, never invented.
"""

import pandas as pd

from app import historical, live_feed, model_store
from app.timeseries_utils import alert_bands

SIGNAL_LABELS = {
    "vibration_rms_mm_s": "vibration (mm/s RMS)",
    "bearing_temp_c": "bearing temperature (deg C)",
    "motor_current_a": "motor current (A)",
    "line_speed_mpm": "line speed (m/min)",
    "coolant_pressure_psi": "coolant pressure (psi)",
}
DEFAULT_HISTORY_DAYS = 30


def _latest_row(stand_id: str):
    scored = live_feed.get_scored()
    rows = scored[scored.stand_id == stand_id]
    if rows.empty:
        return None
    return rows.iloc[-1]


def _recent_stand_history(stand_id: str, days: int) -> pd.DataFrame:
    hist = historical.get_scored()
    live = live_feed.get_scored()
    combined = pd.concat([hist, live], ignore_index=True)
    combined = combined[combined.stand_id == stand_id]
    cutoff = pd.Timestamp.now() - pd.Timedelta(days=days)
    return combined[combined.timestamp >= cutoff].sort_values("timestamp")


def get_current_reading(stand_id: str) -> dict:
    row = _latest_row(stand_id)
    if row is None:
        return {"error": f"no data for {stand_id}"}
    return {
        "standId": stand_id,
        "timestamp": str(row.timestamp),
        "isAlerting": bool(row.is_alert),
        "anomalyScore": round(float(row.anomaly_score), 4),
        **{col: round(float(row[col]), 3) for col in SIGNAL_LABELS},
    }


def get_all_current_readings() -> list[dict]:
    return [get_current_reading(sid) for sid in live_feed.STAND_IDS]


def get_last_alert(stand_id: str) -> dict:
    history = _recent_stand_history(stand_id, DEFAULT_HISTORY_DAYS)
    if history.empty:
        return {"standId": stand_id, "lastAlertEnded": None, "note": "no recent data for this stand"}
    episodes = alert_bands(history[["timestamp", "is_alert"]])
    if not episodes:
        return {"standId": stand_id, "lastAlertEnded": None,
                "note": f"no alert episodes in the last {DEFAULT_HISTORY_DAYS} days"}
    return {"standId": stand_id, "lastAlertStart": episodes[-1]["start"], "lastAlertEnded": episodes[-1]["end"]}


def get_alert_frequency(stand_id: str, days: int = DEFAULT_HISTORY_DAYS) -> dict:
    history = _recent_stand_history(stand_id, days)
    if history.empty:
        return {"standId": stand_id, "episodeCount": 0, "perDay": 0.0, "windowDays": days}
    episodes = alert_bands(history[["timestamp", "is_alert"]])
    span_days = max(1, (history.timestamp.max() - history.timestamp.min()).total_seconds() / 86400)
    return {
        "standId": stand_id,
        "episodeCount": len(episodes),
        "windowDays": round(span_days, 1),
        "perDay": round(len(episodes) / span_days, 3),
    }


def get_recent_trend(stand_id: str, minutes: int = 30) -> dict:
    """Whether the anomaly score has actually been rising, falling, or
    holding flat over a recent window. A single current score is a
    snapshot, not a trajectory: two stands sitting at the exact same score
    right now can be headed in opposite directions, and only this can
    tell them apart."""
    scored = live_feed.get_scored()
    rows = scored[scored.stand_id == stand_id].sort_values("timestamp")
    if rows.empty:
        return {"error": f"no data for {stand_id}"}

    cutoff = rows.timestamp.max() - pd.Timedelta(minutes=minutes)
    window = rows[rows.timestamp >= cutoff]
    if len(window) < 4:
        return {"standId": stand_id, "note": "not enough recent data to assess a trend"}

    half = len(window) // 2
    first_half_avg = float(window.anomaly_score.iloc[:half].mean())
    second_half_avg = float(window.anomaly_score.iloc[half:].mean())
    change = second_half_avg - first_half_avg
    direction = "rising" if change > 0.05 else "falling" if change < -0.05 else "flat"

    return {
        "standId": stand_id,
        "windowMinutes": minutes,
        "trend": direction,
        "anomalyScoreChangeOverWindow": round(change, 4),
        "currentAnomalyScore": round(float(window.anomaly_score.iloc[-1]), 4),
    }


def get_alert_cause(stand_id: str) -> dict:
    row = _latest_row(stand_id)
    if row is None:
        return {"error": f"no data for {stand_id}"}
    baseline_stats = model_store.get_baseline_stats()
    best_label, best_col, best_z = None, None, 0.0
    for col, label in SIGNAL_LABELS.items():
        stats = baseline_stats.get(col, {})
        mean, std = stats.get("mean"), stats.get("std")
        raw = row.get(col)
        z = (raw - mean) / std if std and std > 1e-6 else 0.0
        if abs(z) > abs(best_z):
            best_label, best_col, best_z = label, col, z
    return {
        "standId": stand_id,
        "topSignal": best_label,
        "currentValue": round(float(row[best_col]), 3) if best_col else None,
        "stdDevsFromBaseline": round(best_z, 2),
        "isAlerting": bool(row.is_alert),
    }


TOOLS = [
    {
        "name": "get_current_reading",
        "description": "Latest sensor values, anomaly score, and alert status for one specific roll stand.",
        "input_schema": {
            "type": "object",
            "properties": {"stand_id": {"type": "string", "description": "e.g. STAND-01"}},
            "required": ["stand_id"],
        },
    },
    {
        "name": "get_all_current_readings",
        "description": "Latest sensor values, anomaly score, and alert status for ALL 6 roll stands at once. "
                        "Use this for fleet-wide questions like which stand is alerting or which has the "
                        "highest value of some signal right now.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_last_alert",
        "description": "When a given stand's most recent alert episode started and ended, looking back up to 30 days.",
        "input_schema": {
            "type": "object",
            "properties": {"stand_id": {"type": "string"}},
            "required": ["stand_id"],
        },
    },
    {
        "name": "get_alert_frequency",
        "description": "How many separate alert episodes a stand has had recently, and the average rate per day.",
        "input_schema": {
            "type": "object",
            "properties": {
                "stand_id": {"type": "string"},
                "days": {"type": "integer", "description": "lookback window in days, default 30"},
            },
            "required": ["stand_id"],
        },
    },
    {
        "name": "get_recent_trend",
        "description": "Whether a stand's anomaly score has been rising, falling, or flat over a recent "
                        "window. Call this before answering any question about which stand is likely to "
                        "alert soon, is getting worse, or is trending toward trouble. A stand's current "
                        "score alone does not say which direction it is headed; a score close to the "
                        "threshold but flat or falling is not the same risk as a lower score that is "
                        "climbing fast.",
        "input_schema": {
            "type": "object",
            "properties": {
                "stand_id": {"type": "string"},
                "minutes": {"type": "integer", "description": "lookback window in minutes, default 30"},
            },
            "required": ["stand_id"],
        },
    },
    {
        "name": "get_alert_cause",
        "description": "Which single sensor is most responsible for a stand's current anomaly score "
                        "(the largest deviation from that stand's own normal baseline).",
        "input_schema": {
            "type": "object",
            "properties": {"stand_id": {"type": "string"}},
            "required": ["stand_id"],
        },
    },
]

DISPATCH = {
    "get_current_reading": lambda args: get_current_reading(args["stand_id"]),
    "get_all_current_readings": lambda args: get_all_current_readings(),
    "get_last_alert": lambda args: get_last_alert(args["stand_id"]),
    "get_alert_frequency": lambda args: get_alert_frequency(args["stand_id"], args.get("days", DEFAULT_HISTORY_DAYS)),
    "get_recent_trend": lambda args: get_recent_trend(args["stand_id"], args.get("minutes", 30)),
    "get_alert_cause": lambda args: get_alert_cause(args["stand_id"]),
}
