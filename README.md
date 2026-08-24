# Mills-Operation

AI-powered reliability copilot for mill operations — anticipates unplanned downtime by detecting developing failure patterns in manufacturing signal data, and explains flagged anomalies in plain language for a shift supervisor.

Built as part of a take-home assignment; doubling as a demonstration project for AI-assisted test automation, ML-based anomaly detection over manufacturing-style process data, and agentic workflows.

## Status

Data pipeline, anomaly detection engine, dashboard, and AI copilot layer are all working end to end. Playwright tests are next. See `todo.md` for the full task checklist.

## Structure

```
app/     — anomaly detection engine + web dashboard
tests/   — Playwright test suite for the dashboard
data/    — synthetic/proxy dataset + generation scripts
docs/    — architecture, stack justification, AI partnership log, data strategy, security & risk docs
```

## Running it

```bash
pip install -r requirements.txt

# 1. Generate the synthetic sensor dataset (deterministic, ~389K rows, takes a few seconds)
python data/generate_synthetic_data.py

# 2. Train the anomaly detector and score the held-out test window
python -m app.evaluate

# 3. Launch the dashboard
streamlit run app/dashboard.py
```

Step 2 prints detection results (failures caught, lead time, false-alarm rate) and writes
`data/synthetic/test_scored.csv` + `model_meta.json`, which the dashboard reads. Run 1 and 2 once;
re-run 2 any time you change `app/features.py` or `app/detector.py`.

### AI copilot (optional)

The dashboard's "Explain this stand's status" button calls Claude to turn a flagged anomaly into a
plain-language explanation + recommendation. To enable it:

```bash
cp .env.example .env   # then put a real ANTHROPIC_API_KEY in .env
```

Without a key, the button still works — it falls back to a deterministic rule-based explanation
(same underlying signal-deviation data, just without the natural-language writeup) so the dashboard
never breaks because of a missing key or a network issue.

## Docs

- `docs/architecture.md` — system design, key decisions, what breaks at scale
- `docs/stack-justification.md` — why this stack
- `docs/ai-partnership-log.md` — how AI was used while building this, including overrides
- `docs/data-strategy.md` — data approach, what real data this would need in production
- `docs/security-risk.md` — risk assessment
