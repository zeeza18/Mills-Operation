/**
 * The floating sound toggle: mute state, and the drag vs click distinction
 * that a prior bug got wrong (a real click's small pixel jitter used to
 * sometimes get misread as a drag and silently swallow the toggle).
 */

const { test, expect } = require('@playwright/test');

test.describe('Sound toggle', () => {
  test('starts muted, since audio cannot legally autoplay before a user gesture', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('sound-toggle');
    await expect(toggle).toHaveAttribute('title', /Alert sound off/);
  });

  test('a plain click turns sound on, and a second click turns it back off', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('sound-toggle');

    await toggle.click();
    await expect(toggle).toHaveAttribute('title', /Alert sound on/);

    await toggle.click();
    await expect(toggle).toHaveAttribute('title', /Alert sound off/);
  });

  test('dragging the button repositions it and does not toggle the mute state', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('sound-toggle');
    const before = await toggle.getAttribute('title');

    const box = await toggle.boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // move well past the 10px jitter threshold, in several steps so real
    // pointermove events fire along the way, not just a single teleport
    await page.mouse.move(startX - 120, startY - 60, { steps: 10 });
    await page.mouse.up();

    // a drag must not flip the mute state
    await expect(toggle).toHaveAttribute('title', before);

    const after = await toggle.boundingBox();
    expect(Math.abs(after.x - box.x)).toBeGreaterThan(50);
  });

  test('the dragged position is remembered across a reload', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('sound-toggle');
    const box = await toggle.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 150, box.y + 100, { steps: 10 });
    await page.mouse.up();
    const moved = await toggle.boundingBox();

    await page.reload();
    const afterReload = await page.getByTestId('sound-toggle').boundingBox();
    expect(Math.abs(afterReload.x - moved.x)).toBeLessThan(5);
    expect(Math.abs(afterReload.y - moved.y)).toBeLessThan(5);
  });
});
