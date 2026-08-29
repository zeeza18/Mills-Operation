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

import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import historical, live_feed, model_store, simulator
from app.copilot import answer_fleet_question, build_context, explain_anomaly
from app.features import SIGNAL_COLUMNS
from app.timeseries_utils import alert_bands, downsample

DATA_DIR = Path("data/synthetic")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Backfills the historical synthetic dataset if it's more than a day
    # stale (e.g. the app sat closed over a weekend), so there's never a
    # visible gap between wherever it left off and today's live feed. Fast
    # (a few seconds, no model training) and usually a no-op.
    historical.ensure_fresh()
    task = asyncio.create_task(live_feed.run_forever())
    yield
    task.cancel()


app = FastAPI(title="Mills-Operation API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",  # npm run preview, for checking the prod build locally
    ],
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
            "vibration_rms_mm_s": round(float(latest.vibration_rms_mm_s), 3),
            "bearing_temp_c": round(float(latest.bearing_temp_c), 3),
            "motor_current_a": round(float(latest.motor_current_a), 3),
            "line_speed_mpm": round(float(latest.line_speed_mpm), 3),
            "coolant_pressure_psi": round(float(latest.coolant_pressure_psi), 3),
        })
    return out


@app.get("/api/stands/{stand_id}/timeseries")
def get_timeseries(stand_id: str):
    df = _stand_df(stand_id)
    cols = ["timestamp", "vibration_rms_mm_s", "bearing_temp_c", "motor_current_a",
            "line_speed_mpm", "coolant_pressure_psi", "anomaly_score", "is_alert"]

    # Alert bands are computed from the FULL, undownsampled series (so a short
    # flagged stretch is never lost to sampling), collapsed to a handful of
    # {start, end} ranges. The chart draws these as a few shaded rectangles
    # instead of a marker per alerted minute. That used to be a Scatter point
    # per alerted row: harmless when alerts were short, but the detector swap
    # from IsolationForest to LocalOutlierFactor made alerts run much longer
    # (median lead time went from under an hour to about 9 hours), so a
    # single stand's test window can carry 1,000+ alerted minutes. That many
    # individual Recharts Scatter points (each its own SVG element with its
    # own hover handling) took several seconds to render per chart. A few
    # rectangles render instantly and are clearer to read besides: a solid
    # band beats a smear of overlapping dots for showing "the alert was on
    # through this whole stretch."
    bands = alert_bands(df[["timestamp", "is_alert"]])

    points = downsample(df[cols], target_points=400)
    points["timestamp"] = points["timestamp"].astype(str)
    return {
        "points": points.drop(columns=["is_alert"]).to_dict(orient="records"),
        "alertBands": bands,
    }


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


@app.get("/api/live/fleet")
def get_live_fleet():
    """Same shape as /api/fleet, sourced from the live feed's in-memory
    buffer (see app/live_feed.py) instead of the static test_scored.csv."""
    scored = live_feed.get_scored()
    out = []
    for sid in live_feed.STAND_IDS:
        df = scored[scored.stand_id == sid].sort_values("timestamp")
        if df.empty:
            continue
        latest = df.iloc[-1]
        out.append({
            "standId": sid,
            "latestScore": round(float(latest.anomaly_score), 4),
            "isAlerting": bool(latest.is_alert),
            "vibration_rms_mm_s": round(float(latest.vibration_rms_mm_s), 3),
            "bearing_temp_c": round(float(latest.bearing_temp_c), 3),
            "motor_current_a": round(float(latest.motor_current_a), 3),
            "line_speed_mpm": round(float(latest.line_speed_mpm), 3),
            "coolant_pressure_psi": round(float(latest.coolant_pressure_psi), 3),
        })
    return out


@app.get("/api/live/data-bounds")
def get_data_bounds():
    """Earliest date the custom range picker should allow. The historical
    set is a rolling window (regenerated to end yesterday, see
    historical.ensure_fresh), not a fixed calendar date, so the frontend
    can't just hardcode this."""
    hist_min, _ = historical.get_date_bounds()
    return {"minDate": hist_min.strftime("%Y-%m-%d")}


@app.get("/api/live/stands/{stand_id}/timeseries")
def get_live_timeseries(stand_id: str, start: str | None = None, end: str | None = None):
    live_df = live_feed.get_scored()
    live_df = live_df[live_df.stand_id == stand_id]

    # No range given: the original behavior, just whatever's in the live
    # buffer (last few hours). A range given pulls in the full historical
    # scored dataset too, so a range reaching back to Jan 2026 can show the
    # original training-period incidents on the same timeline as today.
    if start or end:
        # "Today"/"past week"/"past month" are always anchored to the real
        # current date, which is months past the historical set's own date
        # range, so they never actually overlap it. Only a range reaching
        # back into it (e.g. "Jan 2026 to today") pays for loading and
        # scoring the full 45-day set.
        hist_min, hist_max = historical.get_date_bounds()
        # Every timestamp in this app is naive local wall-clock time, never
        # tz-aware. Comparing a naive and an aware Timestamp raises, so any
        # tz info on an incoming param (e.g. a stray "Z") gets dropped
        # rather than trusted, instead of 500ing on a client quirk.
        start_ts = pd.Timestamp(start).tz_localize(None) if start else None
        end_ts = pd.Timestamp(end).tz_localize(None) if end else None
        needs_historical = (start_ts is None or start_ts <= hist_max) and (end_ts is None or end_ts >= hist_min)
        if needs_historical:
            hist_df = historical.get_scored()
            hist_df = hist_df[hist_df.stand_id == stand_id]
            df = pd.concat([hist_df, live_df], ignore_index=True)
        else:
            df = live_df
        if start_ts is not None:
            df = df[df.timestamp >= start_ts]
        if end_ts is not None:
            df = df[df.timestamp <= end_ts]
    else:
        df = live_df

    df = df.sort_values("timestamp")
    if df.empty:
        raise HTTPException(404, f"No data for {stand_id} in that range")
    cols = ["timestamp", "vibration_rms_mm_s", "bearing_temp_c", "motor_current_a",
            "line_speed_mpm", "coolant_pressure_psi", "anomaly_score", "is_alert"]
    bands = alert_bands(df[["timestamp", "is_alert"]])
    points = downsample(df[cols], target_points=400)
    points["timestamp"] = points["timestamp"].astype(str)
    return {
        "points": points.drop(columns=["is_alert"]).to_dict(orient="records"),
        "alertBands": bands,
    }


@app.get("/api/live/stands/{stand_id}/summary")
def get_live_summary(stand_id: str):
    scored = live_feed.get_scored()
    df = scored[scored.stand_id == stand_id].sort_values("timestamp")
    if df.empty:
        raise HTTPException(404, f"Unknown stand: {stand_id}")
    latest = df.iloc[-1]
    alerts = df[df.is_alert]
    return {
        "standId": stand_id,
        "latestScore": round(float(latest.anomaly_score), 4),
        "alertThreshold": round(model_store.get_meta()["alert_threshold"], 4),
        "isAlerting": bool(latest.is_alert),
        "firstAlertAt": str(alerts.timestamp.min()) if not alerts.empty else None,
        # Real time monitoring doesn't get an oracle answer key: unlike the
        # static held-out test tab, there's no "ground truth failure" list
        # here, only what the model itself has flagged so far.
        "groundTruthFailures": [],
    }


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AskRequest(BaseModel):
    messages: list[ChatMessage]


class AskResponse(BaseModel):
    answer: str
    source: str  # "live" | "fallback"


@app.post("/api/live/ask", response_model=AskResponse)
def ask_fleet(req: AskRequest):
    history = [{"role": m.role, "content": m.content} for m in req.messages]
    text = answer_fleet_question(history)
    source = "fallback" if text.startswith("_[offline fallback") or text.startswith("_[gave up") else "live"
    return AskResponse(answer=text, source=source)


class CorrelateRequest(BaseModel):
    signal: str
    value: float


class DegradeStartRequest(BaseModel):
    values: dict[str, float]
    durationMinutes: int


@app.get("/api/simulator/state")
def simulator_state():
    return {
        "values": simulator.current_values(),
        "alertThreshold": round(model_store.get_meta()["alert_threshold"], 4),
    }


@app.post("/api/simulator/correlate")
def simulator_correlate(req: CorrelateRequest):
    if req.signal not in SIGNAL_COLUMNS:
        raise HTTPException(400, f"Unknown signal: {req.signal}")
    return simulator.correlate(req.signal, req.value)


@app.post("/api/simulator/degrade/start")
def simulator_degrade_start(req: DegradeStartRequest):
    simulator.start_degrade(req.values, req.durationMinutes)
    return {"ok": True}


@app.post("/api/simulator/degrade/tick")
def simulator_degrade_tick():
    try:
        return simulator.tick_degrade()
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.post("/api/simulator/reset")
def simulator_reset():
    simulator.reset()
    return {
        "values": simulator.current_values(),
        "alertThreshold": round(model_store.get_meta()["alert_threshold"], 4),
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


@app.post("/api/live/stands/{stand_id}/explain", response_model=ExplainResponse)
def explain_live(stand_id: str):
    scored = live_feed.get_scored()
    df = scored[scored.stand_id == stand_id].sort_values("timestamp")
    if df.empty:
        raise HTTPException(404, f"Unknown stand: {stand_id}")
    latest = df.iloc[-1]
    meta = model_store.get_meta()
    ctx = build_context(
        df, float(latest.anomaly_score), float(meta["alert_threshold"]),
        bool(latest.is_alert), meta["baseline_stats"],
    )
    text = explain_anomaly(ctx)
    source = "fallback" if text.startswith("_[offline fallback") else "live"
    return ExplainResponse(explanation=text, source=source)
