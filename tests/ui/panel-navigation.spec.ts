import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Panel page exits before removal, then enters with focus and reset scroll', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await expect(panel.getByRole('button', { name: 'Home' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Chat' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Discoveries' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Journeys' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Memories' })).toBeVisible();
    await device.screenshot(panel, 'panel/home.png');
    const social = panel.getByRole('button', { name: 'Social' });
    await social.click();
    await expect(social).toHaveAttribute('aria-current', 'page');
    const homePage = panel.getByTestId('panel-page-home');
    await expect(homePage).toHaveAttribute('data-motion-state', 'exiting');
    await expect(homePage).toBeVisible();
    const socialPage = panel.getByTestId('panel-page-social');
    await expect(homePage).toHaveCount(0, { timeout: 1_000 });
    await expect(socialPage).toHaveAttribute('data-motion-state', 'entered');
    await expect(panel.getByTestId('social-panel')).toBeVisible();
    await expect(socialPage).toBeFocused();
    expect(await panel.locator('.workspace').evaluate((element) => element.scrollTop)).toBe(0);
    await device.screenshot(panel, 'panel/social.png');
  } finally { await device.close(); }
});

test('Panel rapid navigation keeps the newest target without blank or stale pages', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Social' }).click();
    await expect(panel.getByTestId('panel-page-home')).toHaveAttribute('data-motion-state', 'exiting');
    await panel.getByRole('button', { name: 'Settings' }).click();
    const settingsPage = panel.getByTestId('panel-page-settings');
    await expect(settingsPage).toHaveAttribute('data-motion-state', 'entered');
    await expect(settingsPage).toBeFocused();
    await expect(panel.getByTestId('panel-page-home')).toHaveCount(0);
    await expect(panel.getByTestId('panel-page-social')).toHaveCount(0);
    await device.screenshot(panel, 'panel/settings.png');
  } finally { await device.close(); }
});

test('Panel target tabs reject invalid runtime input and never blank the current page', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await expect(main.evaluate(async () => {
      const openPanel = window.ourCompanion.window.openPanel as (input: unknown) => Promise<boolean>;
      await openPanel({ initialTab: 'invalid' });
    })).rejects.toThrow(/PANEL_TAB_INVALID/);
    const panel = await device.panelWindow();
    await expect(panel.getByTestId('panel-page-home')).toBeVisible();
  } finally { await device.close(); }
});
