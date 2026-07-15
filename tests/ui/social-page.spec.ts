import { expect, test } from '@playwright/test';
import path from 'node:path';
import axe from 'axe-core';
import { UiElectronFixture } from './ui-fixture';

const runId = process.env.OUR_COMPANION_UI_QA_RUN_ID?.replace(/[^a-zA-Z0-9_-]/g, '') || 'local';
const ui001ArtifactDir = path.resolve(import.meta.dirname, '../..', 'artifacts', 'ui-ux', 'UI-001', runId);

test('Social is a top-level page with a clear unavailable state', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Social' }).click();
    await expect(panel.getByTestId('social-panel')).toBeVisible();
    await expect(panel.getByText('Online Mode is disabled.')).toBeVisible();
    await device.screenshot(panel, 'en/social-empty-1180.png');
  } finally { await device.close(); }
});

test('Social friend lookup presents every authoritative relationship safely', async () => {
  test.setTimeout(60_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.evaluate(async () => window.ourCompanion.smoke?.setFriendLookupFixture({ id: 'friend-1', username: 'Mira', friendCode: 'MIRA0001', relationship: 'friend' }));
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Social' }).click();

    const friendCode = panel.getByRole('textbox', { name: 'Add Friend by Code' });
    await friendCode.fill('MIRA0001');
    await panel.getByRole('button', { name: 'Find' }).click();
    await expect(panel.getByTestId('friend-lookup-relationship')).toHaveText('Already friends');
    await expect(panel.getByTestId('send-friend-request')).toHaveCount(0);
    await device.screenshot(panel, 'en-existing-friend-1180.png', ui001ArtifactDir);

    await main.evaluate(async () => window.ourCompanion.smoke?.setFriendLookupFixture({ id: 'friend-2', username: 'Sol', friendCode: 'SOL00001', relationship: 'none' }));
    await friendCode.fill('SOL00001');
    await panel.getByRole('button', { name: 'Find' }).click();
    await expect(panel.getByTestId('friend-lookup-relationship')).toHaveText('No existing connection');
    await expect(panel.getByTestId('send-friend-request')).toBeVisible();
    await device.screenshot(panel, 'en-no-relationship-1180.png', ui001ArtifactDir);

    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'AI' }).click();
    await panel.locator('.settings-panel select').nth(1).selectOption('zh-CN');
    await panel.getByRole('button', { name: 'Save' }).click();
    await main.evaluate(async () => window.ourCompanion.smoke?.setFriendLookupFixture({ id: 'friend-3', username: '小安', friendCode: 'AN000001', relationship: 'incoming_request' }));
    await panel.getByRole('button', { name: '社交' }).click();
    const chineseFriendCode = panel.getByRole('textbox', { name: '通过好友码添加好友' });
    await chineseFriendCode.fill('AN000001');
    await chineseFriendCode.focus();
    await panel.keyboard.press('Tab');
    const chineseFind = panel.getByRole('button', { name: '查找' });
    await expect(chineseFind).toBeFocused();
    await panel.keyboard.press('Enter');
    await expect(panel.getByTestId('friend-lookup-relationship')).toHaveText('对方已向你发送请求');
    await expect(panel.getByTestId('send-friend-request')).toHaveCount(0);
    await panel.addScriptTag({ content: axe.source });
    const severeViolations = await panel.evaluate(async () => {
      const axeRunner = (window as typeof window & { axe: typeof axe }).axe;
      return (await axeRunner.run('[data-testid="social-panel"]')).violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious').map((violation) => violation.id);
    });
    expect(severeViolations).toEqual([]);
    await device.screenshot(panel, 'zh-CN-incoming-request-1180.png', ui001ArtifactDir);

    await panel.setViewportSize({ width: 760, height: 720 });
    await expect(panel.getByTestId('friend-lookup-result')).toBeVisible();
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await device.screenshot(panel, 'zh-CN-incoming-request-760.png', ui001ArtifactDir);
  } finally { await device.close(); }
});
