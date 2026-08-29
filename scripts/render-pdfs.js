/**
 * Converts the HTML files built by build_deliverable_html.py into PDFs.
 * Run with: node scripts/render-pdfs.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HTML_DIR = path.join(__dirname, '..', 'deliverables', '_html');
const OUT_DIR = path.join(__dirname, '..', 'deliverables');

async function main() {
  const files = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'));
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const file of files) {
    const htmlPath = path.join(HTML_DIR, file);
    const pdfPath = path.join(OUT_DIR, file.replace('.html', '.pdf'));
    await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
    await page.waitForTimeout(200);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    });
    console.log('Wrote', pdfPath);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
