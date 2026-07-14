import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Memories supports create, edit, cancel, and save without losing fields', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Memories' }).click();

    await panel.getByLabel('Title').fill('First memory');
    await panel.getByLabel('Memory').fill('The complete memory content.');
    await panel.getByLabel('Summary').fill('A short saved summary.');
    await panel.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'First memory' })).toBeVisible();
    await expect(panel.getByText('Memory saved.').first()).toBeVisible();

    const card = panel.locator('.memory-card', { hasText: 'First memory' });
    await card.getByRole('button', { name: 'Edit' }).click();
    await expect(panel.getByLabel('Title')).toHaveValue('First memory');
    await expect(panel.getByLabel('Memory')).toHaveValue('The complete memory content.');
    await panel.getByLabel('Title').fill('Discarded title');
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'First memory' })).toBeVisible();

    await card.getByRole('button', { name: 'Edit' }).click();
    await panel.getByLabel('Title').fill('Updated memory');
    await panel.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Updated memory' })).toBeVisible();
    await expect(panel.getByText('Memory saved.').first()).toBeVisible();
  } finally {
    await device.close();
  }
});
