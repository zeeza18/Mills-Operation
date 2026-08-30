"""
Converts the project's markdown deliverables into clean, print-ready HTML
files, which scripts/render-pdfs.js then turns into PDFs via headless
Chromium. Not committed to the repo, this is a one-off packaging step.
"""

import re
import shutil
from pathlib import Path

import markdown

MERMAID_FENCE = re.compile(r"```mermaid.*?```", re.DOTALL)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "deliverables" / "_html"
SCREENSHOTS = ROOT / "docs" / "screenshots"

CSS = """
@page { margin: 22mm 18mm; }
body {
  font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  color: #1a1d1f;
  line-height: 1.55;
  font-size: 12.5px;
  max-width: 780px;
  margin: 0 auto;
}
h1 { font-size: 24px; border-bottom: 3px solid #2d6a4f; padding-bottom: 8px; margin-top: 0; }
h2 { font-size: 17px; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
h3 { font-size: 14px; margin-top: 20px; }
p { margin: 10px 0; }
code { background: #f2f4f3; padding: 1px 5px; border-radius: 3px; font-size: 11.5px; font-family: "SF Mono", Consolas, monospace; }
pre { background: #f2f4f3; padding: 12px 14px; border-radius: 6px; overflow-x: auto; font-size: 10.5px; line-height: 1.4; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 11.5px; }
th, td { border: 1px solid #d8dcda; padding: 6px 9px; text-align: left; vertical-align: top; }
th { background: #eef3ef; }
img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; margin: 10px 0; }
a { color: #2d6a4f; }
.cover {
  text-align: center;
  padding-top: 30%;
  page-break-after: always;
}
.cover h1 { border: none; font-size: 30px; }
.cover .subtitle { color: #555; font-size: 14px; margin-top: 10px; }
.cover .meta { margin-top: 60px; color: #888; font-size: 11px; }
blockquote { border-left: 3px solid #2d6a4f; margin: 10px 0; padding: 2px 16px; color: #444; background: #f8f9f8; }
"""

TEMPLATE = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>{css}</style></head>
<body>
{cover}
{body}
</body></html>"""

COVER_TEMPLATE = """<div class="cover">
<h1>{title}</h1>
<p class="subtitle">{subtitle}</p>
<p class="meta">Mills-Operation &middot; AI Reliability Copilot for Hot Mill Operations</p>
</div>"""


def convert(md_path: Path, title: str, subtitle: str, out_name: str, extra_md: str = "") -> Path:
    text = md_path.read_text(encoding="utf-8") if md_path else ""
    # A static PDF pipeline can't render a live ```mermaid fence the way
    # GitHub does, so swap it for the pre-rendered PNG (scripts/render-diagram.js)
    # instead of letting it fall through as raw, unreadable diagram syntax.
    text = MERMAID_FENCE.sub("![Architecture diagram](screenshots/architecture-diagram.png)", text)
    text = text + extra_md
    body_html = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    # Image paths differ by source file: docs/*.md use "screenshots/x.png"
    # (relative to docs/), README.md uses "docs/screenshots/x.png" (relative
    # to repo root). Both need to become an absolute path for the PDF
    # renderer, which has no notion of the original file's location.
    body_html = body_html.replace('src="docs/screenshots/', f'src="{SCREENSHOTS.as_posix()}/')
    body_html = body_html.replace('src="screenshots/', f'src="{SCREENSHOTS.as_posix()}/')
    cover = COVER_TEMPLATE.format(title=title, subtitle=subtitle)
    html = TEMPLATE.format(css=CSS, cover=cover, body=body_html)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{out_name}.html"
    out_path.write_text(html, encoding="utf-8")
    return out_path


def main():
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)

    artifact_overview = f"""
# The Artifact

This deliverable walks through what was actually built, end to end, starting from where the data came from and finishing at the live console. Full detail on any one piece is in the other deliverables (architecture, data strategy, AI partnership log); this is the connective narrative across all of them.

## There was no real data, so a realistic proxy was built first

Real Nucor sensor data was not available, so it had to be synthesized from scratch. Before writing a line of model code, the question was: what is the minimum realistic signal that actually proves a model can see a bearing failure coming before the alarm does.

The answer landed on 5 signals per roll stand, sampled every minute: vibration, bearing temperature, motor current, line speed, and coolant pressure. These were not picked because they were easy to fake. Between them they cover three different physical failure signatures (mechanical, thermal, electrical), one signal that reflects an operator's own response to a developing fault (line speed gets throttled back), and one that moves in the opposite direction from all the others (coolant pressure drops as the seal degrades). A model fed only correlated signals learns nothing new from most of them; this set was chosen specifically to avoid that.

The first version of the failure signature was lazy: flat normal noise, then a sudden step change right before the failure timestamp. It looked fake the moment it was plotted, no real machine dies like a light switch. It was rebuilt as a non linear ramp instead: starting 6 to 48 hours before the failure, each signal drifts toward its failing value on a curve that is slow at first and accelerates near the end, matching how bearing wear actually behaves, with the noise widening as the fault develops rather than just the mean shifting. `data/generate_synthetic_data.py` is fully seeded, so it is reproducible without checking a 25MB CSV into git history. It produces 6 stands times 45 days at 1 minute resolution, about 389 thousand rows, with roughly 22% of stand days ending in an injected failure, paired with a ground truth `failure_events.csv`.

## Turning raw readings into something a model can actually use

A raw vibration reading of 9.5 mm/s means nothing on its own, it only means something relative to what that specific stand's normal running value looks like, and whether it is actively trending. `app/features.py` adds, for every signal, a 60 minute rolling mean and standard deviation (is this stand running hotter or noisier than its own recent normal) and a 15 minute rate of change (is it actively moving, not just sitting elevated). Deliberately simple on purpose, no frequency domain features, to get an honest end to end baseline working before reaching for anything fancier.

## Training and evaluating the detector

The detector is a LocalOutlierFactor model, trained only on windows labeled clean normal (not approaching a failure, and not still recovering from one, both directions matter, see the data strategy deliverable for why). It was not picked by reasoning alone. `notebooks/model_comparison.ipynb` actually benchmarks it against IsolationForest, OneClassSVM, EllipticEnvelope, and a naive baseline, all trained on identical features and graded on identical lead time and false alarm metrics. LocalOutlierFactor won outright.

On the held out test window, the shipped model catches 11 out of 11 injected failures, with a 0.05% false alarm rate on normal minutes and a median lead time of roughly 687 minutes before the actual failure timestamp. An independent backstop sits alongside the model itself: if a raw signal stays more than 3.5 standard deviations from a stable, whole training period baseline for 20 straight minutes, an alert fires regardless of what the model's own score says, since LocalOutlierFactor's local density approach has a real blind spot on failures that have already been going on for hours (its own recent broken minutes start looking normal to each other). Finding and fixing that blind spot is documented in full, including the labeling bug it led to, in the AI partnership log.

Those exact numbers, 11 out of 11, 0.05%, are not a claim, they are what the fleet screen below reads directly off the held out test run every time it loads.

![Fleet overview](screenshots/fleet-overview.png)

*The fleet landing page. All 6 stands with live sensor values on the left, and the model's actual held out test performance on the right, read straight from the evaluation run, not typed in by hand.*

## What actually runs live, not just a one time script

Training and evaluation happen once, but the console itself is live. `app/live_feed.py` ticks once every real minute, generates a new row per stand using the same baseline and failure ramp logic as the training generator, and scores it with the same trained model. `app/historical.py` keeps a rolling 45 day window of scored history that always ends yesterday and silently backfills itself if the app has been closed for a few days, so a date range filter on the dashboard (today, past week, last month, or custom) never shows a gap.

![Stand detail with alert history](screenshots/stand-detail.png)

*A single stand's signal history over the past week, filtered live from the dashboard. The shaded bands are real detected alert windows, not annotations added after the fact.*

A separate degradation simulator lets a supervisor push a virtual stand toward failure by hand instead of waiting on the live feed's own randomness, and watch the real trained model react minute by minute as it happens.

![Degradation simulator mid alert](screenshots/simulator-alert.png)

*Vibration pushed toward failure by hand on the virtual stand. The alert badge, the anomaly score, and the shaded band on the chart are all live output from the same detector used everywhere else in this console, not a scripted animation.*

## The AI layer is not a chatbot bolted on afterward

Two AI surfaces exist. A single stand explanation turns a flagged anomaly's ranked signal deviations into a plain language explanation and one concrete recommendation. A fleet wide copilot, on its own tab with real conversation memory, answers free text questions across all 6 stands (compare two stands, who is alerting, what is causing it, who is trending toward trouble next) by calling 6 narrow, read only Python functions and writing an answer only from what those functions actually returned. Neither surface uses embeddings or a vector database, with only 6 stands the entire fleet's current state trivially fits in a single prompt, so retrieval search solves a problem that does not exist here. Both fail gracefully to a deterministic, still data grounded response if the AI provider is unreachable, the console never breaks because a network call did.

![Fleet copilot answering a real question](screenshots/copilot-chat.png)

*The fleet copilot answering a free text question about which stand is running hottest right now. That number came from an actual tool call into the live data at the moment the question was asked, not a stored or scripted reply.*

## How to run it

The full setup, both Python and frontend, is in the code deliverable's README. Two commands generate and score the dataset, two more start the backend and frontend, and the console is live at localhost.
"""
    convert(None, "Deliverable 1: The Artifact", "What was built, and what it looks like running",
            "01_The_Artifact", extra_md=artifact_overview)

    code_overview = f"""
# The Code

Everything written for this lives in one repository. This deliverable walks through what is actually in it, folder by folder and the key files inside each, then gives the exact commands to run it. The narrative version of why things are built this way is in the architecture and stack justification deliverables; this is the map of where that thinking actually landed in code.

## app/, the backend and the model

`app/features.py` and `app/labels.py` turn raw readings into what the model actually trains on: rolling mean, standard deviation, and rate of change per signal, plus time to and since the nearest failure so a row can be labeled clean normal or not. `app/detector.py` holds the trained LocalOutlierFactor model and the independent deviation backstop next to it. `app/evaluate.py` runs the whole training and scoring pipeline end to end and prints the real detection numbers.

`app/api.py` is the FastAPI backend, and everything else in this folder either feeds it or is called by it. `app/live_feed.py` is the background task that ticks once a real minute and keeps the live data moving. `app/historical.py` keeps the rolling 45 day scored window that backs the date range filter, cached to disk since scoring the full set takes too long to do inside a request. `app/simulator.py` and `app/signal_profile.py` back the degradation simulator, the correlated signal curve and the timed ramp toward failure. `app/copilot.py` is the AI layer, both the single stand explanation and the fleet wide chat, and `app/fleet_tools.py` is the six read only functions the fleet chat calls instead of using a vector database. `app/model_store.py` and `app/timeseries_utils.py` are small shared helpers (loading the trained model once, shaping alert bands for the frontend) used by more than one of the files above.

## web/, the React and TypeScript frontend

`web/src/App.tsx` is the shell: the three tab switcher, the header, the polling loops that keep the fleet and the selected stand's chart data current. Everything else in `web/src/components/` is one piece of a screen: `FleetStrip` and `StandCard` render the landing grid, `SignalChart` and `TimeRangeFilter` are the per stand chart and its date range control, `SimulatorPage` and `FleetCopilotPage` are the other two tabs, `CurrentReadingsPanel` and `MiniFleetPanel` are the detail view's sidebar and fleet aware panel, `RollStandIcon` and `SoundToggle` are the animated stand icon and the draggable mute button for alert sound. `web/src/lib/alertSound.ts` handles the siren and spoken alert, `web/src/lib/markdown.tsx` renders the copilot's **bold** markers as real bold instead of showing literal asterisks. `web/src/api.ts` and `web/src/types.ts` are the one place every backend call and its response shape are defined, so the rest of the frontend never talks to `fetch` directly.

## data/, tests/, docs/, notebooks/, scripts/

`data/generate_synthetic_data.py` is the seeded generator that produces the training dataset, described in full in the data strategy deliverable. `tests/dashboard.spec.js` is the Playwright suite covering the core flows, wired into `.github/workflows/ci.yml` so it runs on every push. `docs/` holds this project's actual design history, not retrofitted after the fact, including a plain English writeup of how the AI copilot works (`docs/copilot-how-it-works.md`). `notebooks/model_comparison.ipynb` is the real bake off that picked LocalOutlierFactor over four alternatives. `scripts/` holds the one off utilities used to package these deliverables themselves (screenshot capture, diagram rendering, PDF generation), kept out of the main app since they are packaging tools, not part of the running product.

## How to run it

```bash
# Python backend
pip install -r requirements.txt

# 1. Generate the synthetic sensor dataset (deterministic, about 389K rows, a few seconds)
python data/generate_synthetic_data.py

# 2. Train the anomaly detector and score the held out test window
python -m app.evaluate

# 3. Start the backend API (also starts the live feed in the background)
uvicorn app.api:app --reload --port 8000
```

```bash
# React frontend, in a second terminal
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. Without an `ANTHROPIC_API_KEY` in `.env`, both AI surfaces still work, they fall back to a deterministic, data grounded response instead of a live model call, so the console never breaks because of a missing key.

## How to test it

```bash
npm install
npx playwright install --with-deps chromium
npx playwright test
```

Playwright starts both the backend and the frontend itself, so just make sure the two setup commands above have already been run once. This runs automatically on every push through GitHub Actions.
"""
    convert(None, "Deliverable 2: The Code",
            "What's in the repository, and how to run it", "02_Code_And_How_To_Run",
            extra_md=code_overview)

    architecture_doc = """
# Architecture & Design

## The problem, sharpened

The prompt as given is broad: help a shift supervisor prevent, anticipate, or react faster to unplanned downtime. That was narrowed hard, on purpose, instead of building a generic downtime dashboard:

- **User:** a shift supervisor on a hot mill line, specifically. Someone watching live operation and deciding, in the moment, whether to intervene, not a reliability engineer doing offline analysis.
- **Failure mode:** roll stand bearing degradation. One well understood mechanism with a real, defensible precursor signal, not every possible downtime cause.
- **The decision it speeds up:** should this stand be flagged for inspection before it fails on this shift. A concrete action a supervisor can actually take.

This does not predict all downtime causes, does not do automated shutdown (it flags and explains, a human decides), and does not run at production streaming scale. Those are named limits, not gaps papered over.

## System design

![Architecture diagram](screenshots/architecture-diagram.png)

Synthetic sensor data (or a real historian feed in production) flows through a feature pipeline (rolling mean, standard deviation, rate of change per signal) into a LocalOutlierFactor detector trained only on normal windows, backed by an independent deviation backstop for the model's own blind spot on sustained failures. The FastAPI backend serves that scored data to a React frontend with three surfaces: a live monitor, a hands on degradation simulator, and an AI copilot. The copilot calls six narrow, read only functions into the same live data instead of a vector database, since the entire fleet's current state easily fits in a single prompt at this scale.

## What was considered and rejected

**A supervised deep model instead of an unsupervised detector.** Rejected: real predictive maintenance rarely has enough labeled failures to train something that data hungry, and an unsupervised detector only needs normal data, which is plentiful.

**Picking a model by reasoning alone.** This was a real gap in an early pass. Closed by an actual bake off (`notebooks/model_comparison.ipynb`) against IsolationForest, OneClassSVM, and EllipticEnvelope on identical features and metrics. LocalOutlierFactor won outright, zero false alarms versus roughly 0.8% for the runner up, and about ten times the warning time.

**LocalOutlierFactor's local density blind spot.** The same property that catches subtle onset early also means a sustained failure's own recent minutes eventually look normal to each other, and the score quietly drops. Fixed with an independent backstop keyed to a stable, whole training period baseline instead of a moving window, which also surfaced and fixed a real labeling bug in how clean normal data was defined.

**Real time streaming versus batch.** Batch scoring for training and evaluation, but the live console genuinely ticks in real time on top of it (`app/live_feed.py`). Still not production scale streaming, one in process background task, not a message bus.

**Tool use over vector search for the AI copilot.** Embeddings solve a corpus too big to fit in context. Six stands' current data does not need that; six real function calls into live data give a grounded answer with less machinery and no invented numbers.

**Streamlit, then a real frontend.** Streamlit validated the detection approach in an afternoon. Once the numbers were real, the interface was rebuilt properly in React and TypeScript with an actual API boundary, since a shift supervisor's tool needs to feel trustworthy, not like a script re-running top to bottom on every click.

## Where this breaks at Nucor scale

- **One global threshold across all 6 stands**, not per-stand or per-mill calibration. Real stands differ in age, load, and calibration.
- **One consistent 5 signal schema assumed.** A real multi-division steelmaker almost certainly has different sensor vendors and tag naming per site.
- **No retraining cadence or drift monitoring.** Normal operation drifts; a model trained once and never revisited quietly gets worse.
- **Alert fatigue.** Even a low false alarm rate compounds across every stand, every mill, every shift. The single biggest realistic adoption risk, covered in the security and risk deliverable.
- **Assumes a supervisor checks a dashboard.** A real deployment needs to land inside whatever they already watch, not be one more screen to remember.

## How this actually gets adopted

A model being accurate on paper does not mean a supervisor trusts it on day one. Turning alerts on for the whole floor immediately is the wrong first move: the first false alarm in week one costs more trust than ten correct alerts earn back, and a tool the crew has learned to ignore is worse than no tool at all. The real rollout is to run it silently for a few weeks against a crew that already trusts the process, let them check a handful of real flags against what they already know, and only then let it start paging people. That is a change management problem, not a modeling problem, and no amount of extra model accuracy fixes it on its own.

Full detail behind every decision above, including the bugs found getting here, is in the AI partnership log and `docs/architecture.md` in the repository.
"""
    convert(None, "Deliverable 3: Architecture & Design",
            "System design, key decisions, what breaks at Nucor scale", "03_Architecture_And_Design",
            extra_md=architecture_doc)

    stack_doc = """
# Stack Justification

## What was used, and why

**Python, pandas, scikit-learn** for the data generator and detector. The hard part of this assignment is proving detection works on a realistic failure signature, not building ML infrastructure. LocalOutlierFactor was picked after an actual bake off against IsolationForest, OneClassSVM, and EllipticEnvelope (`notebooks/model_comparison.ipynb`), not by reasoning alone.

**Streamlit first, then React and TypeScript with a FastAPI backend.** Streamlit validated the detection approach in an afternoon. Once it was proven (11 out of 11 detected, a real evaluated threshold tradeoff), the interface was rebuilt properly, since a shift supervisor's actual tool needs to feel trustworthy, not like a script re-running top to bottom on every click.

**A fast, low-cost LLM for the explanation and fleet copilot layers.** Constrained explicitly to the numbers it is handed, never inventing a reading or a timeframe, with a deterministic fallback if the call fails so the console never breaks because of a missing key or a network blip.

**Playwright and GitHub Actions** instead of Tosca, K6, or Azure DevOps. No access to Nucor's actual tooling, so the closest accessible equivalents, built to mirror the same shape a real pipeline would have: generate data, train, evaluate, test, gate on all of it.

## Why not C3.ai or Palantir Foundry

For a production version, standardizing on whichever platform Nucor already runs is probably the right call. For this prototype, it would have been the wrong one.

Both platforms front load real modeling investment, C3.ai's Type and Blueprint system, Foundry's ontology layer, that pays off when integrating dozens of data sources across an enterprise under one governed model. For a one week exercise where the actual question is whether one specific anomaly detection approach works on one specific failure mode, that ceremony would have eaten most of the week before a single line of detection logic got written.

C3 AI Reliability specifically already sells this exact problem category, packaged. Building on top of it would mean testing C3.ai's model and C3.ai's assumptions about failure signatures, not the ones actually reasoned through here, which defeats the point of an assignment scoring judgment about the problem, not the ability to configure a vendor product.

There was no access to either platform, which made this partly moot, but the same call would stand with access: prove the idea cheap and fast first, then re-platform onto the governed enterprise system once it is worth the integration investment, not before the underlying approach is even known to work.

If this proved out, the real version becomes a registered model inside whichever platform Nucor standardizes on: data ingestion through that platform's own historian integration, the model sitting in its governance layer (access control, audit, retraining triggers), and the supervisor surface embedded in existing control room tooling rather than a standalone web app.
"""
    convert(None, "Deliverable 4: Stack Justification",
            "Why these tools, and why not C3.ai or Palantir Foundry", "04_Stack_Justification",
            extra_md=stack_doc)

    partnership_doc = """
# AI Partnership Log

## Which tools, for what

Claude Code (Sonnet 5) was the primary collaborator for the whole build: architecture, the data generator, feature engineering, the anomaly detector, the FastAPI backend, the React frontend, the AI copilot layer, the Playwright suite, CI, and first drafts of every doc. I directed it, reviewed everything it produced, and pushed back when something didn't sit right. Separately, Claude Haiku 4.5 runs inside the product itself as the fleet copilot. That's a different relationship, it's a component I built and had to treat like any other dependency, not trust because it shares a name with my coding assistant.

## Overrides, where I didn't just take what it gave me

**Accepting the first "it works" without asking what it cost.** First pass at the alert threshold used the 99.5th percentile of normal scores, conservative sounding, and it caught zero of eleven real failures. Instead of taking the next fix at face value, I had it sweep the full threshold range and show me the actual detection rate versus false alarm rate at every point. Landed on 97th percentile, full detection, because I saw the tradeoff, not because it was the first setting with a good headline number.

**Documentation voice.** Claude's default for technical docs is polished, third person, corporate. I asked for first person, what I actually tried, what didn't work. This assignment scores the log on candor, and generic voice would have flattened real back and forth into something nobody actually wrote. I also had to push a second time on em dashes and hyphen as punctuation showing up constantly, a small tic that reads as machine written the moment you notice it.

**Leaving Streamlit for a real frontend.** The dashboard worked but looked like a prototype. I told it to drop Streamlit entirely and rebuild in React and TypeScript with a proper backend, not restyle the existing script, which meant redoing the frontend, the test suite, and CI from a working baseline. Worth it: a shift supervisor's tool needs to look trustworthy, not like a demo.

**Not trusting a flaky looking test as probably fine.** One Playwright test failed intermittently after the React rebuild. I'd already made a legitimate unrelated fix nearby and nearly called it solved. Instead I wrote a standalone script that clicked the same element in a real browser and printed the actual state, no test framework involved, which proved the click itself worked. Only then did I treat the remaining flakiness as real environmental noise and fix the actual cause: timeouts and retries in the test config, not a suppressed assertion.

**Publishing the confidential prompt.** I told it to sync all the setup to the public repo, meaning everything, including the take home prompt itself. It flagged, unprompted, that the assignment says not to post that document publicly, and asked before pushing anything. I hadn't thought about the prompt file sitting next to the code. This is the one override that came from the AI catching me, not the other way around.

## Confidently wrong, and how it got caught

**The rolling mean baseline bug.** For a stand genuinely mid failure, the copilot said coolant pressure was up. Backwards, the failure signature is pressure dropping. It wasn't hallucinating a number, it correctly reported the z score it was handed, but that z score was computed against a 60 minute rolling mean that was itself mid collapse during the fault, so a noisy uptick inside an ongoing drop can register as above normal. I caught it by reading the output for internal consistency, "up" didn't match the failure signature I knew, and fixed it by comparing against a stable, whole period baseline instead.

**A sub agent reported success on work it never did.** I delegated a mechanical cleanup, rewriting dash punctuation across 18 files, to a background sub agent so it wouldn't eat the main session's context. It came back marked completed with a written summary claiming the work was done. When I actually checked by re searching the codebase, every instance was still there. It had gotten confused partway through and reported the confusion as a finished task. I only caught it because I check the files, not the status message, and did the rewrite myself afterward.

## What I won't let it decide alone

Whether an anomaly triggers a real world action, the dashboard explains and suggests, it never shuts anything down or dispatches anyone. Where the actual alert threshold sits, it can compute the tradeoff curve but not how much false alarm fatigue a real shift crew would tolerate before they start ignoring the tool. Whether something is safe to publish, the confidentiality catch above is the clearest example, I take the flag seriously but the push decision is mine. Whether a task actually got done, a status of completed is a claim, not a fact, I check the artifact.

## Where it was 10x, where it slowed me down

**10x** on sheer volume: a synthetic data generator with a realistic failure ramp, a feature pipeline, a trained and evaluated detector, a backend, a frontend, an LLM explanation layer, a test suite, a CI workflow, and this set of docs, in far less time than doing the typing myself across that many different kinds of work.

**Slower** in two places. The editor's type checker kept flagging pandas and scikit-learn calls as errors that weren't real, stale stub noise that needed a second look every time to confirm it was nothing. And the sub agent failure above cost real time, a delegated task that silently didn't happen is worse than one that visibly fails, because it looks finished until you check.

Full detail on every override, bug, and addendum along the way is in `docs/ai-partnership-log.md` in the repository.
"""
    convert(None, "Deliverable 5: AI Partnership Log",
            "A candid record of how AI was used building this", "05_AI_Partnership_Log",
            extra_md=partnership_doc)

    data_doc = """
# Data Strategy

## What was needed, and why

Real Nucor sensor data was not available, so it had to be synthesized from scratch. Before writing any generation code, the question was: what is the minimum realistic signal that actually proves a model can see a bearing failure coming before the alarm does, not a generic sensor dataset.

Five signals per roll stand, sampled every minute: vibration (mechanical wear, the standard precursor), bearing temperature (thermal, slower and noisier than vibration), motor current (electrical, ties the fault to something a plant's PLC would already log), line speed (operational response, tests whether the model reads a human throttling back rather than just raw physics), and coolant pressure, the one signal that drops while everything else rises, which forces the model to learn an actual pattern instead of thresholding one direction.

## How it was built

The first attempt was a flat baseline with a sudden step change right before failure. It looked fake immediately, flat then a cliff, and no real machine dies like a light switch. Rebuilt as a non linear ramp: starting 6 to 48 hours before failure, each signal drifts toward a failing value on a progress squared curve, slow at first and accelerating near the end, with the noise widening as the fault develops rather than just the mean shifting.

The generator (`data/generate_synthetic_data.py`) is seeded and fully reproducible. Only the script is checked in, not the output. Result: 6 stands times 45 days at 1 minute resolution, about 389K rows, roughly 22% of stand days ending in an injected failure, paired with a ground truth label file. The window anchors to end yesterday off the real clock instead of a fixed date, so the data stays current without ever needing a retrain, same seed and same signal sequences, only the calendar labels move.

This is a best guess at realistic magnitudes and failure dynamics, not something measured off real equipment, and it is worth saying that plainly rather than implying the numbers are more grounded than they are.

## What I'd ask Nucor's data team for

- **Historian access** (OSIsoft PI or equivalent) for the real tag names and sampling rates behind these five signals on an actual roll stand. Plant historians often log slower or event triggered, which changes the modeling approach.
- **A real failure log from a CMMS**, actual unplanned downtime with timestamps and root cause, so the model trains against ground truth instead of simulated labels.
- **Reliability engineering sign off on the signal list itself**, whether these five are the real leading indicators for this failure mode at this mill, or whether a sixth, like oil analysis or acoustic emission, matters more in practice.
- **Data quality expectations**: sensor dropout rates, calibration drift, and how stale a reading is allowed to get before it is untrustworthy. Detection is only as good as the data underneath it.
"""
    convert(None, "Deliverable 6: Data Strategy",
            "What data this needs, how it was simulated, what real data would take", "06_Data_Strategy",
            extra_md=data_doc)

    security_doc = """
# Security & Risk Assessment

This is not an attempt to solve every risk below in a five day prototype. Spotting them unprompted matters more here than closing every gap, and what follows is what was actually thought about while building this, including a couple only caught by going looking, not because they were obvious.

**Prompt injection.** The single stand copilot's prompt is built entirely from computed numbers, no free text field, so that part was mostly luck of the use case. The fleet wide ask the fleet text box is different, a supervisor can type anything into it, so it needed real design: the system prompt scopes the model to only these six stands and declines anything else (tested directly by asking it to write a poem), every tool it can call is read only, tool output is explicitly treated as data to report and never as instructions to obey, and the tool use loop is capped at 4 rounds so a confused model can't spin forever burning calls on one question.

**Hallucination in decision support.** This is the risk designed around most deliberately, because it is the one most likely to matter in practice. The prompt tells the model not to invent readings or history, but even with that constraint its interpretation of a correctly reported number was wrong once, a rolling mean bug made it say coolant pressure was up when it was actually crashing (full story in the AI partnership log). The real fix was not trusting the model more, it is that raw numbers are always shown next to the explanation on the dashboard, never replaced by it, so a supervisor never depends on the sentence being right.

**Data leakage.** Every copilot call sends sensor readings and anomaly scores to a third party API. That is data leaving the network by design and worth naming plainly rather than treating an external call as free. The data here is synthetic so there is nothing to actually leak, but in production that telemetry is operationally sensitive and would need a real data processing agreement, not an assumption that it is fine because it is just numbers. The API key itself lives in a gitignored local file, fine for a prototype, not a substitute for real secrets management in production.

**Access control.** Not implemented. No login, no separation between someone who can view an alert and someone with authority to act on it. That is a real gap, not an oversight being glossed over, and it needs solving before this touches anything with real operational consequence.

**Audit trail.** No persistent log right now of who saw which alert, when, or what they did about it. If a bearing fails after the tool flagged it, that question needs to be answerable from a log, not memory. Straightforward to add since every alert and every copilot call already has the data, it just is not written anywhere durable yet.

**Model deprecation and drift.** Two separate risks. The detector itself will drift as normal operation changes over time, and there is no retraining cadence or drift monitoring here. Separately, the copilot depends on a specific hosted model that could be deprecated or change behavior, the fallback path keeps the dashboard from hard breaking, but explanation quality would silently degrade and nothing currently alerts anyone that it happened.

**Alert fatigue, the one that worries me most and is not on the standard checklist.** Not a security risk in the traditional sense, but the one most likely to actually cause harm. Even a false alarm rate under 1% adds up into real noise across every stand and every shift, and a tool that gets ignored is worse than no tool at all because it creates false confidence that someone is watching. No complete solution here, per stand calibration and suppression logic would both help and neither is built, but it felt more worth naming plainly than most of the items above.

**What was deliberately not built.** The system explains and suggests, it never triggers a shutdown or pages anyone automatically. Keeping a human in the loop for every consequential action is the single biggest risk mitigation in this whole design, a decision made on purpose, not a limitation from running out of time.

Full detail on each of these is in `docs/security-risk.md` in the repository.
"""
    convert(None, "Deliverable 7: Security & Risk Assessment",
            "What can go wrong, and what was deliberately left unsolved", "07_Security_And_Risk_Assessment",
            extra_md=security_doc)

    print(f"Wrote HTML to {OUT_DIR}")


if __name__ == "__main__":
    main()
