import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import axe from 'axe-core';
import { UiElectronFixture } from './ui-fixture';

type SurfaceResult = { critical: number; serious: number; seriousDetails: Array<{ id: string; targets: string[][] }>; moderate: string[] };

async function scan(page: Page, selector: string): Promise<SurfaceResult> {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async (target) => {
    const axeRunner = (window as typeof window & { axe: typeof axe }).axe;
    return (await axeRunner.run(target)).violations;
  }, selector);
  return {
    critical: violations.filter((violation) => violation.impact === 'critical').length,
    serious: violations.filter((violation) => violation.impact === 'serious').length,
    seriousDetails: violations.filter((violation) => violation.impact === 'serious').map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
    moderate: violations.filter((violation) => violation.impact === 'moderate').map((violation) => violation.id),
  };
}

test('All required application surfaces have no critical or serious axe violations', async () => {
  test.setTimeout(120_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    const surfaces: Record<string, SurfaceResult> = {};
    surfaces.panelHome = await scan(panel, '.panel-shell');
    await device.screenshot(panel, 'accessibility/panel-home.png');

    await panel.getByRole('button', { name: 'Social' }).click();
    await expect(panel.getByTestId('panel-page-social')).toHaveAttribute('data-motion-state', 'entered');
    await panel.waitForTimeout(250);
    surfaces.panelSocial = await scan(panel, '.panel-shell');
    await device.screenshot(panel, 'accessibility/panel-social.png');

    await panel.getByRole('button', { name: 'Settings' }).click();
    await expect(panel.getByTestId('panel-page-settings')).toHaveAttribute('data-motion-state', 'entered');
    await panel.waitForTimeout(250);
    surfaces.panelSettings = await scan(panel, '.panel-shell');
    await device.screenshot(panel, 'accessibility/panel-settings.png');

    const creation = await device.creationWindow();
    await creation.getByTestId('create-new-companion').click();
    await expect(creation.getByTestId('creation-name')).toBeVisible();
    surfaces.creation = await scan(creation, '.creation-shell');
    await device.screenshot(creation, 'accessibility/creation.png');

    await creation.getByRole('button', { name: 'Cancel' }).click();
    await creation.getByRole('button', { name: 'Delete' }).click();
    await expect(creation.getByRole('alertdialog')).toBeVisible();
    await creation.waitForTimeout(300);
    surfaces.confirmDialog = await scan(creation, '.confirm-dialog-backdrop');
    await device.screenshot(creation, 'accessibility/dialog.png');

    const main = await device.mainWindow();
    await main.locator('.companion-canvas').click();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible();
    await main.waitForTimeout(500);
    surfaces.quickActions = await scan(main, '.companion-quick-actions');
    await device.screenshot(main, 'accessibility/quick-actions.png');

    await main.getByTestId('quick-action-more').click();
    await expect(main.getByRole('menu')).toBeVisible();
    surfaces.moreMenu = await scan(main, '.quick-action-more-menu');
    await main.keyboard.press('Escape');
    await main.getByTestId('quick-action-talk').click();
    await expect(main.locator('.companion-text-input')).toBeVisible();
    surfaces.composer = await scan(main, '.companion-text-input');

    const totals = Object.values(surfaces).reduce((sum, result) => ({
      critical: sum.critical + result.critical,
      serious: sum.serious + result.serious,
    }), { critical: 0, serious: 0 });
    await fs.mkdir(path.join(device.artifactDir, 'accessibility'), { recursive: true });
    await fs.writeFile(path.join(device.artifactDir, 'accessibility', 'report.json'), JSON.stringify({
      result: totals.critical === 0 && totals.serious === 0 ? 'passed' : 'failed',
      surfaces,
      totals,
    }, null, 2));
    expect(totals).toEqual({ critical: 0, serious: 0 });
  } finally { await device.close(); }
});

test('Panel navigation remains usable from the keyboard', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();

    const social = panel.getByRole('button', { name: 'Social' });
    await social.focus();
    await panel.keyboard.press('Enter');
    await expect(panel.getByTestId('panel-page-social')).toHaveAttribute('data-motion-state', 'entered');

    const settings = panel.getByRole('button', { name: 'Settings' });
    await settings.focus();
    await panel.keyboard.press('Space');
    await expect(panel.getByTestId('panel-page-settings')).toHaveAttribute('data-motion-state', 'entered');
    await expect(panel.getByRole('tablist')).toBeVisible();

    const voice = panel.getByRole('tab', { name: 'Voice' });
    await voice.focus();
    await panel.keyboard.press('Enter');
    await expect(panel.getByText('Voice', { exact: true }).last()).toBeVisible();
  } finally { await device.close(); }
});
