/**
 * Turns the finished Playwright run into a one page per section PDF report,
 * written to tests/test-report.pdf. Runs automatically as part of
 * `npx playwright test`, wired in through playwright.config.js's reporter
 * list, no separate command needed.
 *
 * Deliberately self contained (plain HTML strings, no markdown library, no
 * Python step): a test reporter should not depend on anything outside the
 * Node process that is already running the tests.
 */

const path = require('path');
const fs = require('fs');

const OUT_PATH = path.join(__dirname, 'test-report.pdf');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const OUTCOME_LABEL = {
  expected: 'Passed',
  unexpected: 'Failed',
  flaky: 'Flaky',
  skipped: 'Skipped',
};

const OUTCOME_CLASS = {
  expected: 'passed',
  unexpected: 'failed',
  flaky: 'flaky',
  skipped: 'skipped',
};

const CSS = `
  @page { margin: 20mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    color: #1a1a1a;
    font-size: 12px;
    margin: 0;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .rule { border: none; border-top: 3px solid #2f7a4f; margin: 0 0 6px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 20px; }
  .summary { display: flex; gap: 10px; margin-bottom: 24px; }
  .card {
    flex: 1;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 10px 12px;
    text-align: center;
  }
  .card .num { font-size: 24px; font-weight: 700; display: block; }
  .card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
  .card.total .num { color: #1a1a1a; }
  .card.passed .num { color: #1a7a3c; }
  .card.failed .num { color: #b3261e; }
  .card.flaky .num { color: #b3730e; }
  .card.skipped .num { color: #666; }
  h2 {
    font-size: 14px;
    margin: 24px 0 2px;
    padding-bottom: 4px;
    border-bottom: 1px solid #ddd;
  }
  .file-meta { color: #888; font-size: 10px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th {
    color: #666;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-weight: 600;
  }
  td.duration, th.duration { text-align: right; white-space: nowrap; }
  .status {
    display: inline-block;
    font-weight: 600;
    font-size: 10px;
    padding: 1px 8px;
    border-radius: 10px;
  }
  .status.passed { background: #e4f4e9; color: #1a7a3c; }
  .status.failed { background: #fbe7e5; color: #b3261e; }
  .status.flaky { background: #fdf1de; color: #b3730e; }
  .status.skipped { background: #eee; color: #666; }
  .error {
    font-family: "SF Mono", Consolas, monospace;
    font-size: 9.5px;
    color: #b3261e;
    white-space: pre-wrap;
    background: #fff6f5;
    border: 1px solid #f3d7d4;
    border-radius: 6px;
    padding: 6px 8px;
    margin: 0 0 6px;
  }
`;

class PdfReporter {
  onBegin(config, suite) {
    this.suite = suite;
    this.config = config;
    this.startedAt = new Date();
  }

  async onEnd(result) {
    const tests = this.suite.allTests();
    const byFile = new Map();

    let passed = 0;
    let failed = 0;
    let flaky = 0;
    let skipped = 0;
    let totalDurationMs = 0;

    for (const test of tests) {
      const outcome = test.outcome(); // 'expected' | 'unexpected' | 'flaky' | 'skipped'
      if (outcome === 'expected') passed++;
      else if (outcome === 'unexpected') failed++;
      else if (outcome === 'flaky') flaky++;
      else skipped++;

      const file = path.basename(test.location.file);
      const lastResult = test.results[test.results.length - 1];
      const duration = lastResult ? lastResult.duration : 0;
      totalDurationMs += duration;

      const titleParts = test.titlePath();
      // titlePath is [root, project, file, ...describe blocks, test title];
      // drop the root/project/file entries, keep only the describe > test part
      const name = titleParts.slice(3).join(' > ') || test.title;

      let errorText = null;
      if (outcome === 'unexpected' && lastResult && lastResult.errors && lastResult.errors.length > 0) {
        errorText = lastResult.errors.map((e) => e.message || String(e)).join('\n').slice(0, 1200);
      }

      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push({ name, outcome, duration, errorText, retries: test.results.length - 1 });
    }

    const total = tests.length;
    const finishedAt = new Date();

    const sections = [...byFile.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, rows]) => {
        const rowsHtml = rows
          .map((r) => {
            const cls = OUTCOME_CLASS[r.outcome];
            const label = OUTCOME_LABEL[r.outcome];
            const retryNote = r.retries > 0 ? ` (${r.retries} retry)` : '';
            const errorBlock = r.errorText
              ? `<tr><td colspan="3"><div class="error">${escapeHtml(r.errorText)}</div></td></tr>`
              : '';
            return `
              <tr>
                <td>${escapeHtml(r.name)}</td>
                <td><span class="status ${cls}">${label}${escapeHtml(retryNote)}</span></td>
                <td class="duration">${formatMs(r.duration)}</td>
              </tr>
              ${errorBlock}
            `;
          })
          .join('');

        const filePassed = rows.filter((r) => r.outcome === 'expected').length;
        return `
          <h2>${escapeHtml(file)}</h2>
          <p class="file-meta">${filePassed} of ${rows.length} passed</p>
          <table>
            <thead>
              <tr><th>Test</th><th>Status</th><th class="duration">Duration</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `;
      })
      .join('');

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Test Report</title>
<style>${CSS}</style>
</head>
<body>
  <h1>Mills-Operation, Playwright Test Report</h1>
  <hr class="rule">
  <p class="meta">
    Run started ${this.startedAt.toLocaleString()}, finished ${finishedAt.toLocaleString()}.
    Overall result: ${escapeHtml(result.status)}.
  </p>

  <div class="summary">
    <div class="card total"><span class="num">${total}</span><span class="label">Total</span></div>
    <div class="card passed"><span class="num">${passed}</span><span class="label">Passed</span></div>
    <div class="card failed"><span class="num">${failed}</span><span class="label">Failed</span></div>
    <div class="card flaky"><span class="num">${flaky}</span><span class="label">Flaky</span></div>
    <div class="card skipped"><span class="num">${skipped}</span><span class="label">Skipped</span></div>
  </div>

  ${sections || '<p>No tests ran.</p>'}
</body>
</html>`;

    const tmpHtmlPath = path.join(__dirname, '_test-report.html');
    fs.writeFileSync(tmpHtmlPath, html);

    try {
      // Uses playwright's own installed chromium, the same one running the
      // tests, so no extra browser download or dependency is needed just to
      // render this report.
      const { chromium } = require('playwright');
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto('file://' + tmpHtmlPath.replace(/\\/g, '/'));
      await page.pdf({
        path: OUT_PATH,
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      });
      await browser.close();
      console.log(`\nPDF test report written to ${OUT_PATH}`);
    } catch (err) {
      console.error('Could not generate the PDF test report:', err);
    } finally {
      fs.unlinkSync(tmpHtmlPath);
    }
  }
}

module.exports = PdfReporter;
