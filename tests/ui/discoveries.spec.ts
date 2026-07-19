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

test('Discovery Sources can add, run, and manage an owned long-term query', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Discoveries' }).click();
    await panel.getByRole('tab', { name: 'Sources' }).click();
    await expect(panel.getByRole('heading', { name: 'Long-term Sources' })).toBeVisible();
    await expect(panel.getByText('Last checked', { exact: true }).first()).toBeVisible();
    await expect(panel.getByText('Last result', { exact: true }).first()).toBeVisible();

    await panel.getByRole('button', { name: 'Add Discovery Source', exact: true }).click();
    const dialog = panel.getByRole('dialog', { name: 'Add Discovery Source' });
    await dialog.getByLabel('Source type').selectOption('query');
    await dialog.getByLabel('URL, domain, or query').fill('  local-first   UI research  ');
    await dialog.getByLabel('Optional label').fill('UI research');
    await device.screenshot(panel, 'discovery-source-add-dialog.png');
    await dialog.getByRole('button', { name: 'Add Discovery Source' }).click();

    const sourceRow = panel.getByRole('row').filter({ hasText: 'local-first UI research' });
    await expect(sourceRow).toContainText('Search Topic');
    await expect(sourceRow).toContainText('Trial');
    await sourceRow.getByRole('button', { name: 'Run now' }).click();
    await expect(sourceRow).not.toContainText('Never');
    await sourceRow.getByRole('button', { name: 'Mute' }).click();
    await expect(sourceRow).toContainText('Muted');
    await sourceRow.getByRole('button', { name: 'Activate' }).click();
    await expect(sourceRow).toContainText('Active');
    await device.screenshot(panel, 'discovery-sources-managed.png');
  } finally {
    await device.close();
  }
});
