import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import axe from 'axe-core';
import { UiElectronFixture } from './ui-fixture';
import { COMPANION_ANIMATION_NAMES } from '@our-companion/shared';

const runId = process.env.OUR_COMPANION_UI_QA_RUN_ID?.replace(/[^a-zA-Z0-9_-]/g, '') || 'local';
const ui002ArtifactDir = path.resolve(import.meta.dirname, '../..', 'artifacts', 'ui-ux', 'UI-002', runId);

async function hasCreamCornerTape(card: Locator): Promise<boolean> {
  return card.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return style.content !== 'none' && style.backgroundImage.includes('tape-cream.png');
  });
}

async function severeAxeViolations(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(async (target) => {
    const axeRunner = (window as typeof window & { axe: typeof axe }).axe;
    return (await axeRunner.run(target)).violations
      .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      .map((violation) => violation.id);
  }, selector);
}

test('Settings organizes controls into explicit categories', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Settings' }).click();
    const categories = panel.getByRole('tab');
    await expect(categories).toHaveCount(8);
    await panel.getByRole('tab', { name: 'Voice' }).click();
    await expect(panel.getByText('Voice', { exact: true }).last()).toBeVisible();
    await device.screenshot(panel, 'en/settings-1180.png');
  } finally { await device.close(); }
});

test('Developer animation review matches the current Companion assets', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'Developer' }).click();
    await panel.getByRole('button', { name: 'Show developer tools' }).click();

    const controls = panel.locator('.dev-animation-panel .segmented-control button');
    await expect(controls).toHaveCount(COMPANION_ANIMATION_NAMES.length + 1);
    await expect(controls.first()).toHaveAttribute('data-animation-name', 'live');
    expect(await controls.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-animation-name')))).toEqual(['live', ...COMPANION_ANIMATION_NAMES]);

    await panel.getByRole('button', { name: 'Talk Thinking', exact: true }).click();
    await expect(panel.locator('.developer-preview-canvas .canvas-companion-Talk_Thinking')).toBeVisible();
    await expect(panel.getByText('Previewing: Talk Thinking', { exact: true })).toBeVisible();
    await device.screenshot(panel, 'developer/animation-review-current-assets.png');
  } finally { await device.close(); }
});

test('Engine Observatory panels have bounded independently scrollable content', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'Developer' }).click();
    await panel.getByRole('button', { name: 'Show developer tools' }).click();

    const characterHeader = panel.getByRole('button', { name: /Character/ });
    const characterPanel = characterHeader.locator('..');
    const characterBody = panel.getByRole('region', { name: 'Character details' });
    await expect(characterBody).toBeVisible();
    expect(await characterBody.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        minHeight: style.minHeight,
        maxHeight: style.maxHeight,
        overflowY: style.overflowY,
        overscrollBehavior: style.overscrollBehaviorY,
      };
    })).toEqual({ minHeight: '160px', maxHeight: '320px', overflowY: 'auto', overscrollBehavior: 'contain' });

    const scrollProbe = await characterBody.evaluate((element) => {
      const probe = document.createElement('div');
      probe.style.height = '640px';
      element.append(probe);
      const result = { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
      probe.remove();
      return result;
    });
    expect(scrollProbe.clientHeight).toBeLessThanOrEqual(320);
    expect(scrollProbe.scrollHeight).toBeGreaterThan(scrollProbe.clientHeight);

    await characterHeader.click();
    await expect(characterBody).toHaveCount(0);
    const collapsedHeights = await characterPanel.evaluate((element) => ({
      panel: element.getBoundingClientRect().height,
      header: element.querySelector('button')?.getBoundingClientRect().height ?? 0,
    }));
    expect(Math.abs(collapsedHeights.panel - collapsedHeights.header)).toBeLessThanOrEqual(2);
    expect(collapsedHeights.panel).toBeGreaterThanOrEqual(44);
    expect(collapsedHeights.panel).toBeLessThan(60);
    await device.screenshot(panel, 'developer/engine-observatory-bounded-panels.png');
  } finally { await device.close(); }
});

test('PaperCard tape is intentional across operational and narrative surfaces', async () => {
  test.setTimeout(90_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const panel = await device.panelWindow();

    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'AI' }).click();
    const aiCard = panel.getByRole('heading', { name: 'AI Provider', exact: true }).locator('..');
    await expect(aiCard).not.toHaveClass(/paper-card-taped/);
    expect(await hasCreamCornerTape(aiCard)).toBe(false);
    await expect(panel.getByLabel('Model')).toBeVisible();
    await expect(panel.getByLabel('Endpoint')).toBeVisible();
    await expect(panel.getByLabel('API Key')).toBeVisible();
    await panel.getByLabel('Model').focus();
    await expect(panel.getByLabel('Model')).toBeFocused();
    expect(await panel.getByLabel('Model').evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');
    await panel.addScriptTag({ content: axe.source });
    expect(await severeAxeViolations(panel, '[data-testid="panel-page-settings"]')).toEqual([]);
    await device.screenshot(panel, 'en-settings-ai-1180.png', ui002ArtifactDir);

    await main.evaluate(async () => window.ourCompanion.smoke?.setFriendLookupFixture({ id: 'friend-1', username: 'Mira', friendCode: 'MIRA0001', relationship: 'friend' }));
    await panel.getByRole('button', { name: 'Social' }).click();
    const socialCard = panel.locator('[data-testid="social-panel"] > .paper-card');
    const publishedCompanionCard = panel.getByRole('heading', { name: 'Online Companion', exact: true }).locator('..');
    await expect(socialCard).toHaveClass(/paper-card-taped/);
    expect(await hasCreamCornerTape(socialCard)).toBe(true);
    await expect(publishedCompanionCard).not.toHaveClass(/paper-card-taped/);
    expect(await hasCreamCornerTape(publishedCompanionCard)).toBe(false);
    await expect(panel.locator('[data-testid="social-panel"] .paper-card-taped')).toHaveCount(1);
    expect(await severeAxeViolations(panel, '[data-testid="social-panel"]')).toEqual([]);
    await device.screenshot(panel, 'en-social-operational-tape-1180.png', ui002ArtifactDir);

    await panel.getByRole('button', { name: 'Home' }).click();
    const narrativeCard = panel.getByRole('heading', { name: 'Current Focus', exact: true }).locator('..');
    await expect(narrativeCard).toHaveClass(/paper-card-taped/);
    expect(await hasCreamCornerTape(narrativeCard)).toBe(true);
    await device.screenshot(panel, 'en-home-narrative-tape-1180.png', ui002ArtifactDir);

    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'AI' }).click();
    await panel.locator('.settings-panel select').nth(1).selectOption('zh-CN');
    await panel.getByRole('button', { name: 'Save' }).click();
    await panel.getByRole('tab', { name: '伙伴' }).click();
    const companionCards = panel.locator('.settings-layout > .paper-card');
    await expect(companionCards).toHaveCount(3);
    for (let index = 0; index < await companionCards.count(); index += 1) {
      const card = companionCards.nth(index);
      await expect(card).not.toHaveClass(/paper-card-taped/);
      expect(await hasCreamCornerTape(card)).toBe(false);
    }
    await expect(panel.getByRole('heading', { name: '伙伴的行为', exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: '注意力', exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: '待处理的发现', exact: true })).toBeVisible();
    await device.screenshot(panel, 'zh-CN-settings-companion-1180.png', ui002ArtifactDir);

    await panel.getByRole('tab', { name: 'AI' }).click();
    await panel.setViewportSize({ width: 760, height: 720 });
    await expect(panel.getByRole('heading', { name: 'AI 提供商', exact: true })).toBeVisible();
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await device.screenshot(panel, 'zh-CN-settings-ai-760.png', ui002ArtifactDir);
  } finally { await device.close(); }
});
