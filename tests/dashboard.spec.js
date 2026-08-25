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

  test('selecting a stand renders its signal charts', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('fleet-card-STAND-02').click();

    for (const key of [
      'vibration_rms_mm_s',
      'bearing_temp_c',
      'motor_current_a',
      'line_speed_mpm',
      'coolant_pressure_psi',
    ]) {
      await expect(page.getByTestId(`chart-${key}`)).toBeVisible();
    }
  });

  test('copilot button produces a real explanation for the selected stand', async ({ page }) => {
    await page.goto('/');

    const button = page.getByTestId('explain-button');
    await expect(button).toBeVisible();
    await button.click();

    await expect(page.getByTestId('explain-response')).toBeVisible({ timeout: 20_000 });
    const text = await page.getByTestId('explain-response').innerText();
    expect(text.length).toBeGreaterThan(20);
  });
});
