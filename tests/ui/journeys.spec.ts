import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Toast enters, exits, and unmounts after creating a journey', async () => {
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
    await toast.evaluate((element) => {
      const target = window as typeof window & { __toastMotionStates?: Array<string | null> };
      target.__toastMotionStates = [element.getAttribute('data-motion-state')];
      new MutationObserver(() => target.__toastMotionStates?.push(element.getAttribute('data-motion-state')))
        .observe(element, { attributes: true, attributeFilter: ['data-motion-state'] });
    });
    await device.screenshot(panel, 'feedback/toast.png');
    await expect(toast).toHaveCount(0, { timeout: 6_000 });
    expect(await panel.evaluate(() => (window as typeof window & { __toastMotionStates?: Array<string | null> }).__toastMotionStates)).toContain('exiting');
  } finally {
    await device.close();
  }
});
