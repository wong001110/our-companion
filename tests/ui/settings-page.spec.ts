import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Settings organizes controls into explicit categories', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Settings' }).click();
    const categories = panel.getByRole('tab');
    await expect(categories).toHaveCount(8);
    await panel.getByRole('tab', { name: 'Voice' }).click();
    await expect(panel.getByText('Voice', { exact: true }).last()).toBeVisible();
    await device.screenshot(panel, 'en/settings-1180.png');
  } finally { await device.close(); }
});
