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

    docs = ROOT / "docs"

    artifact_overview = f"""
# The Artifact

This is a working, end to end reliability console for a hot steel mill line. It is not a mockup, every screen below is a real screenshot of the running app, and every number on it comes from a trained model scoring real (synthetic) sensor data.

## What it does

A shift supervisor gets three things in one console:

1. **Live Monitor**, 6 roll stands ticking once every real minute, scored live, with a date range filter (today, past week, last month, or a custom range) that reaches back through the training data.
2. **Degradation Simulator**, a virtual stand the supervisor can push toward failure by hand, to see how the model actually responds, minute by minute.
3. **Fleet Copilot**, a real chat that answers questions about the fleet using 6 read only tool calls into live data, never invented numbers.

## How to see it running

The code and a full README with setup steps are in the accompanying code deliverable. Clone the repository, run the two setup commands, start the backend and frontend, and the console is live at localhost.

## Screenshots

![Fleet overview](screenshots/fleet-overview.png)

*The fleet landing page. All 6 stands, live sensor values, and the model's held out test performance (11/11 failures detected, 0.05% false alarm rate).*

![Stand detail with alert history](screenshots/stand-detail.png)

*A single stand's signal history over the past week, with real detected alert windows shaded in.*

![Degradation simulator mid alert](screenshots/simulator-alert.png)

*The degradation simulator, live. Vibration pushed toward failure by hand, and the real trained model has already flagged the alert.*

![Fleet copilot answering a real question](screenshots/copilot-chat.png)

*The fleet copilot answering a free text question, grounded in a live tool call, not a canned response.*
"""
    convert(None, "Deliverable 1: The Artifact", "What was built, and what it looks like running",
            "01_The_Artifact", extra_md=artifact_overview)

    convert(ROOT / "README.md", "Deliverable 2: The Code",
            "Repository contents and how to run it", "02_Code_And_How_To_Run")

    arch_extra = """

## What it looks like, running

![Architecture diagram](screenshots/architecture-diagram.png)

![Fleet overview](screenshots/fleet-overview.png)

![Stand detail with alert history](screenshots/stand-detail.png)

![Degradation simulator mid alert](screenshots/simulator-alert.png)

![Fleet copilot answering a real question](screenshots/copilot-chat.png)
"""
    convert(docs / "architecture.md", "Deliverable 3: Architecture & Design",
            "System design, key decisions, what breaks at Nucor scale", "03_Architecture_And_Design",
            extra_md=arch_extra)

    convert(docs / "stack-justification.md", "Deliverable 4: Stack Justification",
            "Why these tools, and why not C3.ai or Palantir Foundry", "04_Stack_Justification")

    convert(docs / "ai-partnership-log.md", "Deliverable 5: AI Partnership Log",
            "A candid record of how AI was used building this", "05_AI_Partnership_Log")

    convert(docs / "data-strategy.md", "Deliverable 6: Data Strategy",
            "What data this needs, how it was simulated, what real data would take", "06_Data_Strategy")

    convert(docs / "security-risk.md", "Deliverable 7: Security & Risk Assessment",
            "What can go wrong, and what was deliberately left unsolved", "07_Security_And_Risk_Assessment")

    print(f"Wrote HTML to {OUT_DIR}")


if __name__ == "__main__":
    main()
