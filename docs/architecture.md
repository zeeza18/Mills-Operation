# Architecture & Design

## The problem, sharpened

The prompt as given is broad: "help a shift supervisor prevent, anticipate, or react faster to unplanned downtime." I didn't want to build a generic "downtime dashboard." That's the kind of thing that sounds impressive in a slide and does nothing for anyone on a real shift. So I narrowed it hard, on purpose:

- **User:** a shift supervisor on a hot mill line, specifically. Not a reliability engineer doing offline analysis, not a plant manager looking at monthly KPIs. Someone watching live operation and deciding, in the moment, whether to intervene.
- **Failure mode:** roll stand bearing degradation. One mechanism, not "all possible downtime causes." Bearing wear is one of the most common and best-understood predictive-maintenance failure modes, which meant I could build something with a real, defensible precursor signal instead of hand-waving a dataset that just says "downtime: yes/no."
- **The decision it speeds up:** not "predict downtime" in the abstract, specifically "should I flag this stand for inspection before it fails on my shift." That's a concrete action a supervisor can actually take.

### What this does NOT do

- It doesn't predict *all* downtime causes, just bearing degradation on a roll stand. A different failure mode (electrical fault, upstream material issue, human error) would need a different model and probably different signals entirely.
- It doesn't do automated shutdown or control-system intervention. It flags and explains; a human decides. I don't think an AI system should ever be the one pulling a mill offline on its own, and I say more about why in the security and risk doc.
- It doesn't handle real-time streaming at production scale. I'm working off a static dataset with the model re-scored in batch, not a live sensor feed with sub-second latency requirements. That's a real gap and it's called out below.
- It doesn't cover multi-mill, multi-vendor sensor normalization. Everything here assumes one consistent sensor schema across all stands, which is not how a real multi-division steelmaker's instrumentation actually looks.

### Why Challenge 1 over the other two

I picked mill reliability over commercial/order-to-mill and internal-knowledge/onboarding because it's the one structurally closest to what the actual role does. The JD calls out ML-driven test data generation from real manufacturing process data and AI/ML anomaly detection for data quality. Predicting downtime from sensor drift is the same underlying shape of problem: time-series signals, anomaly detection, deciding what's a real alert versus noise. The knowledge/onboarding prompt is a RAG chatbot, which I think most candidates default to because it's the path of least resistance. I wanted to show the actual shape of this job instead.

## System design

```
                    ┌─────────────────────────┐
                    │  Sensor data source      │
                    │  (synthetic today,       │
                    │  historian/PI in prod)   │
                    └────────────┬─────────────┘
                                 │ 1-min readings
                                 ▼
                    ┌─────────────────────────┐
                    │  Feature pipeline         │
                    │  (app/features.py)        │
                    │  rolling mean/std,         │
                    │  rate-of-change            │
                    └────────────┬─────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  Anomaly detector          │
                    │  (app/detector.py)         │
                    │  IsolationForest trained    │
                    │  on normal windows only     │
                    └────────────┬─────────────┘
                                 │ anomaly_score per row
                                 ▼
                    ┌─────────────────────────┐
                    │  Alert logic                │
                    │  persistence filter          │
                    │  (5 consecutive min above    │
                    │  threshold, no single-spike  │
                    │  pages)                       │
                    └────────────┬─────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  FastAPI backend            │
                    │  (app/api.py)                │
                    │  serves scored data,          │
                    │  proxies the copilot call      │
                    └────────────┬─────────────┘
                                 ▼
              ┌──────────────────┴───────────────────┐
              ▼                                       ▼
  ┌─────────────────────┐              ┌───────────────────────────┐
  │  React frontend (web/)│              │  AI copilot layer          │
  │  live signal charts,  │◄─────────────┤  explains WHY a flag       │
  │  anomaly timeline      │  context     │  fired, suggests next      │
  │  for shift supervisor  │              │  action (Claude Haiku 4.5) │
  └─────────────────────┘              └───────────────────────────┘
```

In production, the sensor-data box is a plant historian (OSIsoft PI is the common one in heavy industry, though Nucor's actual stack may differ), the feature pipeline runs continuously rather than in a batch script, and the alert layer would push into whatever a supervisor already watches: a control-room screen, not a separate app they have to remember to check.

There's also a testing and CI layer that isn't in the diagram above because it sits around the system, not inside it. `tests/dashboard.spec.js` is a Playwright suite covering the frontend's core flows (loads, shows real detection numbers, renders per-stand charts with actual content, the copilot button produces a grounded response), wired into GitHub Actions (`.github/workflows/ci.yml`), the accessible stand-in for what would be an Azure DevOps pipeline at Nucor, gating merges the same way. It's caught real bugs during this build, and it also missed one that only showed up when the app was actually used on a real desktop machine: every chart was being fed roughly 13,000 undownsampled points, which rendered fine in Playwright's clean test browser but produced blank charts and multi-second lag on an actual desktop with a normal browser load. Automated tests prove a component responds; they don't fully substitute for someone actually using the thing. Full story, including what did and didn't get caught by automation, in `docs/ai-partnership-log.md`.

## What I considered and rejected

- **A supervised deep model (LSTM/transformer over the raw time series) instead of IsolationForest.** Rejected for now. In real predictive maintenance you almost never have enough labeled failure events to train something that data-hungry, and even in my synthetic set I only had 60 failures total. IsolationForest only needs to learn "normal," which I have plenty of. If this were headed to production with a year of real historian data and real failure logs, revisiting this would be a reasonable next step.
- **Real-time streaming (Kafka or similar) instead of batch scoring.** Rejected for the prototype. It's the right architecture eventually, but building streaming infrastructure to process a synthetic CSV would have been effort spent on plumbing instead of on the actual detection problem. Documented as a known gap, not silently ignored.
- **A single global anomaly threshold vs. per-stand thresholds.** I used one global threshold across all 6 stands. That's a real simplification; different stands likely have different normal baselines and different sensitivities in a real mill. Flagged as a scale limitation below, not solved here.
- **Frequency-domain features (FFT on vibration) instead of just rolling stats.** Vibration analysis in real predictive maintenance often goes into frequency space to catch specific fault signatures. I started simpler on purpose (rolling mean, std, rate-of-change) to get an honest end-to-end baseline working before reaching for something fancier. It worked well enough (11/11 detection on held-out data) that I didn't feel the need to escalate for this prototype.
- **Streamlit, then React and FastAPI, for the interface.** I built the first working UI in Streamlit because it let me validate whether the ML approach worked at all in an afternoon instead of a week. Once the detector was proven out (11/11 detection, a real evaluated tradeoff curve), I rebuilt the interface properly: a FastAPI backend serving the scored data and proxying the copilot call, and a React and TypeScript frontend for the actual supervisor-facing surface. Prototyping fast in Streamlit and then investing in a real frontend once the underlying idea is validated is a deliberate two-stage decision, not scope creep.

## Where this breaks at Nucor scale

- **Per-stand and per-mill calibration.** A single trained model and single threshold across all stands is a prototype-scale shortcut. Real stands have different equipment age, load profiles, and sensor calibration; this would need per-stand (or at least per-mill-type) baselines, not one global model.
- **Sensor vendor heterogeneity.** I assumed one clean, consistent 5-signal schema. A real multi-division steelmaker almost certainly has different sensor vendors, tag naming conventions, and sampling rates across sites. Normalizing that is a real data-engineering project on its own, not a footnote.
- **Model retraining and drift.** "Normal" operation drifts over time: new equipment, seasonal effects, process changes. A production version needs a retraining cadence and drift monitoring, or the model quietly goes stale and either misses real failures or false-alarms more and more.
- **Alert fatigue across shifts.** A 1% false-alarm rate on one stand's test window sounds fine. Multiply that across every stand, every mill, every shift, continuously, and it adds up fast. This is the exact kind of thing that gets a tool ignored within a month if it isn't actively managed. I don't have a full solution to this in the prototype; I flag it as the single biggest adoption risk in the security and risk doc.
- **Integration with existing workflows.** This assumes a supervisor checks a dashboard. In practice it would need to land inside whatever they already use, likely paging into an existing alarm/SCADA system rather than being one more screen to remember.
