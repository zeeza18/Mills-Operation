/**
 * One-off screenshot capture for the README, using Playwright directly
 * (not a test). Run with: node scripts/capture-screenshots.js
 * Requires the backend (port 8000) and frontend (port 5173) already running.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE_URL = 'http://localhost:5173';

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('1/4 fleet overview');
  await page.goto(BASE_URL);
  await page.waitForSelector('text=FLEET STATUS');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT_DIR, 'fleet-overview.png') });

  console.log('2/4 stand detail, past week');
  await page.getByTestId('fleet-card-STAND-01').click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Past week' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, 'stand-detail.png') });

  console.log('3/4 degradation simulator, live alert');
  await page.getByRole('button', { name: 'Degradation simulator' }).click();
  await page.waitForTimeout(500);
  const vibrationInput = page.locator('input[type="number"]').nth(1);
  await vibrationInput.click({ clickCount: 3 });
  await vibrationInput.fill('9.9');
  await vibrationInput.blur();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Start degradation' }).click();
  await page.waitForSelector('text=ALERT', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, 'simulator-alert.png') });
  await page.getByRole('button', { name: 'Reset' }).click();

  console.log('4/4 fleet copilot chat');
  await page.getByRole('button', { name: 'Copilot' }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Ask about the fleet...').fill('Which stand has the highest bearing temperature?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="copilot-chat"]')?.innerText.includes('STAND-'),
    { timeout: 20000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, 'copilot-chat.png') });

  await browser.close();
  console.log('Done. Screenshots saved to', OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
