"""
Shift-supervisor-facing dashboard.

Deliberately not fancy — a supervisor watching this during a shift
needs three things fast: which stand needs attention right now, why
the model thinks so, and how much warning they actually have. Everything
else is noise. Polish isn't scored on this assignment, but it has to be
usable enough to demo on camera, so I kept it to one screen, one flow.

Run: streamlit run app/dashboard.py
"""

import json
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from app.copilot import build_context, explain_anomaly

DATA_DIR = Path("data/synthetic")
SIGNAL_LABELS = {
    "vibration_rms_mm_s": "Vibration (RMS mm/s)",
    "bearing_temp_c": "Bearing Temp (°C)",
    "motor_current_a": "Motor Current (A)",
    "line_speed_mpm": "Line Speed (m/min)",
    "coolant_pressure_psi": "Coolant Pressure (psi)",
}

st.set_page_config(page_title="Mills-Operation — Reliability Copilot", layout="wide")


@st.cache_data
def load_data():
    test = pd.read_csv(DATA_DIR / "test_scored.csv", parse_dates=["timestamp", "failure_timestamp"])
    events = pd.read_csv(DATA_DIR / "failure_events.csv",
                          parse_dates=["failure_timestamp", "degrade_start_timestamp"])
    meta = json.loads((DATA_DIR / "model_meta.json").read_text())
    return test, events, meta


def stand_status(test: pd.DataFrame, stand_id: str) -> dict:
    stand = test[test.stand_id == stand_id].sort_values("timestamp")
    latest = stand.iloc[-1]
    recent_alerts = stand[stand.is_alert]
    return {
        "latest_score": latest.anomaly_score,
        "is_alerting": bool(latest.is_alert),
        "first_alert_ts": recent_alerts.timestamp.min() if not recent_alerts.empty else None,
        "row": latest,
    }


def main():
    if not (DATA_DIR / "test_scored.csv").exists():
        st.error("No scored data yet. Run `python -m app.evaluate` first to generate it.")
        st.stop()

    test, events, meta = load_data()
    stands = sorted(test.stand_id.unique())

    st.title("Mills-Operation — Reliability Copilot")
    st.caption(
        "Prototype for a hot mill shift supervisor. Flags roll stand bearing degradation before "
        "it becomes unplanned downtime. Model detail in docs/architecture.md."
    )

    # --- Fleet overview row ---
    st.subheader("Fleet status")
    cols = st.columns(len(stands))
    statuses = {sid: stand_status(test, sid) for sid in stands}
    for col, sid in zip(cols, stands):
        s = statuses[sid]
        with col:
            if s["is_alerting"]:
                st.error(f"**{sid}**\n\nALERT — score {s['latest_score']:.2f}")
            else:
                st.success(f"**{sid}**\n\nnormal — score {s['latest_score']:.2f}")

    st.divider()

    # --- Detail view for a selected stand ---
    default_idx = 0
    alerting_stands = [sid for sid, s in statuses.items() if s["is_alerting"]]
    if alerting_stands:
        default_idx = stands.index(alerting_stands[0])

    selected = st.selectbox("Inspect a stand", stands, index=default_idx)
    stand_df = test[test.stand_id == selected].sort_values("timestamp")

    left, right = st.columns([3, 1])

    with left:
        for signal, label in SIGNAL_LABELS.items():
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=stand_df.timestamp, y=stand_df[signal],
                mode="lines", name=label, line=dict(width=1.5),
            ))
            alert_points = stand_df[stand_df.is_alert]
            if not alert_points.empty:
                fig.add_trace(go.Scatter(
                    x=alert_points.timestamp, y=alert_points[signal],
                    mode="markers", name="alert", marker=dict(color="red", size=5),
                ))
            fig.update_layout(
                title=label, height=220, margin=dict(l=10, r=10, t=30, b=10),
                showlegend=False,
            )
            st.plotly_chart(fig, use_container_width=True)

    with right:
        st.markdown("### Status")
        s = statuses[selected]
        st.metric("Latest anomaly score", f"{s['latest_score']:.3f}")
        st.metric("Alert threshold", f"{meta['alert_threshold']:.3f}")
        if s["first_alert_ts"] is not None:
            st.metric("First alert", s["first_alert_ts"].strftime("%Y-%m-%d %H:%M"))

        st.markdown("### Model performance (held-out test)")
        st.metric("Failures detected", f"{meta['failures_detected']}/{meta['failures_in_test_window']}")
        st.metric("False alarm rate", f"{meta['false_positive_rate']:.2%}")

        window_start, window_end = stand_df.timestamp.min(), stand_df.timestamp.max()
        stand_events = events[
            (events.stand_id == selected)
            & (events.failure_timestamp >= window_start)
            & (events.failure_timestamp <= window_end)
        ]
        if not stand_events.empty:
            st.markdown("### Ground truth (this is synthetic data — shown for evaluation)")
            for _, ev in stand_events.iterrows():
                st.caption(f"Actual failure: {ev.failure_timestamp.strftime('%Y-%m-%d %H:%M')}")

        st.markdown("### Ask the copilot")
        cache_key = f"copilot_{selected}_{s['row'].timestamp}"
        if st.button("Explain this stand's status", key=f"btn_{cache_key}"):
            with st.spinner("Asking the copilot..."):
                ctx = build_context(
                    stand_df, s["latest_score"], meta["alert_threshold"],
                    s["is_alerting"], meta["baseline_stats"],
                )
                st.session_state[cache_key] = explain_anomaly(ctx)

        if cache_key in st.session_state:
            st.markdown(st.session_state[cache_key])


if __name__ == "__main__":
    main()
