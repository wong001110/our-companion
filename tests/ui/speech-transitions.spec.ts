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
    const text = (await bubble.textContent()) ?? '';
    const durationMs = Math.round(Array.from(text.replace('▍', '')).length * 45);
    await main.waitForTimeout(Math.max(0, durationMs - 70));
    await expect(bubble).toHaveAttribute('data-motion-state', 'exiting', { timeout: 300 });
    await expect(bubble).toHaveCount(0, { timeout: 1_000 });
  } finally { await device.close(); }
});
