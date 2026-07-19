import { expect, test, type Page } from '@playwright/test';
import { COMPANION_ANIMATION_MANIFEST } from '@our-companion/shared';
import path from 'node:path';
import { UiElectronFixture } from './ui-fixture';

async function captureFullCreationSurface(page: Page, output: string) {
  await page.evaluate(() => {
    document.documentElement.style.setProperty('height', 'auto', 'important');
    document.documentElement.style.setProperty('overflow', 'visible', 'important');
    document.body.style.setProperty('height', 'auto', 'important');
    document.body.style.setProperty('overflow', 'visible', 'important');
    document.querySelector<HTMLElement>('#root')?.style.setProperty('height', 'auto', 'important');
    document.querySelector<HTMLElement>('#root')?.style.setProperty('overflow', 'visible', 'important');
    document.querySelector<HTMLElement>('.creation-shell')?.style.setProperty('height', 'auto', 'important');
    document.querySelector<HTMLElement>('.companion-creation-page, .edit-page')?.style.setProperty('max-height', 'none', 'important');
    document.querySelector<HTMLElement>('.companion-creation-page, .edit-page')?.style.setProperty('height', 'auto', 'important');
    document.querySelector<HTMLElement>('.companion-creation-page, .edit-page')?.style.setProperty('overflow', 'visible', 'important');
  });
  await page.screenshot({ path: output, animations: 'disabled', fullPage: true });
  await page.reload();
}

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
    const assetStep = creation.locator('.creation-step[data-step="4"]');
    await expect(assetStep).toHaveAttribute('data-motion-state', 'entered');
    const slots = assetStep.locator('[data-animation-key]');
    await expect(slots).toHaveCount(COMPANION_ANIMATION_MANIFEST.length);
    await expect(assetStep.locator('[data-animation-key][data-required="true"]')).toHaveCount(
      COMPANION_ANIMATION_MANIFEST.filter((entry) => entry.requiredForCreation).length,
    );
    expect(await slots.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-animation-key'))))
      .toEqual(COMPANION_ANIMATION_MANIFEST.map((entry) => entry.key));
    await expect(assetStep.getByText(/Missing required animations: Idle_Neutral/)).toBeVisible();
    const overflow = await creation.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.body).toBeLessThanOrEqual(1);
    expect(overflow.root).toBeLessThanOrEqual(1);
    await device.screenshot(creation, 'creation/assets.png');
    await captureFullCreationSurface(creation, path.join(device.artifactDir, 'creation/assets-all-29.png'));
  } finally { await device.close(); }
});

test('Companion editor shows all 29 slots and commits optional deletion with the profile', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const creation = await device.creationWindow();
    const companionCard = creation.locator('.companion-card').filter({ hasText: 'Smoke Companion' });
    await companionCard.getByRole('button', { name: 'Edit' }).click();

    const slots = creation.locator('[data-animation-key]');
    await expect(slots).toHaveCount(COMPANION_ANIMATION_MANIFEST.length);
    const requiredSlot = creation.locator('[data-animation-key="Idle_Neutral"]');
    const optionalSlot = creation.locator('[data-animation-key="Idle_Breathe"]');
    await expect(requiredSlot.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    await expect(requiredSlot.getByRole('button', { name: 'Replace' })).toBeVisible();
    await captureFullCreationSurface(creation, path.join(device.artifactDir, 'creation/editor-all-29-uploaded.png'));
    const companionCardAfterReload = creation.locator('.companion-card').filter({ hasText: 'Smoke Companion' });
    await companionCardAfterReload.getByRole('button', { name: 'Edit' }).click();
    const optionalSlotAfterReload = creation.locator('[data-animation-key="Idle_Breathe"]');
    await optionalSlotAfterReload.getByRole('button', { name: 'Remove' }).click();
    await expect(optionalSlotAfterReload.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();

    await creation.getByPlaceholder('Companion name').fill('Atomic Editor');
    await creation.getByRole('button', { name: 'Save Changes' }).click();
    await expect(creation.getByText('Atomic Editor')).toBeVisible();

    const updatedCard = creation.locator('.companion-card').filter({ hasText: 'Atomic Editor' });
    await updatedCard.getByRole('button', { name: 'Edit' }).click();
    await expect(creation.locator('[data-animation-key="Idle_Breathe"]').getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
    await device.screenshot(creation, 'creation/editor-29-slots.png');
  } finally { await device.close(); }
});
