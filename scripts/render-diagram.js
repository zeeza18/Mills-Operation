/**
 * Renders the README's Mermaid architecture diagram to a real PNG, so it
 * can be embedded in generated PDFs (which can't render ```mermaid fences
 * the way GitHub does). Run with: node scripts/render-diagram.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'architecture-diagram.png');

const mermaidSource = `
flowchart TD
    subgraph Data["Data"]
        GEN["generate_synthetic_data.py<br/>rolling 45-day window, ending yesterday"]
        LIVEFEED["live_feed.py<br/>ticks once every real minute"]
    end

    subgraph ML["Detection Engine"]
        FEAT["features.py<br/>rolling mean / std / rate of change"]
        DET["detector.py<br/>LocalOutlierFactor + deviation backstop"]
    end

    GEN --> HIST["historical.py<br/>cached scoring, auto-refreshes if stale"]
    LIVEFEED --> FEAT
    HIST --> FEAT
    FEAT --> DET

    DET --> API["FastAPI backend (app/api.py)"]

    API --> UI["React + TypeScript frontend"]
    UI --> MON["Live Monitor"]
    UI --> SIM["Degradation Simulator"]
    UI --> CHAT["Copilot Chat"]

    CHAT --> COPILOT["copilot.py"]
    COPILOT <--> LLM["Fast, low-cost LLM"]
    LLM <--> TOOLS["fleet_tools.py<br/>6 read-only functions"]
    TOOLS --> LIVEFEED
    TOOLS --> HIST
`;

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>body{margin:0;background:white;font-family:sans-serif;}</style>
</head><body>
<pre class="mermaid">${mermaidSource}</pre>
<script>
  mermaid.initialize({ startOnLoad: true, theme: 'default', flowchart: { curve: 'basis' } });
</script>
</body></html>`;

async function main() {
  const tmpHtml = path.join(__dirname, '_diagram.html');
  fs.writeFileSync(tmpHtml, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto('file://' + tmpHtml.replace(/\\/g, '/'));
  await page.waitForSelector('svg', { timeout: 20000 });
  await page.waitForTimeout(500);
  const svg = await page.$('svg');
  await svg.screenshot({ path: OUT });
  await browser.close();
  fs.unlinkSync(tmpHtml);
  console.log('Saved', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
