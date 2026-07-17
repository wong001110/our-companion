import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Creation step exits, enters, reverses direction, and preserves form data', async () => {
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
    await device.screenshot(creation, 'creation/step-1.png');
    await creation.getByTestId('creation-next').click();
    const firstStep = creation.locator('.creation-step[data-step="1"]');
    const description = creation.getByTestId('creation-description');
    // Electron can coalesce a short exit transition before Playwright resumes
    // after the click. The observable contract is that the outgoing step is
    // removed only once the entered destination receives focus.
    await expect(firstStep).toHaveCount(0, { timeout: 1_000 });
    await expect(description.locator('xpath=..')).toHaveAttribute('data-motion-state', 'entered');
    await expect(description).toBeFocused();
    await description.fill('Quiet, curious, and kind.');
    await expect(creation.getByTestId('creation-analyze')).toBeEnabled();
    await device.screenshot(creation, 'creation/step-2.png');

    await creation.getByTestId('creation-back').click();
    const secondStep = creation.locator('.creation-step[data-step="2"]');
    await expect(secondStep).toHaveAttribute('data-motion-state', 'exiting');
    await expect(secondStep).toHaveClass(/creation-step-back/);
    await expect(name).toBeVisible();
    await expect(name).toHaveValue('Nova');
    await expect(name).toBeFocused();

    await creation.getByTestId('creation-next').click();
    await expect(description).toBeFocused();
    await expect(description).toHaveValue('Quiet, curious, and kind.');
    await creation.getByTestId('creation-analyze').click();
    const assets = creation.getByTestId('creation-assets');
    await expect(assets).toHaveAttribute('data-motion-state', 'entered', { timeout: 10_000 });
    await device.screenshot(creation, 'creation/step-3.png');
    await assets.getByRole('button', { name: 'Next' }).click();
    await expect(creation.locator('.creation-step[data-step="4"]')).toHaveAttribute('data-motion-state', 'entered');
    await device.screenshot(creation, 'creation/assets.png');
  } finally { await device.close(); }
});
