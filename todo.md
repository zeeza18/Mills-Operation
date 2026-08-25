# Mills-Operation Task Checklist

Reference docs: [`assessment.md`](assessment.md) (the take-home spec) and [`job_description.md`](job_description.md) (the actual role, build and document everything with an eye on both).

No day-by-day pacing, work through this in whatever order and speed makes sense. Order below is dependency order (top items unblock the ones below), not a schedule.

---

## 0. Repo & Environment Setup

- [x] Repo synced to `https://github.com/zeeza18/Mills-Operation.git`
- [x] Folder structure created: `/app`, `/web`, `/tests`, `/docs`, `/data`
- [x] `README.md` at repo root (Deliverable 2 requirement, must explain how to run it)
- [x] `.gitignore` set up (Node/Playwright artifacts, and confidential prompt files excluded per assessment.md's own confidentiality clause since the repo is public)
- [x] CI/CD target decided: GitHub Actions (documented as the accessible stand-in for Azure DevOps in the stack justification)
- [ ] Confirm exact due date once sent, note it here: `___________`

## 1. Problem Framing (Deliverable 3 groundwork, Problem Framing is 20% of score)

- [x] Written problem statement in `docs/architecture.md`: shift supervisor, roll stand bearing degradation, "should I flag this stand for inspection" as the concrete decision
- [x] Explicit "what this does NOT do" list in `docs/architecture.md`
- [x] One paragraph on why Challenge 1 was chosen over Challenge 2/3, in `docs/architecture.md` (also matches the interview answer from earlier)

## 2. Architecture (Deliverable 3, Systems Thinking is 20% of score)

- [x] System diagram in `docs/architecture.md`: data source, feature pipeline, detector, alert logic, FastAPI backend, React frontend, AI copilot
- [x] Named real integration points even hypothetically: OSIsoft PI historian, SCADA/control-room screen
- [x] "What I considered and rejected": deep model vs. IsolationForest, streaming vs. batch, per-stand vs. global threshold, frequency-domain vs. rolling-stat features, Streamlit vs. React
- [x] "Where this breaks at Nucor scale": per-stand calibration, sensor vendor heterogeneity, model drift/retraining, alert fatigue, workflow integration

## 3. Data (Deliverable 6, feeds Data Strategy doc)

- [x] Decide and document exact synthetic/proxy dataset approach in `data/generate_synthetic_data.py`: 6 roll stands x 45 days x 5 signals, seeded and reproducible
- [x] Generate dataset with realistic failure-precursor patterns: non-linear degradation ramp (6-48h) into about 22% of stand-days, spot-checked
- [x] Document what real data this would need at Nucor (tag names, sampling rate, historian source), how you'd request access, who owns it, in `docs/data-strategy.md`
- [x] Note data quality angle explicitly in `docs/data-strategy.md`, tied explicitly to the JD's MDM anomaly-detection bullet

## 4. Core Build: Anomaly Detection Engine

- [x] Feature/signal processing pipeline in `app/features.py`: rolling 60-min mean/std plus 15-min rate-of-change per signal
- [x] Anomaly detection logic in `app/detector.py`: IsolationForest trained only on normal windows, time-based train/test split (`app/labels.py`)
- [x] Model evaluation in `app/evaluate.py`: 11/11 held-out test failures detected, median 91min lead time (up to 17h), 1.06% false-alarm rate. First threshold attempt (99.5th pct) caught 0/11, a real tuning story, captured for the AI partnership log.

## 5. Core Build: Web Interface

- [x] First working UI in Streamlit (`app/dashboard.py`), built to validate the ML approach fast. Retired after the React rebuild below; still in git history.
- [x] Rebuilt as a real application: FastAPI backend (`app/api.py`) serving scored data and proxying the copilot call, plus a React and TypeScript frontend (`web/`, Vite, Tailwind, Recharts)
- [x] Clean, professional dashboard look: fleet overview, per-stand detail with signal charts and alert overlays, status panel, copilot panel. Verified rendering in an actual browser with real data, not just curl.
- [x] Runnable locally: `uvicorn app.api:app --reload --port 8000` plus `npm run dev` in `web/`, documented in README

## 6. AI Copilot / Agentic Layer

- [x] Wired an AI layer in `app/copilot.py`, calls Claude Haiku 4.5, wired into the "Explain this stand's status" button (now in the React frontend), verified live end-to-end through the actual browser UI
- [x] Graceful fallback if no API key or the call fails: deterministic rule-based explanation, the app never hard-breaks because of the AI layer
- [x] Real "AI was confidently wrong" moment captured, not constructed: first version compared each signal to its own 60-min *rolling* mean, and the model correctly reported "coolant pressure is up" from that data. The rolling mean itself was mid-collapse during the fault, so a noisy uptick within a drop read as a positive deviation. The model wasn't wrong given what it was fed; the context was misleading. Fixed by comparing against a stable whole-training-period baseline instead (`model_meta.json:baseline_stats`). Written up in `docs/ai-partnership-log.md`.

## 7. Testing Automation Layer, Playwright (JD-alignment bonus, not required by assessment.md)

- [x] Playwright test suite in `tests/dashboard.spec.js`: loads plus fleet status, real detection numbers (not placeholders), per-stand charts render, copilot button produces a grounded response
- [x] AI-generated first draft, then actually run and fixed against real failures, not a constructed story. Found and fixed a genuine `ModuleNotFoundError` in the Streamlit-era dashboard (bare `streamlit run` doesn't add the repo root to sys.path; my own manual browser testing had masked this by using `python -m streamlit run` instead). After the React rebuild, found and fixed a second real issue: testing against Vite's dev server caused flaky timeouts from cold dependency bundling, fixed by testing the production build instead. Directly demonstrates the JD's "AI-powered testing automation agents that autonomously generate, execute, and evaluate test cases."
- [x] Wired into GitHub Actions in `.github/workflows/ci.yml`: generates data, trains and evaluates the model, builds both the backend and frontend, runs the full Playwright suite on every push/PR. Documented as the accessible stand-in for Azure DevOps in `docs/stack-justification.md`.
- [x] Note in the architecture doc about the CI/testing layer and what it caught, in `docs/architecture.md`

## 8. Documentation Deliverables (write once the build is stable)

- [x] **Deliverable 2**: README, how to run it, what it does, limitations, in `README.md`
- [x] **Deliverable 3**: Architecture and design doc (2-4 pages): diagram, decisions, rejected alternatives, break-at-scale, in `docs/architecture.md`
- [x] **Deliverable 4**: Stack justification (1 page): why this stack vs. building on C3.ai / Palantir Foundry, mentions the Playwright/CI choice too, in `docs/stack-justification.md`
- [x] **Deliverable 5**: AI Partnership Log (1-2 pages, the most important one): tools used and purpose, specific overrides and reasoning, confidently-wrong AI moments, what you'd never let AI decide alone, where it was 10x vs. where it slowed you down, in `docs/ai-partnership-log.md`
- [x] **Deliverable 6**: Data strategy (1 page): what data is needed, how simulated/sourced, what you'd ask Nucor's data team for, in `docs/data-strategy.md`
- [x] **Deliverable 7**: Security and risk assessment (1-2 pages): prompt injection, data leakage, hallucination in decision support, access control, audit trail, model deprecation, spot risks without needing to solve all, in `docs/security-risk.md`

## 9. Video (Deliverable 8)

- [ ] Script the 8-15 min walkthrough: problem, live demo, proudest decisions, what you'd redo, how a Nucor teammate takes this over
- [ ] Explicitly say on camera why Challenge 1 was picked over the other two
- [ ] Record (Loom or similar, camera on if possible)

## 10. Final Packaging

- [ ] All docs proofread, tight beats long
- [ ] Repo pushed and README verified from a clean clone
- [ ] Everything organized into clearly named folders, zipped or shared as one link
- [ ] Submit

## 11. Interview Prep (after submission, before the interview)

- [ ] Rehearse "why this challenge" answer out loud
- [ ] Be ready to name 3-5 AI overrides from memory, not just from the doc
- [ ] Be ready to connect specific build choices back to specific JD lines (agentic workflows, MDM/data quality, CI/CD, test automation) without sounding rehearsed
- [ ] One crisp, non-generic answer ready for "what would you never let AI decide alone"
