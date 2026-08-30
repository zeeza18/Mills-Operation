/**
 * Fleet landing page and top level navigation: the screen every session
 * starts on, and the back/forward path between it and a stand's detail view.
 */

const { test, expect } = require('@playwright/test');

test.describe('Fleet landing and navigation', () => {
  test('landing page shows the title, all 6 stand cards, and no tab bar', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Reliability Console')).toBeVisible();
    await expect(page.getByText('Prototype for a hot mill shift supervisor')).toBeVisible();

    for (let i = 1; i <= 6; i++) {
      await expect(page.getByTestId(`fleet-card-STAND-0${i}`)).toBeVisible();
    }

    // the tab bar only appears once you are inside a stand or the simulator
    await expect(page.getByRole('button', { name: 'Live monitor' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to fleet' })).toHaveCount(0);
  });

  test('each stand card shows a status badge and live sensor readings', async ({ page }) => {
    await page.goto('/');

    const card = page.getByTestId('fleet-card-STAND-01');
    await expect(card).toContainText(/Normal|Alert/);
    await expect(card).toContainText('mm/s');
    await expect(card).toContainText('psi');
  });

  test('the model performance panel shows real numbers, not placeholders', async ({ page }) => {
    await page.goto('/');

    const panel = page.getByTestId('status-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('11/11');
    await expect(panel).toContainText('%');
  });

  test('opening a stand reveals the tab bar and back button, closing it returns to the fleet', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('fleet-card-STAND-03').click();
    await expect(page.getByRole('heading', { name: 'STAND-03' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Live monitor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Degradation simulator' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copilot' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to fleet' }).click();
    await expect(page.getByTestId('fleet-strip')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Live monitor' })).toHaveCount(0);
  });

  test('picking a different stand from the fleet updates the detail view', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('fleet-card-STAND-02').click();
    await expect(page.getByRole('heading', { name: 'STAND-02' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to fleet' }).click();
    await page.getByTestId('fleet-card-STAND-05').click();
    await expect(page.getByRole('heading', { name: 'STAND-05' })).toBeVisible();
  });
});
