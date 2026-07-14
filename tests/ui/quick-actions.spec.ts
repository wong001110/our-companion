import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Companion quick actions support hover, pin, and Escape dismissal', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const companion = main.locator('.companion-canvas');
    await companion.hover();
    // Assert before the 220ms visibility timer is allowed to settle; exact timing is
    // unit-covered by the visibility machine to avoid CI scheduling flake.
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible({ timeout: 2_000 });
    await device.screenshot(main, 'en/quick-actions-center.png');
    await companion.click();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible();
    await main.keyboard.press('Escape');
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
  } finally { await device.close(); }
});

test('More closes independently on Escape and restores its trigger focus', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.locator('.companion-canvas').click();
    const more = main.getByTestId('quick-action-more');
    await more.click();
    await expect(main.getByRole('menu')).toBeVisible();
    await device.screenshot(main, 'quick-actions/more-menu.png');
    await main.keyboard.press('Escape');
    await expect(main.getByRole('menu')).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible();
  } finally { await device.close(); }
});

test('Quick Actions use opacity-only motion when reduced motion is requested', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.emulateMedia({ reducedMotion: 'reduce' });
    await main.locator('.companion-canvas').click();
    const talk = main.getByTestId('quick-action-talk');
    await expect(talk).toBeVisible();
    expect(await talk.evaluate((element) => getComputedStyle(element).animationName)).toBe('quick-action-fade');
    await device.screenshot(main, 'reduced-motion/quick-actions.png');
  } finally { await device.close(); }
});

test('Quick Actions opens Panel Settings directly and preserves Talk active state', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.locator('.companion-canvas').click();
    await main.getByTestId('quick-action-more').click();
    await expect(main.getByRole('menu')).toBeVisible();
    await main.getByRole('menuitem', { name: 'Settings' }).click();
    const panel = await device.panelWindow();
    const settings = panel.getByRole('button', { name: 'Settings' });
    await expect(settings).toHaveAttribute('aria-current', 'page');
    await expect(panel.getByTestId('panel-page-settings')).toBeVisible();

    await main.locator('.companion-canvas').click();
    await main.getByTestId('quick-action-talk').click();
    const composer = main.locator('.companion-text-input');
    await expect(composer).toBeVisible();
    await expect(main.getByTestId('quick-action-talk')).toHaveAttribute('aria-pressed', 'true');
    await device.screenshot(main, 'quick-actions/talk-active.png');
    await main.keyboard.press('Escape');
    await expect(composer).toHaveAttribute('data-motion-state', 'exiting');
    await expect(composer).toHaveCount(0, { timeout: 1_000 });
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
  } finally { await device.close(); }
});
