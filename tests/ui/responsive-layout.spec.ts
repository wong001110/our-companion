import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Panel navigation remains available at the supported widths', async () => {
  test.setTimeout(60_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    for (const width of [760, 900, 1180, 1440]) {
      await panel.setViewportSize({ width, height: 720 });
      await expect(panel.locator('nav[aria-label="Primary navigation"]')).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Settings' })).toBeVisible();
      await device.screenshot(panel, `responsive/panel-${width}.png`);
    }
  } finally { await device.close(); }
});
