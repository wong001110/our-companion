import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Discovery presentation survives both IPC orders and remains clickable', async () => {
  test.setTimeout(60_000);
  const device = new UiElectronFixture();
  let scenarioFailure: unknown;
  try {
    await device.launch();
    const companion = await device.mainWindow();
    await expect(companion.getByRole('figure')).toBeVisible();
    await companion.waitForTimeout(500);

    for (const order of ['command_payload', 'payload_command'] as const) {
      const fixture = await companion.evaluate((value) =>
        window.ourCompanion.smoke!.presentDiscoveryFixture({ order: value, displayHint: 'present_discovery' }), order);
      const card = companion.locator('.discovery-popout-card').filter({ hasText: fixture.title });
      await expect(card).toBeVisible();
      await card.locator('.card-close-btn').click();
      await expect(card).toBeHidden();
    }

    const softHintFixture = await companion.evaluate(() =>
      window.ourCompanion.smoke!.presentDiscoveryFixture({
        order: 'command_payload',
        displayHint: 'show_soft_hint',
      }));
    const hint = companion.locator('.companion-soft-hint');
    await expect(hint).toBeVisible();
    await hint.getByRole('button', { name: 'Show me' }).click();
    const card = companion.locator('.discovery-popout-card').filter({ hasText: softHintFixture.title });
    await expect(card).toBeVisible();
    await card.locator('.card-close-btn').click();
    await expect(card).toBeHidden();
  } catch (cause) {
    scenarioFailure = cause;
  }
  try {
    await device.close();
  } catch (closeFailure) {
    const knownHarnessTimeout = closeFailure instanceof Error && closeFailure.message === 'UI_ELECTRON_CLOSE_TIMEOUT';
    if (!scenarioFailure && !knownHarnessTimeout) throw closeFailure;
  }
  if (scenarioFailure) throw scenarioFailure;
});
