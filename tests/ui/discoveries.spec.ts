import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Discoveries exposes localized filters and an empty state in the panel', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Discoveries' }).click();
    await expect(panel.getByRole('heading', { name: 'Discoveries' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'Design' }).click();
    await expect(panel.getByRole('button', { name: 'Design' })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByText('A quiet page')).toBeVisible();
  } finally {
    await device.close();
  }
});
