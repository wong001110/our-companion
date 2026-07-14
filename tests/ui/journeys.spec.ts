import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Journeys creates a new notebook journey from its empty state', async () => {
  test.setTimeout(15_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Journeys' }).click();
    await expect(panel.getByText('No active journey yet')).toBeVisible();
    await panel.getByRole('button', { name: 'New', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'New exploration trail' })).toBeVisible();
    const toast = panel.locator('.toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('New journey created.');
    await panel.waitForTimeout(3_900);
    await expect(toast).toHaveAttribute('data-motion-state', 'exiting', { timeout: 500 });
    await expect(toast).toHaveCount(0, { timeout: 1_000 });
  } finally {
    await device.close();
  }
});
