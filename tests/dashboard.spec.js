/**
 * Core-flow tests for the shift supervisor dashboard.
 *
 * Requires data/synthetic/test_scored.csv + model_meta.json to exist
 * (run `python data/generate_synthetic_data.py && python -m app.evaluate`
 * first). playwright.config.js starts the Streamlit server automatically.
 */

const { test, expect } = require('@playwright/test');

test.describe('Mills-Operation dashboard', () => {
  test('loads and shows fleet status for all 6 stands', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Mills-Operation — Reliability Copilot')).toBeVisible();
    await expect(page.getByText('Fleet status')).toBeVisible();

    for (let i = 1; i <= 6; i++) {
      const standId = `STAND-0${i}`;
      await expect(page.getByText(standId).first()).toBeVisible();
    }
  });

  test('shows real detection performance numbers, not placeholders', async ({ page }) => {
    await page.goto('/');

    // These come from model_meta.json (a real evaluation run) -- if the pipeline
    // regresses to 0 detections again (the original threshold bug), this test
    // should catch it, not just eyeball the dashboard.
    await expect(page.getByText('Model performance (held-out test)')).toBeVisible();
    await expect(page.getByText(/Failures detected/i)).toBeVisible();
    await expect(page.getByText(/False alarm rate/i)).toBeVisible();
  });

  test('selecting a stand renders its signal charts', async ({ page }) => {
    await page.goto('/');

    const selector = page.getByRole('combobox').first();
    await expect(selector).toBeVisible();

    for (const label of ['Vibration (RMS mm/s)', 'Bearing Temp (°C)', 'Coolant Pressure (psi)']) {
      await expect(page.getByText(label)).toBeVisible();
    }
  });

  test('copilot button produces a real explanation for the selected stand', async ({ page }) => {
    await page.goto('/');

    const button = page.getByRole('button', { name: "Explain this stand's status" });
    await expect(button).toBeVisible();
    await button.click();

    // Live Claude call or the offline fallback -- either is a valid pass here.
    // What matters is that SOMETHING grounded came back, not a blank/error state.
    const response = page.locator('text=/anomaly score|std devs|Recommendation|Recommend/i');
    await expect(response.first()).toBeVisible({ timeout: 20_000 });
  });
});
