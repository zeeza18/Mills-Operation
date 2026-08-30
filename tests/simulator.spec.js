/**
 * The degradation simulator: manual signal editing, the timed degrade run,
 * the live readings panel that replaces the editable inputs while a run is
 * active, and reset.
 */

const { test, expect } = require('@playwright/test');

test.describe('Degradation simulator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('fleet-card-STAND-01').click();
    await page.getByRole('button', { name: 'Degradation simulator' }).click();
    // start from a known, freshly reset state so tests do not depend on
    // whatever an earlier test left the shared simulator buffer in. Reset's
    // own click handler awaits a real API round trip before it repopulates
    // the (controlled) signal inputs; without waiting for that response,
    // the next test's very first fill can land before it resolves, and gets
    // silently overwritten the moment React re-renders with the reset
    // values, which is exactly what made this look like a slow network flake.
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/simulator/reset') && r.ok()),
      page.getByRole('button', { name: 'Reset' }).click(),
    ]);
  });

  test('starts on the editable Signal values panel, not a live readout', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Signal values' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Live readings' })).toHaveCount(0);
    await expect(page.getByText('Normal', { exact: true })).toBeVisible();
  });

  test('editing one signal by hand correlates the other four', async ({ page }) => {
    const vibrationInput = page.locator('label', { hasText: 'Vibration' }).locator('input');
    await vibrationInput.fill('9.5');
    await vibrationInput.blur();

    const tempInput = page.locator('label', { hasText: 'Bearing Temp' }).locator('input');
    // commitDraft awaits a real network round trip (api.simulatorCorrelate)
    // before the field updates; 5s was tight enough to flake under a slower
    // production preview build (the same build CI runs against), other
    // network backed waits in this suite already use 15s, so match that
    await expect(async () => {
      const value = Number(await tempInput.inputValue());
      expect(value).toBeGreaterThan(80); // baseline is ~58, failure target is 92
    }).toPass({ timeout: 15_000 });
  });

  test('the duration caption shows how many real seconds a run will take', async ({ page }) => {
    const input = page.locator('input[type="number"]').first();
    await input.fill('30');
    await expect(page.getByText(/plays out in about 12\.0s/)).toBeVisible();
  });

  test('starting a run switches to a live, ticking readings panel', async ({ page }) => {
    await page.getByRole('button', { name: 'Start degradation' }).click();

    await expect(page.getByRole('heading', { name: 'Live readings' })).toBeVisible();
    await expect(page.getByText('live', { exact: true })).toBeVisible();
    await expect(page.getByText('Degrading...')).toBeVisible();
  });

  test('a full run reaches the failure targets and trips an alert', async ({ page }) => {
    await page.getByRole('button', { name: 'Start degradation' }).click();

    await expect(page.getByText('Alert', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Alert triggered at minute \d+ of 15/)).toBeVisible();

    // the alert can trip well before the run finishes; the signal keeps
    // ramping for the rest of the 15 minutes, so wait for the whole run to
    // actually complete (the button reverts once running flips back to
    // false) before reading the final value, not just the first crossing
    await expect(page.getByRole('button', { name: 'Start degradation' })).toBeVisible({ timeout: 10_000 });

    // the run always converges on the vibration failure target (9.5), plus
    // some random noise on the final tick, so check a wide band around it
    // instead of an exact figure that noise would occasionally miss
    const panel = page.getByRole('heading', { name: 'Live readings' }).locator('..');
    const panelText = await panel.innerText();
    const match = panelText.match(/VIBRATION\s*\n?([\d.]+)/i);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThan(7); // baseline is ~2.2, failure target is 9.5
  });

  test('reset returns to the editable panel and clears the run history', async ({ page }) => {
    await page.getByRole('button', { name: 'Start degradation' }).click();
    await expect(page.getByText('Alert', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Reset' }).click();

    await expect(page.getByRole('heading', { name: 'Signal values' })).toBeVisible();
    await expect(page.getByText('Normal', { exact: true })).toBeVisible();
    await expect(page.getByText('Vibration during this run')).toHaveCount(0);
  });

  test('the duration input rejects non positive values', async ({ page }) => {
    const input = page.locator('input[type="number"]').first();
    await input.fill('0');
    await expect(input).toHaveValue('1');
  });
});
