# Mills-Operation — Task Checklist

Reference docs: [`assessment.md`](assessment.md) (the take-home spec) and [`job_description.md`](job_description.md) (the actual role — build/document everything with an eye on both).

No day-by-day pacing — work through this in whatever order/speed makes sense. Order below is dependency order (top items unblock the ones below), not a schedule.

---

## 0. Repo & Environment Setup

- [ ] Repo synced to `https://github.com/zeeza18/Mills-Operation.git`
- [ ] Folder structure created: `/app` (or `/src`), `/tests`, `/docs`, `/data`
- [ ] `README.md` at repo root (Deliverable 2 requirement — must explain how to run it)
- [ ] `.gitignore` set up (venv, node_modules, data caches, `.env`)
- [ ] Confirm exact due date once sent, note it here: `___________`

## 1. Problem Framing (Deliverable 3 groundwork — Problem Framing = 20% of score)

- [ ] Written problem statement: exact user (shift supervisor? reliability engineer? both?), exact failure mode targeted (e.g. roll bearing wear, motor overheating — pick ONE, narrow beats generic), exact decision the tool speeds up
- [ ] Explicit "what this does NOT do" list — assessment.md rewards knowing what to leave out
- [ ] One paragraph: why Challenge 1 was chosen over Challenge 2/3 (this becomes both an architecture-doc section AND the interview answer)

## 2. Architecture (Deliverable 3 — Systems Thinking = 20% of score)

- [ ] System diagram: data source → anomaly/ML pipeline → alert/agent layer → dashboard UI → (hypothetical) integration point back into Nucor systems
- [ ] Name real integration points even hypothetically: historian (OSIsoft PI), SCADA, MES — shows systems thinking beyond the toy prototype
- [ ] Explicit "what I considered and rejected" section (e.g. why not a full LSTM/deep model, why not real-time streaming infra for a prototype)
- [ ] Explicit "where this breaks at Nucor scale" section (multi-mill, multi-sensor-vendor, data volume, model retraining, alert fatigue across shifts)

## 3. Data (Deliverable 6 — feeds Data Strategy doc)

- [ ] Decide + document exact synthetic/proxy dataset approach (steel-mill-style signals seeded from a public predictive-maintenance dataset)
- [ ] Generate dataset with realistic failure-precursor patterns (gradual drift before failure, not just random noise)
- [ ] Document: what real data this would need at Nucor (tag names, sampling rate, historian source), how you'd request access, who owns it
- [ ] Note data quality angle explicitly — this is also a live JD theme (MDM/data quality), so call it out even briefly: what validation you'd want on this data if it were real (echoes the MDM anomaly-detection bullet)

## 4. Core Build — Anomaly Detection Engine

- [ ] Feature/signal processing pipeline (rolling stats, trend detection, etc.)
- [ ] Anomaly detection logic (start simple — thresholds/isolation forest — before anything fancier; document why)
- [ ] Model evaluation: false positive vs. missed-event tradeoff explicitly measured and discussed (this is a "Judgment with AI" and "Pragmatism" signal, not just an ML metric)

## 5. Core Build — Web Dashboard

- [ ] Live-style signal view (charts) + anomaly flags + timeline, for the shift supervisor persona
- [ ] Clean enough to demo on camera — polish is explicitly NOT scored, but it must be usable in the walkthrough video
- [ ] Deployed or at least reliably runnable locally with one command (README must make this trivial)

## 6. AI Copilot / Agentic Layer

- [ ] Wire an AI layer (Claude/GPT) that takes a flagged anomaly + recent context and explains it in plain language + suggests next action
- [ ] Explicitly log every override of the AI's output while building this (Deliverable 5 material — do this now, not retroactively)
- [ ] Capture at least 1-2 moments where the AI was confidently wrong — don't discard these, they're the most valuable deliverable content

## 7. Testing Automation Layer — Playwright (JD-alignment bonus, not required by assessment.md)

- [ ] Write a Playwright test suite covering the dashboard's core flows (load, anomaly renders, copilot responds)
- [ ] Bonus: use AI to *generate* a first draft of the Playwright tests, then document what you kept/changed — directly demonstrates the JD's "AI-powered testing automation agents that autonomously generate, execute, and evaluate test cases"
- [ ] Wire tests into a CI workflow (GitHub Actions is the accessible equivalent of Azure DevOps here — say so explicitly in the stack justification doc so the Azure DevOps/CI-CD JD line is clearly addressed)
- [ ] Short note in the architecture doc: "In production this test suite would run in Azure DevOps CI/CD, gating deploys" — ties directly to JD responsibility #1

## 8. Documentation Deliverables (write once the build is stable)

- [ ] **Deliverable 2** — README: how to run it, what it does, limitations
- [ ] **Deliverable 3** — Architecture & design doc (2-4 pages): diagram, decisions, rejected alternatives, break-at-scale
- [ ] **Deliverable 4** — Stack justification (1 page): why this stack vs. building on C3.ai / Palantir Foundry; mention the Playwright/CI choice here too
- [ ] **Deliverable 5** — AI Partnership Log (1-2 pages, the most important one): tools used + purpose, 3-5 specific overrides + reasoning, 1-2 confidently-wrong AI moments, what you'd never let AI decide alone, where it was 10x vs. where it slowed you down
- [ ] **Deliverable 6** — Data strategy (1 page): what data is needed, how simulated/sourced, what you'd ask Nucor's data team for
- [ ] **Deliverable 7** — Security & risk assessment (1-2 pages): prompt injection, data leakage, hallucination in decision support, access control, audit trail, model deprecation — spot risks, don't need to solve all

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
