import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Reduced Motion Panel lifecycle is opacity-only and keeps focus meaningful', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.emulateMedia({ reducedMotion: 'reduce' });
    const outgoing = panel.getByTestId('panel-page-home');
    await outgoing.evaluate((element) => {
      const target = window as typeof window & { __reducedPanelExit?: Array<{ state: string | null; transform: string }> };
      target.__reducedPanelExit = [];
      new MutationObserver(() => target.__reducedPanelExit?.push({
        state: element.getAttribute('data-motion-state'),
        transform: getComputedStyle(element).transform,
      })).observe(element, { attributes: true, attributeFilter: ['data-motion-state'] });
    });
    await panel.getByRole('button', { name: 'Social' }).click();
    const incoming = panel.getByTestId('panel-page-social');
    await expect(incoming).toHaveAttribute('data-motion-state', 'entered');
    await expect(incoming).toBeFocused();
    expect(await panel.evaluate(() => (window as typeof window & { __reducedPanelExit?: Array<{ state: string | null; transform: string }> }).__reducedPanelExit))
      .toContainEqual({ state: 'exiting', transform: 'none' });
    expect(await incoming.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    expect(await panel.getByRole('button', { name: 'Social' }).evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    await device.screenshot(panel, 'reduced-motion/panel.png');
  } finally { await device.close(); }
});

test('Reduced Motion Creation lifecycle is opacity-only and preserves focus', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const creation = await device.creationWindow();
    await creation.emulateMedia({ reducedMotion: 'reduce' });
    await creation.getByTestId('create-new-companion').click();
    const name = creation.getByTestId('creation-name');
    await name.fill('Nova');
    const outgoing = creation.locator('.creation-step[data-step="1"]');
    await outgoing.evaluate((element) => {
      const target = window as typeof window & { __reducedCreationExit?: Array<{ state: string | null; transform: string }> };
      target.__reducedCreationExit = [];
      new MutationObserver(() => target.__reducedCreationExit?.push({
        state: element.getAttribute('data-motion-state'),
        transform: getComputedStyle(element).transform,
      })).observe(element, { attributes: true, attributeFilter: ['data-motion-state'] });
    });
    await creation.getByTestId('creation-next').click();
    const description = creation.getByTestId('creation-description');
    await expect(description).toBeFocused();
    expect(await creation.evaluate(() => (window as typeof window & { __reducedCreationExit?: Array<{ state: string | null; transform: string }> }).__reducedCreationExit))
      .toContainEqual({ state: 'exiting', transform: 'none' });
    expect(await description.locator('xpath=..').evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    await device.screenshot(creation, 'reduced-motion/creation.png');
  } finally { await device.close(); }
});

test('Reduced Motion feedback surfaces use opacity-only transitions', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const creation = await device.creationWindow();
    await creation.emulateMedia({ reducedMotion: 'reduce' });
    await creation.getByRole('button', { name: 'Delete' }).click();
    const dialog = creation.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => getComputedStyle(element).transform)).toBe('none');

    const main = await device.mainWindow();
    await main.emulateMedia({ reducedMotion: 'reduce' });
    await main.locator('.companion-canvas').click();
    await main.getByTestId('quick-action-more').click();
    const menu = main.getByRole('menu');
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((element) => getComputedStyle(element).transform)).toBe('none');

    const panel = await device.panelWindow();
    await panel.emulateMedia({ reducedMotion: 'reduce' });
    await panel.getByRole('button', { name: 'Journeys' }).click();
    await panel.getByRole('button', { name: 'New', exact: true }).click();
    const toast = panel.locator('.toast');
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    await device.screenshot(creation, 'reduced-motion/feedback.png');
  } finally { await device.close(); }
});

test('Reduced Motion Companion overlays suppress spatial and looping motion', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.emulateMedia({ reducedMotion: 'reduce' });
    const speech = main.locator('.speech-bubble');
    await expect(speech).toBeVisible();
    expect(await speech.evaluate((element) => getComputedStyle(element).animationName)).toBe('companion-fade-enter');
    const cursor = main.locator('.speech-bubble-cursor');
    if (await cursor.count()) expect(await cursor.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');

    await main.locator('.companion-canvas').click();
    await main.getByTestId('quick-action-talk').click();
    const composer = main.locator('.companion-text-input');
    await expect(composer).toBeVisible();
    expect(await composer.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    expect(await composer.evaluate((element) => getComputedStyle(element).animationName)).toBe('companion-fade-enter');

    const syntheticStyles = await main.evaluate(() => {
      const classes = ['companion-soft-hint', 'discovery-popout-card card-visible', 'animation-slot animation-slot-filled'];
      return classes.map((className) => {
        const element = document.createElement('div');
        element.className = className;
        document.body.append(element);
        const style = getComputedStyle(element);
        const result = { transform: style.transform, animationName: style.animationName };
        element.remove();
        return result;
      });
    });
    expect(syntheticStyles[0]).toMatchObject({ transform: 'none', animationName: 'companion-fade-enter' });
    expect(syntheticStyles[1]?.transform).toBe('none');
    expect(syntheticStyles[2]?.animationName).toBe('none');
    await device.screenshot(main, 'reduced-motion/quick-actions.png');
  } finally { await device.close(); }
});
