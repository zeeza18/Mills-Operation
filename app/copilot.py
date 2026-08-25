"""
AI copilot layer: takes a flagged anomaly's recent sensor context and
explains, in plain language, what's actually going on and what a shift
supervisor should probably do about it.

Calls Claude (Haiku 4.5, this doesn't need heavy reasoning, just fast,
grounded language over numbers already computed by the detector). Falls
back to a deterministic rule-based explanation if no API key is
configured or the call fails, so the dashboard never breaks because of
it. A supervisor tool degrading to "no AI explanation, but the numbers
are still right there" is a survivable failure; the demo silently
crashing on a network blip is not. See docs/ai-partnership-log.md for
where this fallback earned its keep, and docs/security-risk.md for why
a human still makes the actual call either way. This layer explains
and suggests, it never decides.
"""

import os
from dataclasses import dataclass

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 300

SIGNAL_LABELS = {
    "vibration_rms_mm_s": "vibration",
    "bearing_temp_c": "bearing temperature",
    "motor_current_a": "motor current",
    "line_speed_mpm": "line speed",
    "coolant_pressure_psi": "coolant pressure",
}


@dataclass
class AnomalyContext:
    stand_id: str
    anomaly_score: float
    alert_threshold: float
    is_alert: bool
    signal_deviations: list  # [(label, raw_value, z_score), ...] sorted by |z| desc


def build_context(stand_df: pd.DataFrame, anomaly_score: float, alert_threshold: float,
                   is_alert: bool, baseline_stats: dict) -> AnomalyContext:
    """Turns the latest row for a stand into a ranked list of 'which signals
    are actually driving this anomaly score', measured against each signal's
    stable whole-training-period mean/std (baseline_stats, from model_meta.json),
    not the fast 60-min rolling mean used for detection features.

    First version compared against the rolling mean instead, and it produced a
    real, wrong-sounding explanation: coolant pressure was crashing toward
    failure but read as "above its recent normal" because the rolling window
    itself was mid-collapse, so a noisy uptick within the drop looked like a
    positive deviation. The number wasn't hallucinated, the framing was just
    misleading. Fixed by comparing against a normal baseline that doesn't move
    during the fault it's supposed to be measuring against."""
    latest = stand_df.iloc[-1]
    deviations = []
    for col, label in SIGNAL_LABELS.items():
        stats = baseline_stats.get(col, {})
        mean, std = stats.get("mean"), stats.get("std")
        raw = latest.get(col)
        z = (raw - mean) / std if std and std > 1e-6 else 0.0
        deviations.append((label, raw, z))
    deviations.sort(key=lambda d: abs(d[2]), reverse=True)

    return AnomalyContext(
        stand_id=latest.stand_id,
        anomaly_score=anomaly_score,
        alert_threshold=alert_threshold,
        is_alert=bool(is_alert),
        signal_deviations=deviations,
    )


def _fallback_explanation(ctx: AnomalyContext, reason: str = "no API key configured") -> str:
    top = ctx.signal_deviations[:2]
    lines = [f"_[offline fallback: {reason}]_",
             f"**{ctx.stand_id}**: anomaly score {ctx.anomaly_score:.2f} (threshold {ctx.alert_threshold:.2f})"]
    for label, raw, z in top:
        direction = "above" if z > 0 else "below"
        lines.append(f"- {label} is {abs(z):.1f} std devs {direction} its normal operating baseline (currently {raw:.2f})")
    if ctx.is_alert:
        lines.append("Recommend flagging this stand for inspection before the next run.")
    else:
        lines.append("No sustained alert. Within normal variation for now.")
    return "\n".join(lines)


def _build_prompt(ctx: AnomalyContext) -> str:
    signal_lines = "\n".join(
        f"- {label}: current {raw:.2f}, {abs(z):.1f} std devs {'above' if z > 0 else 'below'} its normal operating baseline"
        for label, raw, z in ctx.signal_deviations
    )
    status = "ALERTING" if ctx.is_alert else "not currently alerting"

    return f"""You're a reliability copilot for a shift supervisor on a hot steel mill line, looking at {ctx.stand_id}.

Anomaly score: {ctx.anomaly_score:.3f} (alert threshold: {ctx.alert_threshold:.3f}, {status})

Signal deviations from this stand's own recent normal, ranked by magnitude:
{signal_lines}

This detector watches specifically for roll stand bearing degradation: rising vibration/temperature/motor current, falling coolant pressure, and reduced line speed (operators throttling back) as symptoms.

In 3-4 sentences: explain in plain language what's likely happening (or that it looks fine), and give one concrete, specific recommendation for what the supervisor should do next. Do not invent sensor readings, timestamps, or history you weren't given here. If the pattern doesn't clearly match a developing bearing fault, say so plainly instead of forcing an explanation onto it."""


def explain_anomaly(ctx: AnomalyContext) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return _fallback_explanation(ctx, reason="no API key configured")

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": _build_prompt(ctx)}],
        )
        return response.content[0].text
    except Exception as e:
        return _fallback_explanation(ctx, reason=f"live call failed ({e})")
