import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Journeys creates a new notebook journey from its empty state', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Journeys' }).click();
    await expect(panel.getByText('No active journey yet')).toBeVisible();
    await panel.getByRole('button', { name: 'New', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'New exploration trail' })).toBeVisible();
    await expect(panel.getByText('New journey created.')).toBeVisible();
  } finally {
    await device.close();
  }
});
