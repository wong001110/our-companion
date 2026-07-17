import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import axe from 'axe-core';
import { UiElectronFixture } from './ui-fixture';

const artifactDir = path.resolve(import.meta.dirname, '../..', 'artifacts', 'ui-ux', 'UI-008', '2026-07-16-ui008-1');
const userMessage = 'Can we make a quiet plan for today?';
const companionMessage = 'Yes. Let us begin with one small step.';

async function capture(panel: Page, name: string): Promise<void> {
  await fs.mkdir(artifactDir, { recursive: true });
  await panel.screenshot({ path: path.join(artifactDir, name), animations: 'disabled' });
}

async function seedHistory(device: UiElectronFixture): Promise<void> {
  const main = await device.mainWindow();
  await main.evaluate(async ({ user, companion }) => {
    await window.ourCompanion.companion.clearHistory();
    await window.ourCompanion.companion.appendMessage({ role: 'user', content: user, source: 'panel' });
    await window.ourCompanion.companion.appendMessage({ role: 'assistant', content: companion, source: 'panel' });
  }, { user: userMessage, companion: companionMessage });
}

async function openPopulatedChat(device: UiElectronFixture): Promise<Page> {
  await seedHistory(device);
  const panel = await device.panelWindow();
  await panel.bringToFront();
  await panel.evaluate(() => window.focus());
  await panel.getByRole('button', { name: 'Chat' }).click();
  await expect(panel.getByTestId('panel-page-chat')).toHaveAttribute('data-motion-state', 'entered');
  await panel.waitForTimeout(250);
  await expect(panel.getByText(userMessage)).toBeVisible();
  await expect(panel.getByText(companionMessage)).toBeVisible();
  return panel;
}

test('Chat clear-history dialog opens, traps focus, and has no critical or serious axe violations', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await openPopulatedChat(device);
    await panel.setViewportSize({ width: 1180, height: 820 });
    const opener = panel.getByRole('button', { name: 'Clear history' });
    await opener.click();

    const dialog = panel.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Clear all history?' })).toBeVisible();
    await expect(dialog.getByText('This permanently removes all stored Chat history from this device. This cannot be undone.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Yes, clear' })).toHaveClass(/btn-danger/);
    await expect(panel.locator('.chat-composer').getByText('Clear all history?')).toHaveCount(0);

    await panel.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Yes, clear' })).toBeFocused();
    await panel.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

    await capture(panel, 'en-chat-clear-dialog-1180.png');

    await panel.addScriptTag({ content: axe.source });
    const severeViolations = await panel.evaluate(async () => {
      const axeRunner = (window as typeof window & { axe: typeof axe }).axe;
      return (await axeRunner.run('.confirm-dialog-backdrop')).violations
        .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
        .map((violation) => violation.id);
    });
    expect(severeViolations).toEqual([]);
  } finally { await device.close(); }
});

test('Cancel and Escape preserve messages, filters, search, and opener focus; confirm clears history', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await openPopulatedChat(device);
    await panel.setViewportSize({ width: 1180, height: 820 });
    const opener = panel.getByRole('button', { name: 'Clear history' });
    const panelFilter = panel.getByRole('button', { name: 'Panel', exact: true });
    const search = panel.getByPlaceholder('Search messages…');
    await panelFilter.click();
    await search.fill('quiet');

    await opener.click();
    await panel.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(panel.getByRole('alertdialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(panel.getByText(userMessage)).toBeVisible();
    await expect(search).toHaveValue('quiet');
    await expect(panelFilter).toHaveAttribute('aria-pressed', 'true');

    await opener.click();
    await panel.keyboard.press('Escape');
    await expect(panel.getByRole('alertdialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(panel.getByText(userMessage)).toBeVisible();

    await opener.click();
    await panel.getByRole('alertdialog').getByRole('button', { name: 'Yes, clear' }).click();
    await expect(panel.getByRole('alertdialog')).toHaveCount(0);
    await expect(panel.getByText(userMessage)).toHaveCount(0);
    await expect(panel.getByText(companionMessage)).toHaveCount(0);
    await expect(panel.getByText('No messages yet. Start talking with Companion!')).toBeVisible();
    await expect(search).toHaveValue('quiet');
    await expect(panelFilter).toHaveAttribute('aria-pressed', 'true');
    await capture(panel, 'en-chat-cleared-empty-1180.png');
  } finally { await device.close(); }
});

test('Simplified Chinese clear-history dialog fits at 760 by 720 without overflow', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    await seedHistory(device);
    const panel = await device.panelWindow();
    await panel.bringToFront();
    await panel.evaluate(() => window.focus());
    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'AI' }).click();
    await panel.locator('.settings-panel select').nth(1).selectOption('zh-CN');
    await panel.getByRole('button', { name: 'Save' }).click();
    await panel.setViewportSize({ width: 760, height: 720 });
    await panel.getByRole('button', { name: '对话' }).click();
    await expect(panel.getByTestId('panel-page-chat')).toHaveAttribute('data-motion-state', 'entered');
    await panel.waitForTimeout(250);
    await expect(panel.getByText(userMessage)).toBeVisible();
    await panel.getByRole('button', { name: '清除记录' }).click();

    const dialog = panel.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '确认清除所有记录？' })).toBeVisible();
    await expect(dialog.getByText('这会从此设备永久删除所有已保存的聊天记录，且无法撤销。')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: '确认清除' })).toBeVisible();
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(760);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
    await capture(panel, 'zh-CN-chat-clear-dialog-760.png');
  } finally { await device.close(); }
});

test('Reduced Motion keeps dialog focus and close behavior intact', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await openPopulatedChat(device);
    await panel.emulateMedia({ reducedMotion: 'reduce' });
    const opener = panel.getByRole('button', { name: 'Clear history' });
    await opener.click();
    const dialog = panel.getByRole('alertdialog');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    expect(await dialog.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    await panel.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(panel.getByText(userMessage)).toBeVisible();
    await capture(panel, 'reduced-motion-chat-clear-focus.png');
  } finally { await device.close(); }
});
