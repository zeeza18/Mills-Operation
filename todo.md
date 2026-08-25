# Mills-Operation — Task Checklist

Reference docs: [`assessment.md`](assessment.md) (the take-home spec) and [`job_description.md`](job_description.md) (the actual role — build/document everything with an eye on both).

No day-by-day pacing — work through this in whatever order/speed makes sense. Order below is dependency order (top items unblock the ones below), not a schedule.

---

## 0. Repo & Environment Setup

- [x] Repo synced to `https://github.com/zeeza18/Mills-Operation.git`
- [x] Folder structure created: `/app`, `/tests`, `/docs`, `/data`
- [x] `README.md` at repo root (Deliverable 2 requirement — must explain how to run it)
- [x] `.gitignore` set up (Node/Playwright artifacts, and confidential prompt files excluded per assessment.md's own confidentiality clause — repo is public)
- [x] CI/CD target decided: GitHub Actions (documented as the accessible stand-in for Azure DevOps in the stack justification)
- [ ] Confirm exact due date once sent, note it here: `___________`

## 1. Problem Framing (Deliverable 3 groundwork — Problem Framing = 20% of score)

- [x] Written problem statement — `docs/architecture.md`: shift supervisor, roll stand bearing degradation, "should I flag this stand for inspection" as the concrete decision
- [x] Explicit "what this does NOT do" list — `docs/architecture.md`
- [x] One paragraph: why Challenge 1 was chosen over Challenge 2/3 — `docs/architecture.md` (also matches the interview answer from earlier)

## 2. Architecture (Deliverable 3 — Systems Thinking = 20% of score)

- [x] System diagram — `docs/architecture.md`: data source → feature pipeline → detector → alert logic → dashboard + AI copilot
- [x] Named real integration points even hypothetically — OSIsoft PI historian, SCADA/control-room screen
- [x] "What I considered and rejected" — deep model vs. IsolationForest, streaming vs. batch, per-stand vs. global threshold, frequency-domain vs. rolling-stat features
- [x] "Where this breaks at Nucor scale" — per-stand calibration, sensor vendor heterogeneity, model drift/retraining, alert fatigue, workflow integration

## 3. Data (Deliverable 6 — feeds Data Strategy doc)

- [x] Decide + document exact synthetic/proxy dataset approach — `data/generate_synthetic_data.py`, 6 roll stands x 45 days x 5 signals, seeded/reproducible
- [x] Generate dataset with realistic failure-precursor patterns — non-linear degradation ramp (6-48h) into ~22% of stand-days, spot-checked
- [x] Document: what real data this would need at Nucor (tag names, sampling rate, historian source), how you'd request access, who owns it — `docs/data-strategy.md`
- [x] Note data quality angle explicitly — `docs/data-strategy.md`, tied explicitly to the JD's MDM anomaly-detection bullet

## 4. Core Build — Anomaly Detection Engine

- [x] Feature/signal processing pipeline — `app/features.py`: rolling 60-min mean/std + 15-min rate-of-change per signal
- [x] Anomaly detection logic — `app/detector.py`: IsolationForest trained only on normal windows, time-based train/test split (`app/labels.py`)
- [x] Model evaluation — `app/evaluate.py`: 11/11 held-out test failures detected, median 91min lead time (up to 17h), 1.06% false-alarm rate. First threshold attempt (99.5th pct) caught 0/11 — real tuning story, captured for the AI partnership log.

## 5. Core Build — Web Dashboard

- [x] Live-style signal view (charts) + anomaly flags + timeline, for the shift supervisor persona — `app/dashboard.py` (Streamlit + Plotly)
- [x] Clean enough to demo on camera — fleet overview + per-stand detail view, verified rendering in an actual browser (not just curl), fixed a real bug found while checking (ground-truth failure list leaked events outside the visible chart window)
- [x] Runnable locally with one command — `streamlit run app/dashboard.py`, documented in README

## 6. AI Copilot / Agentic Layer

- [x] Wire an AI layer — `app/copilot.py`, calls Claude Haiku 4.5, wired into the dashboard's "Explain this stand's status" button, verified live end-to-end through the actual browser UI
- [x] Graceful fallback if no API key / call fails — deterministic rule-based explanation, dashboard never hard-breaks because of the AI layer
- [x] Real "AI was confidently wrong" moment captured, not constructed: first version compared each signal to its own 60-min *rolling* mean, and the model correctly reported "coolant pressure is up" from that data — except the rolling mean itself was mid-collapse during the fault, so a noisy uptick within a drop read as a positive deviation. The model wasn't wrong given what I fed it; the context I built was misleading. Fixed by comparing against a stable whole-training-period baseline instead (`model_meta.json:baseline_stats`). This is Deliverable 5 material — write it up properly in `docs/ai-partnership-log.md`.

## 7. Testing Automation Layer — Playwright (JD-alignment bonus, not required by assessment.md)

- [x] Playwright test suite — `tests/dashboard.spec.js`: loads + fleet status, real detection numbers (not placeholders), per-stand charts render, copilot button produces a grounded response
- [x] AI-generated first draft, then actually run and fixed against real failures — not a constructed story: found and fixed a genuine `ModuleNotFoundError` in `app/dashboard.py` (bare `streamlit run` doesn't add the repo root to sys.path; my own manual browser testing had masked this by using `python -m streamlit run` instead), plus bumped a too-tight default assertion timeout once real Streamlit cold-start latency showed up. Directly demonstrates the JD's "AI-powered testing automation agents that autonomously generate, execute, and evaluate test cases."
- [x] Wired into GitHub Actions — `.github/workflows/ci.yml`: generates data, trains+evaluates the model, runs the full Playwright suite on every push/PR. Documented as the accessible stand-in for Azure DevOps in `docs/stack-justification.md`.
- [x] Note in the architecture doc about the CI/testing layer and what it caught — `docs/architecture.md`

## 8. Documentation Deliverables (write once the build is stable)

- [x] **Deliverable 2** — README: how to run it, what it does, limitations — `README.md`
- [x] **Deliverable 3** — Architecture & design doc (2-4 pages): diagram, decisions, rejected alternatives, break-at-scale — `docs/architecture.md`
- [x] **Deliverable 4** — Stack justification (1 page): why this stack vs. building on C3.ai / Palantir Foundry; mention the Playwright/CI choice here too — `docs/stack-justification.md`
- [x] **Deliverable 5** — AI Partnership Log (1-2 pages, the most important one): tools used + purpose, 3-5 specific overrides + reasoning, 1-2 confidently-wrong AI moments, what you'd never let AI decide alone, where it was 10x vs. where it slowed you down — `docs/ai-partnership-log.md`
- [x] **Deliverable 6** — Data strategy (1 page): what data is needed, how simulated/sourced, what you'd ask Nucor's data team for — `docs/data-strategy.md`
- [x] **Deliverable 7** — Security & risk assessment (1-2 pages): prompt injection, data leakage, hallucination in decision support, access control, audit trail, model deprecation — spot risks, don't need to solve all — `docs/security-risk.md`

## 9. Video (Deliverable 8)

- [ ] Script the 8-15 min walkthrough: problem → live demo → proudest decisions → what you'd redo → how a Nucor teammate takes this over
- [ ] Explicitly say on camera why Challenge 1 was picked over the other two
- [ ] Record (Loom or similar, camera on if possible)

## 10. Final Packaging

- [ ] All docs proofread — tight beats long
- [ ] Repo pushed and README verified from a clean clone
- [ ] Everything organized into clearly named folders, zipped or shared as one link
- [ ] Submit

## 11. Interview Prep (after submission, before the interview)

- [ ] Rehearse "why this challenge" answer out loud
- [ ] Be ready to name 3-5 AI overrides from memory, not just from the doc
- [ ] Be ready to connect specific build choices back to specific JD lines (agentic workflows, MDM/data quality, CI/CD, test automation) without sounding rehearsed
- [ ] One crisp, non-generic answer ready for "what would you never let AI decide alone"
