/**
 * Copilot behaviors not already covered by tests/dashboard.spec.js: clearing
 * the chat, and the conversation surviving a tab switch away and back (it is
 * deliberately kept in App.tsx, not inside FleetCopilotPage, for exactly
 * this reason, see the comment next to copilotMessages in App.tsx).
 */

const { test, expect } = require('@playwright/test');

test.describe('Copilot extras', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('fleet-card-STAND-01').click();
    await page.getByRole('button', { name: 'Copilot' }).click();
  });

  test('the clear chat button is hidden until there is a conversation, then empties it', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Clear chat' })).toHaveCount(0);

    await page.getByPlaceholder('Ask about the fleet...').fill('Which stand is running hottest?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('copilot-chat')).toContainText('STAND-', { timeout: 20_000 });

    await page.getByRole('button', { name: 'Clear chat' }).click();
    await expect(page.getByTestId('copilot-chat')).toContainText('Ask a question to get started');
    await expect(page.getByRole('button', { name: 'Clear chat' })).toHaveCount(0);
  });

  test('switching to another tab and back keeps the conversation intact', async ({ page }) => {
    await page.getByPlaceholder('Ask about the fleet...').fill('Which stand has the highest bearing temperature?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('copilot-chat')).toContainText('STAND-', { timeout: 20_000 });

    await page.getByRole('button', { name: 'Live monitor' }).click();
    await expect(page.getByTestId('current-readings-panel')).toBeVisible();

    await page.getByRole('button', { name: 'Copilot' }).click();
    await expect(page.getByTestId('copilot-chat')).toContainText('Which stand has the highest bearing temperature?');
    await expect(page.getByTestId('copilot-chat')).toContainText('STAND-');
  });

  test('the send button is disabled with an empty question', async ({ page }) => {
    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeDisabled();

    await page.getByPlaceholder('Ask about the fleet...').fill('  ');
    await expect(sendButton).toBeDisabled();

    await page.getByPlaceholder('Ask about the fleet...').fill('Hello');
    await expect(sendButton).toBeEnabled();
  });
});
