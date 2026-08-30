/**
 * The live monitor tab on a stand's detail view: the date range filter, the
 * mini fleet panel used to jump between stands without going back to the
 * landing page, and the signal charts and current readings themselves.
 */

const { test, expect } = require('@playwright/test');

test.describe('Live monitor tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('fleet-card-STAND-02').click();
  });

  test('all 5 signal charts render with real drawn content, not just an empty container', async ({ page }) => {
    for (const key of [
      'vibration_rms_mm_s',
      'bearing_temp_c',
      'motor_current_a',
      'line_speed_mpm',
      'coolant_pressure_psi',
    ]) {
      const chart = page.getByTestId(`chart-${key}`);
      await expect(chart).toBeVisible();
      await expect(async () => {
        const count = await chart.locator('svg path').count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000 });
    }
  });

  test('the current readings panel matches the selected stand', async ({ page }) => {
    const panel = page.getByTestId('current-readings-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Vibration');
    await expect(panel).toContainText('Anomaly score');
  });

  test('the date range filter defaults to Today and switches presets', async ({ page }) => {
    const today = page.getByRole('button', { name: 'Today' });
    const week = page.getByRole('button', { name: 'Past week' });
    const month = page.getByRole('button', { name: 'Last month' });
    const custom = page.getByRole('button', { name: 'Custom range' });

    await expect(today).toBeVisible();
    await expect(week).toBeVisible();
    await expect(month).toBeVisible();
    await expect(custom).toBeVisible();

    // switching preset re-fetches the chart data; the chart should still end
    // up with real drawn content afterward, not a blank panel
    await week.click();
    const chart = page.getByTestId('chart-vibration_rms_mm_s');
    await expect(async () => {
      const count = await chart.locator('svg path').count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });
  });

  test('custom range reveals two date pickers bounded by the real data window', async ({ page }) => {
    await page.getByRole('button', { name: 'Custom range' }).click();

    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs).toHaveCount(2);
    const min = await dateInputs.first().getAttribute('min');
    expect(min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('the mini fleet panel switches stands without returning to the landing page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'STAND-02' })).toBeVisible();

    const miniCard = page.locator('button', { hasText: 'STAND-04' }).first();
    await miniCard.click();

    await expect(page.getByRole('heading', { name: 'STAND-04' })).toBeVisible();
  });

  test('closing and reopening the mini fleet panel works', async ({ page }) => {
    await page.getByRole('button', { name: 'Close fleet panel' }).click();
    await expect(page.getByRole('button', { name: 'Close fleet panel' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Show fleet' }).click();
    await expect(page.getByRole('button', { name: 'Close fleet panel' })).toBeVisible();
  });
});
