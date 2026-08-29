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
flowchart LR
    subgraph Data["Data"]
        direction TB
        GEN["generate_synthetic_data.py<br/>rolling 45-day window"]
        LIVEFEED["live_feed.py<br/>ticks every real minute"]
        HIST["historical.py<br/>cached, auto-refreshes"]
        GEN --> HIST
    end

    subgraph ML["Detection Engine"]
        direction TB
        FEAT["features.py<br/>rolling mean / std / rate of change"]
        DET["detector.py<br/>LocalOutlierFactor + backstop"]
        FEAT --> DET
    end

    API["FastAPI backend<br/>(app/api.py)"]

    subgraph UI["React + TypeScript frontend"]
        direction TB
        MON["Live Monitor"]
        SIM["Degradation Simulator"]
        CHAT["Copilot Chat"]
    end

    subgraph AI["AI layer"]
        direction TB
        COPILOT["copilot.py"]
        LLM["Fast, low-cost LLM"]
        TOOLS["fleet_tools.py<br/>6 read-only functions"]
        COPILOT <--> LLM
        LLM <--> TOOLS
    end

    LIVEFEED --> FEAT
    HIST --> FEAT
    DET --> API
    API --> MON
    API --> SIM
    API --> CHAT
    CHAT --> COPILOT
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
  const page = await browser.newPage({ viewport: { width: 2000, height: 900 } });
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
