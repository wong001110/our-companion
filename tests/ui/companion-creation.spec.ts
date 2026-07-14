import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Companion creation has an accessible, usable first-step flow', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const creation = await device.creationWindow();
    const createNew = creation.getByTestId('create-new-companion');
    await expect(createNew).toBeVisible();
    await expect(createNew).toHaveRole('button');
    await createNew.click();

    const name = creation.getByTestId('creation-name');
    await expect(name).toBeFocused();
    await name.fill('Nova');
    await creation.getByTestId('creation-next').click();
    const description = creation.getByTestId('creation-description');
    await expect(description.locator('xpath=..')).toHaveAttribute('data-motion-state', 'entered');
    await expect(description).toBeFocused();
    await description.fill('Quiet, curious, and kind.');
    await expect(creation.getByTestId('creation-analyze')).toBeEnabled();
    await device.screenshot(creation, 'en/creation-details.png');
  } finally { await device.close(); }
});
