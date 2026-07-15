import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Startup speech bubble enters, exits, and unmounts after its exit duration', async () => {
  test.setTimeout(15_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const bubble = main.locator('.speech-bubble');
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveAttribute('data-motion-state', 'entered');
    await bubble.evaluate((element) => {
      const target = window as typeof window & { __speechMotionStates?: Array<string | null> };
      target.__speechMotionStates = [element.getAttribute('data-motion-state')];
      new MutationObserver(() => target.__speechMotionStates?.push(element.getAttribute('data-motion-state')))
        .observe(element, { attributes: true, attributeFilter: ['data-motion-state'] });
    });
    await device.screenshot(main, 'feedback/speech-bubble.png');
    await expect(bubble).toHaveCount(0, { timeout: 8_000 });
    expect(await main.evaluate(() => (window as typeof window & { __speechMotionStates?: Array<string | null> }).__speechMotionStates)).toContain('exiting');
  } finally { await device.close(); }
});
