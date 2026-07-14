import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Social is a top-level page with a clear unavailable state', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Social' }).click();
    await expect(panel.getByTestId('social-panel')).toBeVisible();
    await expect(panel.getByText('Online Mode is disabled.')).toBeVisible();
    await device.screenshot(panel, 'en/social-empty-1180.png');
  } finally { await device.close(); }
});
