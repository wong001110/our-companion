import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

const liveAiEnabled = process.env.OUR_COMPANION_UI_REAL_AI === '1';

/**
 * Opt-in evidence capture: uses only the configured provider and a fixed
 * non-private description. Normal UI regression runs never invoke an AI API.
 */
test('Creation reaches the real asset-upload stage after personality analysis', async () => {
  test.skip(!liveAiEnabled, 'Set OUR_COMPANION_UI_REAL_AI=1 with a configured DeepSeek key to run live creation QA.');
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const creation = await device.creationWindow();
    await creation.getByTestId('create-new-companion').click();
    await creation.getByTestId('creation-name').fill('QA Companion');
    await creation.getByTestId('creation-next').click();
    await creation.getByTestId('creation-description').fill('A curious, kind, and calm companion for a non-private UI quality-assurance flow.');
    await creation.getByTestId('creation-analyze').click();
    await expect(creation.getByTestId('creation-assets')).toBeVisible({ timeout: 90_000 });
    await creation.getByTestId('creation-assets').getByRole('button', { name: /next/i }).click();
    await expect(creation.getByText(/upload.*asset/i)).toBeVisible();
    await device.screenshot(creation, 'en/creation-assets-live-ai.png');
  } finally {
    await device.close();
  }
});
