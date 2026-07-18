import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Exploration always completes the visible prepare, depart, away, return, and report lifecycle', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const companion = await device.mainWindow();
    const shell = companion.locator('main.companion-shell');
    const startedAt = Date.now();

    await companion.evaluate(() => {
      void window.ourCompanion.autonomy.startExploration({ trigger: 'manual' });
    });

    await expect(shell).toHaveAttribute('data-exploration-visual-phase', 'preparing', { timeout: 1_000 });
    await expect(shell).toHaveAttribute('data-exploration-visual-phase', 'departing', { timeout: 2_500 });
    await expect(shell).toHaveAttribute('data-exploration-visual-phase', 'away', { timeout: 2_500 });
    await expect(companion.getByTestId('local-companion-runtime')).toHaveCount(0);

    await expect(shell).toHaveAttribute('data-exploration-visual-phase', 'returning', { timeout: 6_000 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(7_500);
    await expect(companion.getByTestId('local-companion-runtime')).toBeVisible();

    await expect(shell).toHaveAttribute('data-exploration-visual-phase', 'reporting', { timeout: 2_000 });
    await expect(companion.locator('.speech-bubble')).toBeVisible();
    await expect(companion.locator('.speech-bubble')).toContainText(
      /found something|reliable information|discovery provider|problem/i
    );
    await device.screenshot(companion, 'exploration-reporting.png');
    await expect(shell).toHaveAttribute('data-exploration-visual-phase', 'idle', { timeout: 1_500 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(9_500);
  } finally {
    await device.close();
  }
});
