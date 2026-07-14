import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Panel navigation exposes the complete top-level information architecture', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await expect(panel.getByRole('button', { name: 'Home' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Chat' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Discoveries' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Journeys' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Memories' })).toBeVisible();
    await device.screenshot(panel, 'en/home-1180.png');
    const social = panel.getByRole('button', { name: 'Social' });
    await social.click();
    await expect(social).toHaveAttribute('aria-current', 'page');
    const socialPage = panel.getByTestId('panel-page-social');
    await expect(socialPage).toHaveAttribute('data-motion-state', 'entered');
    await expect(panel.getByTestId('social-panel')).toBeVisible();
    await expect(socialPage).toBeFocused();
    await device.screenshot(panel, 'en/social-empty-1180.png');
  } finally { await device.close(); }
});
