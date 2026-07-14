import { expect, test } from '@playwright/test';
import { UiElectronFixture } from './ui-fixture';

test('Companion quick actions support hover, pin, and Escape dismissal', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const companion = main.locator('.companion-canvas');
    await companion.hover();
    // Assert before the 220ms visibility timer is allowed to settle; exact timing is
    // unit-covered by the visibility machine to avoid CI scheduling flake.
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible({ timeout: 2_000 });
    await device.screenshot(main, 'en/quick-actions-center.png');
    await companion.click();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible();
    await main.keyboard.press('Escape');
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
  } finally { await device.close(); }
});

test('Quick Actions keep the hover group visible through its grace period', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const companion = main.locator('.companion-canvas');
    await companion.hover();
    const actions = main.getByTestId('companion-quick-actions');
    await expect(actions).toBeVisible();

    await main.getByTestId('quick-action-talk').hover();
    await expect(actions).toBeVisible();

    const viewport = await main.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    await main.mouse.move(viewport.width - 2, viewport.height - 2);
    await main.waitForTimeout(260);
    await expect(actions).toBeVisible();
    await expect(actions).toHaveCount(0, { timeout: 1_000 });
  } finally { await device.close(); }
});

test('Dragging the Companion closes pinned Quick Actions immediately', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const companion = main.locator('.companion-canvas');
    await companion.click();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible();
    const box = await companion.boundingBox();
    if (!box) throw new Error('COMPANION_CANVAS_NOT_MEASURABLE');
    await main.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await main.mouse.down();
    await main.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12);
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
    await main.mouse.up();
  } finally { await device.close(); }
});

test('Quick Actions are removed when the local Companion is away visiting', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.locator('.companion-canvas').click();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible();
    await main.evaluate(async () => window.ourCompanion.smoke?.setOwnerPresenceMode('away_visiting'));
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
    await main.evaluate(async () => window.ourCompanion.smoke?.setOwnerPresenceMode('home'));
  } finally { await device.close(); }
});

test('Quick Action bubbles stay inside the work area at five Companion positions', async () => {
  test.setTimeout(90_000);
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    const companion = main.locator('.companion-canvas');
    const runtime = main.getByTestId('local-companion-runtime');
    const viewport = await main.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const initialBox = await runtime.boundingBox();
    if (!initialBox) throw new Error('COMPANION_RUNTIME_NOT_MEASURABLE');
    const maxX = Math.max(0, viewport.width - initialBox.width);
    const maxY = Math.max(0, viewport.height - initialBox.height);
    const positions = [
      ['center', maxX / 2, maxY / 2],
      ['top-left', 0, 0],
      ['top-right', maxX, 0],
      ['bottom-left', 0, maxY],
      ['bottom-right', maxX, maxY],
    ] as const;

    for (const [name, x, y] of positions) {
      await main.evaluate(async ({ x: nextX, y: nextY }) => {
        const primary = await window.ourCompanion.companionNew.getPrimary();
        if (!primary) throw new Error('PRIMARY_COMPANION_UNAVAILABLE');
        localStorage.setItem(`companion:${primary.id}:position`, JSON.stringify({ x: nextX, y: nextY }));
      }, { x, y });
      await main.reload();
      await expect(companion).toBeVisible();
      const positioned = await runtime.boundingBox();
      if (!positioned) throw new Error('COMPANION_RUNTIME_NOT_MEASURABLE');
      expect(Math.abs(positioned.x - x)).toBeLessThanOrEqual(2);
      expect(Math.abs(positioned.y - y)).toBeLessThanOrEqual(2);
      await companion.click();
      const bubbles = main.locator('[data-testid^="quick-action-"]');
      await expect(bubbles).toHaveCount(4);
      await Promise.all(Array.from({ length: 4 }, (_, index) => expect(bubbles.nth(index)).toBeVisible()));
      await main.waitForTimeout(300);
      const inBounds = await bubbles.evaluateAll((elements) => elements.every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
      }));
      expect(inBounds).toBe(true);
      const nonOverlapping = await bubbles.evaluateAll((elements) => elements.every((element, index) => {
        const a = element.getBoundingClientRect();
        return elements.slice(index + 1).every((other) => {
          const b = other.getBoundingClientRect();
          return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        });
      }));
      expect(nonOverlapping).toBe(true);
      await device.screenshot(main, `quick-actions/${name}.png`);
      await main.keyboard.press('Escape');
      await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
    }
  } finally { await device.close(); }
});

test('Listen stays visibly active when Quick Actions are reopened', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.evaluate(() => {
      const context = new AudioContext();
      const stream = context.createMediaStreamDestination().stream;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => stream,
      });
    });
    const companion = main.locator('.companion-canvas');
    await companion.click();
    const listen = main.getByTestId('quick-action-listen');
    await listen.click();
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
    await companion.click();
    await expect(listen).toHaveAttribute('aria-pressed', 'true');
    await listen.click();
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
    await companion.click();
    await expect(listen).toHaveAttribute('aria-pressed', 'false');
  } finally { await device.close(); }
});

test('More closes independently on Escape and restores its trigger focus', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.locator('.companion-canvas').click();
    const more = main.getByTestId('quick-action-more');
    await more.click();
    await expect(main.getByRole('menu')).toBeVisible();
    await device.screenshot(main, 'quick-actions/more-menu.png');
    await main.keyboard.press('Escape');
    await expect(main.getByRole('menu')).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(main.getByTestId('companion-quick-actions')).toBeVisible();
  } finally { await device.close(); }
});

test('Quick Actions use opacity-only motion when reduced motion is requested', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.emulateMedia({ reducedMotion: 'reduce' });
    await main.locator('.companion-canvas').click();
    const talk = main.getByTestId('quick-action-talk');
    await expect(talk).toBeVisible();
    expect(await talk.evaluate((element) => getComputedStyle(element).animationName)).toBe('quick-action-fade');
    await device.screenshot(main, 'reduced-motion/quick-actions.png');
  } finally { await device.close(); }
});

test('Quick Actions opens Panel Settings directly and preserves Talk active state', async () => {
  const device = new UiElectronFixture();
  try {
    await device.launch();
    const main = await device.mainWindow();
    await main.locator('.companion-canvas').click();
    await main.getByTestId('quick-action-more').click();
    await expect(main.getByRole('menu')).toBeVisible();
    await main.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(main.getByRole('menu')).toHaveAttribute('data-motion-state', 'exiting');
    const panel = await device.panelWindow();
    const settings = panel.getByRole('button', { name: 'Settings' });
    await expect(settings).toHaveAttribute('aria-current', 'page');
    await expect(panel.getByTestId('panel-page-settings')).toBeVisible();

    await main.locator('.companion-canvas').click();
    await main.getByTestId('quick-action-talk').click();
    const composer = main.locator('.companion-text-input');
    await expect(composer).toBeVisible();
    await expect(main.getByTestId('quick-action-talk')).toHaveAttribute('aria-pressed', 'true');
    await device.screenshot(main, 'quick-actions/talk-active.png');
    await main.keyboard.press('Escape');
    await expect(composer).toHaveAttribute('data-motion-state', 'exiting');
    await expect(composer).toHaveCount(0, { timeout: 1_000 });
    await expect(main.getByTestId('companion-quick-actions')).toHaveCount(0);
  } finally { await device.close(); }
});
