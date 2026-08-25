# Mills-Operation

AI-powered reliability copilot for mill operations. Anticipates unplanned downtime by detecting developing failure patterns in manufacturing signal data, and explains flagged anomalies in plain language for a shift supervisor.

Built as part of a take-home assignment, doubling as a demonstration project for AI-assisted test automation, ML-based anomaly detection over manufacturing-style process data, and agentic workflows.

## Status

Data pipeline, anomaly detection engine, FastAPI backend, React frontend, AI copilot layer, and Playwright test suite (wired into GitHub Actions) are all working end to end. See `todo.md` for the full task checklist.

## Structure

```
app/     anomaly detection engine + FastAPI backend
web/     React + TypeScript frontend
tests/   Playwright test suite
data/    synthetic/proxy dataset + generation scripts
docs/    architecture, stack justification, AI partnership log, data strategy, security & risk docs
```

## Running it

```bash
pip install -r requirements.txt

# 1. Generate the synthetic sensor dataset (deterministic, ~389K rows, takes a few seconds)
python data/generate_synthetic_data.py

# 2. Train the anomaly detector and score the held-out test window
python -m app.evaluate

# 3. Start the backend API
uvicorn app.api:app --reload --port 8000

# 4. In a second terminal, start the frontend
cd web
npm install
npm run dev
```

Step 2 prints detection results (failures caught, lead time, false-alarm rate) and writes
`data/synthetic/test_scored.csv` and `model_meta.json`, which the API serves. Run steps 1 and 2 once;
re-run step 2 any time you change `app/features.py` or `app/detector.py`. The frontend expects the API
at `http://localhost:8000` by default (override with `VITE_API_URL` in `web/.env.local`).

### AI copilot (optional)

The dashboard's "Explain this stand's status" button calls Claude to turn a flagged anomaly into a
plain-language explanation and recommendation. To enable it:

```bash
cp .env.example .env   # then put a real ANTHROPIC_API_KEY in .env
```

Without a key, the button still works. It falls back to a deterministic rule-based explanation
(same underlying signal-deviation data, just without the natural-language writeup), so the dashboard
never breaks because of a missing key or a network issue.

## Testing

```bash
npm install
npx playwright install --with-deps chromium
npx playwright test
```

Playwright builds and starts both the backend and the frontend itself (see `playwright.config.js`),
so just make sure steps 1 and 2 above have been run first so `data/synthetic/test_scored.csv` exists.
Runs automatically on every push and PR via `.github/workflows/ci.yml`.

## Known limitations

- One global anomaly threshold across all 6 stands, not per-stand calibration
- Batch scoring, not a live streaming pipeline
- Trained and evaluated entirely on synthetic data; see `docs/data-strategy.md` for what's unverified
- Targets one failure mode (roll stand bearing degradation) by design, not general downtime prediction

Full breakdown, including what this would take to fix at Nucor scale, in `docs/architecture.md`.

## Docs

- `docs/architecture.md`: system design, key decisions, what breaks at scale
- `docs/stack-justification.md`: why this stack
- `docs/ai-partnership-log.md`: how AI was used while building this, including overrides
- `docs/data-strategy.md`: data approach, what real data this would need in production
- `docs/security-risk.md`: risk assessment
