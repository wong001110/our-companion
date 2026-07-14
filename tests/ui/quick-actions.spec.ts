import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Companion quick actions support hover, pin, and Escape dismissal', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const companion = main.locator('.companion-canvas');
    await companion.hover();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible({ timeout: 2_000 });
    await device.screenshot(main, 'en/quick-actions-center.png');
    await companion.click();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible();
    await main.keyboard.press('Escape');
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
  } finally { await device.close(); }
});
