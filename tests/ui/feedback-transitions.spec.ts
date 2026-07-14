import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Confirm dialog exits before removal and restores focus to its opener', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const creation = await device.creationWindow();
    const opener = creation.getByRole('button', { name: 'Delete' });
    await opener.click();

    const backdrop = creation.locator('.confirm-dialog-backdrop');
    const dialog = creation.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(creation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await device.screenshot(creation, 'feedback/dialog.png');
    await creation.keyboard.press('Escape');
    await expect(backdrop).toHaveAttribute('data-motion-state', 'exiting');
    await creation.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await expect(backdrop).toHaveCount(0, { timeout: 1_000 });
    await expect(opener).toBeFocused();
  } finally { await device.close(); }
});
