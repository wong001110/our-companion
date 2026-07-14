import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Confirm dialog exits before removal and restores focus to its opener', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('button', { name: 'Change Server' }).click();
    const save = panel.getByRole('button', { name: 'Save Server' });
    await save.click();

    const backdrop = panel.locator('.confirm-dialog-backdrop');
    const dialog = panel.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await device.screenshot(panel, 'feedback/dialog.png');
    await panel.keyboard.press('Escape');
    await expect(backdrop).toHaveAttribute('data-motion-state', 'exiting');
    await panel.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await expect(backdrop).toHaveCount(0, { timeout: 1_000 });
    await expect(save).toBeFocused();
  } finally { await device.close(); }
});
