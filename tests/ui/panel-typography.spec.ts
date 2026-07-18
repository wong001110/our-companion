import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import axe from 'axe-core';
import { UiElectronFixture } from './ui-fixture';

const runId = process.env.OUR_COMPANION_UI_QA_RUN_ID?.replace(/[^a-zA-Z0-9_-]/g, '') || 'local';
const artifactDir = path.resolve(import.meta.dirname, '../..', 'artifacts', 'ui-ux', 'UI-003', runId);

async function fontFamily(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).fontFamily);
}

async function severeAxeViolations(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(async (target) => {
    const axeRunner = (window as typeof window & { axe: typeof axe }).axe;
    return (await axeRunner.run(target)).violations
      .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      .map((violation) => violation.id);
  }, selector);
}

async function hasCreamCornerTape(card: Locator): Promise<boolean> {
  return card.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return style.content !== 'none' && style.backgroundImage.includes('tape-cream.png');
  });
}

test('Panel typography roles separate operational and expressive content', async () => {
  test.setTimeout(150_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const panel = await device.panelWindow();
    await panel.addScriptTag({ content: axe.source });

    const observed: Record<string, string | boolean | string[]> = {};
    observed.panel = await fontFamily(panel.locator('.panel-shell'));

    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'AI' }).click();
    const settingsTitle = panel.getByRole('heading', { name: 'Settings', exact: true });
    const aiHeading = panel.getByRole('heading', { name: 'AI Provider', exact: true });
    const modelInput = panel.getByLabel('Model');
    observed.settingsTitle = await fontFamily(settingsTitle);
    observed.aiHeading = await fontFamily(aiHeading);
    observed.modelInput = await fontFamily(modelInput);
    observed.settingsSelect = await fontFamily(panel.locator('.settings-panel select').first());
    observed.settingsButton = await fontFamily(panel.getByRole('button', { name: 'Save' }));
    await modelInput.focus();
    observed.modelFocus = (await modelInput.evaluate((element) => getComputedStyle(element).outlineWidth)) !== '0px';
    observed.settingsAxe = await severeAxeViolations(panel, '[data-testid="panel-page-settings"]');
    await device.screenshot(panel, 'en-settings-ai-typography-1180.png', artifactDir);

    await panel.locator('.settings-panel select').nth(1).selectOption('zh-CN');
    await panel.getByRole('button', { name: 'Save' }).click();
    await panel.getByRole('tab', { name: '伙伴' }).click();
    observed.zhPageTitle = await fontFamily(panel.getByRole('heading', { name: '设置', exact: true }));
    observed.zhOperationalHeading = await fontFamily(panel.getByRole('heading', { name: '伙伴的行为', exact: true }));
    await device.screenshot(panel, 'zh-CN-settings-companion-typography-1180.png', artifactDir);

    await panel.getByRole('tab', { name: 'AI' }).click();
    await panel.locator('.settings-panel select').nth(1).selectOption('en');
    await panel.getByRole('button', { name: '保存' }).click();
    await main.evaluate(async () => window.ourCompanion.smoke?.setFriendLookupFixture({ id: 'friend-1', username: 'Mira', uid: 'OC-MIRA8XYZ', friendCode: 'MIRA0001', relationship: 'friend' }));
    await panel.getByRole('button', { name: 'Social' }).click();
    await expect(panel.getByTestId('panel-page-social')).toHaveAttribute('data-motion-state', 'entered');
    await panel.getByLabel('Find by UID').fill('OC-MIRA8XYZ');
    await panel.getByRole('button', { name: 'Find' }).click();
    await expect(panel.getByTestId('friend-lookup-result')).toBeVisible();
    const socialCard = panel.locator('[data-testid="social-panel"] > .paper-card');
    observed.socialTitle = await fontFamily(panel.getByRole('heading', { name: 'Social', exact: true }));
    observed.socialRelationship = await fontFamily(panel.getByTestId('friend-lookup-relationship'));
    observed.socialTapeCount = await panel.locator('[data-testid="social-panel"] .paper-card-taped').count();
    observed.socialTape = await hasCreamCornerTape(socialCard);
    observed.socialAxe = await severeAxeViolations(panel, '[data-testid="social-panel"]');
    const normalViewport = panel.viewportSize() ?? { width: 1180, height: 820 };
    await panel.setViewportSize({ width: normalViewport.width, height: 1400 });
    await panel.locator('.workspace').evaluate((element) => element.scrollTo({ top: 0 }));
    await device.screenshot(panel, 'en-social-typography-1180.png', artifactDir);
    await panel.setViewportSize(normalViewport);

    await main.evaluate(async () => {
      await window.ourCompanion.companion.clearHistory();
      await window.ourCompanion.companion.appendMessage({ role: 'user', content: 'Can we make a quiet plan for today?', source: 'panel' });
      await window.ourCompanion.companion.appendMessage({ role: 'assistant', content: 'Yes. Let us begin with one small step.', source: 'panel' });
    });
    await panel.getByRole('button', { name: 'Chat' }).click();
    await expect(panel.getByText('Can we make a quiet plan for today?')).toBeVisible();
    observed.chatUser = await fontFamily(panel.getByText('Can we make a quiet plan for today?'));
    observed.chatCompanion = await fontFamily(panel.getByText('Yes. Let us begin with one small step.'));
    observed.chatComposer = await fontFamily(panel.getByPlaceholder('Write to Companion…'));
    observed.chatAxe = await severeAxeViolations(panel, '[data-testid="panel-page-chat"]');
    await device.screenshot(panel, 'en-chat-typography-1180.png', artifactDir);

    await panel.getByRole('button', { name: 'Home' }).click();
    const homeTitle = panel.getByRole('heading', { name: "Companion's Notebook", exact: true });
    const currentFocus = panel.getByRole('heading', { name: 'Current Focus', exact: true });
    const narrativeCard = currentFocus.locator('..');
    observed.homeTitle = await fontFamily(homeTitle);
    observed.homeSectionTitle = await fontFamily(currentFocus);
    observed.homeBody = await fontFamily(narrativeCard.locator('p').first());
    observed.homeTape = await hasCreamCornerTape(narrativeCard);
    await device.screenshot(panel, 'en-home-typography-1180.png', artifactDir);

    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('tab', { name: 'AI' }).click();
    await panel.locator('.settings-panel select').nth(1).selectOption('zh-CN');
    await panel.getByRole('button', { name: 'Save' }).click();
    await panel.setViewportSize({ width: 760, height: 720 });
    await panel.locator('.workspace').evaluate((element) => element.scrollTo({ top: 0 }));
    observed.narrowOverflow = await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    observed.narrowHeading = await fontFamily(panel.getByRole('heading', { name: 'AI 提供商', exact: true }));
    await device.screenshot(panel, 'zh-CN-settings-ai-typography-760.png', artifactDir);

    await panel.locator('.settings-panel select').nth(1).selectOption('en');
    await panel.getByRole('button', { name: '保存' }).click();

    const creation = await device.creationWindow();
    observed.creation = await fontFamily(creation.locator('.creation-shell'));
    await device.screenshot(creation, 'en-creation-typography-regression.png', artifactDir);

    await fs.writeFile(path.join(artifactDir, 'computed-fonts.json'), `${JSON.stringify(observed, null, 2)}\n`);

    const uiRoleKeys = ['panel', 'aiHeading', 'modelInput', 'settingsSelect', 'settingsButton', 'zhOperationalHeading', 'socialRelationship', 'chatUser', 'chatCompanion', 'chatComposer', 'homeBody', 'narrowHeading'];
    for (const key of uiRoleKeys) expect(observed[key], key).not.toContain('Xiaolai');
    const handwrittenRoleKeys = ['settingsTitle', 'zhPageTitle', 'socialTitle', 'homeTitle', 'homeSectionTitle'];
    for (const key of handwrittenRoleKeys) expect(observed[key], key).toContain('Xiaolai');
    expect(observed.creation).toContain('Xiaolai');
    expect(observed.modelFocus).toBe(true);
    expect(observed.settingsAxe).toEqual([]);
    expect(observed.socialAxe).toEqual([]);
    expect(observed.chatAxe).toEqual([]);
    expect(observed.socialTapeCount).toBe(1);
    expect(observed.socialTape).toBe(true);
    expect(observed.homeTape).toBe(true);
    expect(observed.narrowOverflow).toBe(true);
  } finally {
    await device.close();
  }
});
