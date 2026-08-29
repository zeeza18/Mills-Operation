/**
 * Core-flow tests for the React reliability console.
 *
 * Requires data/synthetic/test_scored.csv + model_meta.json to exist
 * (run `python data/generate_synthetic_data.py && python -m app.evaluate`
 * first). playwright.config.js starts both the FastAPI backend and the
 * Vite dev server automatically.
 */

const { test, expect } = require('@playwright/test');

test.describe('Mills-Operation reliability console', () => {
  test('loads and shows fleet status for all 6 stands', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Reliability Console')).toBeVisible();
    await expect(page.getByTestId('fleet-strip')).toBeVisible();

    for (let i = 1; i <= 6; i++) {
      await expect(page.getByTestId(`fleet-card-STAND-0${i}`)).toBeVisible();
    }
  });

  test('shows real detection performance numbers, not placeholders', async ({ page }) => {
    await page.goto('/');

    const panel = page.getByTestId('status-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('11/11');
    await expect(panel).toContainText('%');
  });

  test('selecting a stand renders its signal charts with real content', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('fleet-card-STAND-02').click();

    for (const key of [
      'vibration_rms_mm_s',
      'bearing_temp_c',
      'motor_current_a',
      'line_speed_mpm',
      'coolant_pressure_psi',
    ]) {
      const chart = page.getByTestId(`chart-${key}`);
      await expect(chart).toBeVisible();
      // The container div is visible the moment its title renders, even if the
      // chart inside never draws anything. This app shipped exactly that bug
      // once (12,960 undownsampled points silently failed to render), and this
      // toBeVisible-on-the-wrapper check alone did not catch it. The line always
      // renders at least one SVG path; alert markers add more, so check for at
      // least one, not an exact count.
      await expect(async () => {
        const count = await chart.locator('svg path').count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000 });
    }
  });

  test('copilot tab produces a real explanation for the selected stand', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('fleet-card-STAND-01').click();
    await page.getByRole('button', { name: 'Copilot' }).click();

    const button = page.getByTestId('explain-button');
    await expect(button).toBeVisible();
    await button.click();

    await expect(page.getByTestId('explain-response')).toBeVisible({ timeout: 20_000 });
    const text = await page.getByTestId('explain-response').innerText();
    expect(text.length).toBeGreaterThan(20);
  });

  test('fleet copilot chat answers a free-text question and keeps history visible', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('fleet-card-STAND-01').click();
    await page.getByRole('button', { name: 'Copilot' }).click();

    await page.getByPlaceholder('Ask about the fleet...').fill('Which stand has the highest bearing temperature?');
    await page.getByRole('button', { name: 'Send' }).click();

    const chat = page.getByTestId('copilot-chat');
    await expect(chat).toContainText('STAND-', { timeout: 20_000 });
    // both the question and the answer should still be visible, this is a
    // chat log, not a single-exchange panel that replaces itself
    await expect(chat).toContainText('Which stand has the highest bearing temperature?');
  });
});
