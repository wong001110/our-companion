import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import axe from 'axe-core';
import { UiElectronFixture } from './ui-fixture';

test('Panel has no critical or serious axe violations', async () => {
  test.setTimeout(60_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.addScriptTag({ content: axe.source });
    const result = await panel.evaluate(async () => {
      const axeRunner = (window as typeof window & { axe: typeof axe }).axe;
      return axeRunner.run('.panel-shell');
    });
    const blocking = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
    await fs.mkdir(path.join(device.artifactDir, 'accessibility'), { recursive: true });
    await fs.writeFile(path.join(device.artifactDir, 'accessibility', 'report.json'), JSON.stringify({
      critical: result.violations.filter((violation) => violation.impact === 'critical').length,
      serious: result.violations.filter((violation) => violation.impact === 'serious').length,
      moderate: result.violations.filter((violation) => violation.impact === 'moderate').map((violation) => violation.id),
    }, null, 2));
    await device.screenshot(panel, 'accessibility/panel.png');
    expect(blocking).toEqual([]);
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
    await expect(panel.getByTestId('social-panel')).toBeVisible();

    const settings = panel.getByRole('button', { name: 'Settings' });
    await settings.focus();
    await panel.keyboard.press('Space');
    await expect(panel.getByRole('tablist')).toBeVisible();

    const voice = panel.getByRole('tab', { name: 'Voice' });
    await voice.focus();
    await panel.keyboard.press('Enter');
    await expect(panel.getByText('Voice', { exact: true }).last()).toBeVisible();
  } finally { await device.close(); }
});
