"""
API layer for the reliability dashboard.

Replaces the earlier Streamlit prototype, still in git history, no
longer in the working tree. See docs/ai-partnership-log.md for why.
Streamlit was the right call to validate the ML approach fast. Once
the detector was proven out, a real supervisor-facing tool needed an
actual API and frontend split instead of a script re-running top to
bottom on every click.

Run: uvicorn app.api:app --reload --port 8000
"""

import json
import sys
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.copilot import build_context, explain_anomaly

DATA_DIR = Path("data/synthetic")

app = FastAPI(title="Mills-Operation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache: dict = {}


def _load():
    if _cache:
        return _cache
    if not (DATA_DIR / "test_scored.csv").exists():
        raise RuntimeError(
            "No scored data. Run `python data/generate_synthetic_data.py && python -m app.evaluate` first."
        )
    test = pd.read_csv(DATA_DIR / "test_scored.csv", parse_dates=["timestamp", "failure_timestamp"])
    events = pd.read_csv(DATA_DIR / "failure_events.csv",
                          parse_dates=["failure_timestamp", "degrade_start_timestamp"])
    meta = json.loads((DATA_DIR / "model_meta.json").read_text())
    _cache.update(test=test, events=events, meta=meta)
    return _cache


def _stand_df(stand_id: str) -> pd.DataFrame:
    data = _load()
    df = data["test"][data["test"].stand_id == stand_id].sort_values("timestamp")
    if df.empty:
        raise HTTPException(404, f"Unknown stand: {stand_id}")
    return df


@app.get("/api/meta")
def get_meta():
    return _load()["meta"]


@app.get("/api/fleet")
def get_fleet():
    data = _load()
    stands = sorted(data["test"].stand_id.unique())
    out = []
    for sid in stands:
        df = _stand_df(sid)
        latest = df.iloc[-1]
        out.append({
            "standId": sid,
            "latestScore": round(float(latest.anomaly_score), 4),
            "isAlerting": bool(latest.is_alert),
        })
    return out


@app.get("/api/stands/{stand_id}/timeseries")
def get_timeseries(stand_id: str):
    df = _stand_df(stand_id)
    cols = ["timestamp", "vibration_rms_mm_s", "bearing_temp_c", "motor_current_a",
            "line_speed_mpm", "coolant_pressure_psi", "anomaly_score", "is_alert"]
    out = df[cols].copy()
    out["timestamp"] = out["timestamp"].astype(str)
    return out.to_dict(orient="records")


@app.get("/api/stands/{stand_id}/summary")
def get_summary(stand_id: str):
    data = _load()
    df = _stand_df(stand_id)
    latest = df.iloc[-1]
    alerts = df[df.is_alert]
    window_start, window_end = df.timestamp.min(), df.timestamp.max()
    ground_truth = data["events"][
        (data["events"].stand_id == stand_id)
        & (data["events"].failure_timestamp >= window_start)
        & (data["events"].failure_timestamp <= window_end)
    ]
    return {
        "standId": stand_id,
        "latestScore": round(float(latest.anomaly_score), 4),
        "alertThreshold": round(float(data["meta"]["alert_threshold"]), 4),
        "isAlerting": bool(latest.is_alert),
        "firstAlertAt": str(alerts.timestamp.min()) if not alerts.empty else None,
        "groundTruthFailures": [str(ts) for ts in ground_truth.failure_timestamp],
    }


class ExplainResponse(BaseModel):
    explanation: str
    source: str  # "live" | "fallback"


@app.post("/api/stands/{stand_id}/explain", response_model=ExplainResponse)
def explain(stand_id: str):
    data = _load()
    df = _stand_df(stand_id)
    latest = df.iloc[-1]
    ctx = build_context(
        df, float(latest.anomaly_score), float(data["meta"]["alert_threshold"]),
        bool(latest.is_alert), data["meta"]["baseline_stats"],
    )
    text = explain_anomaly(ctx)
    source = "fallback" if text.startswith("_[offline fallback") else "live"
    return ExplainResponse(explanation=text, source=source)
