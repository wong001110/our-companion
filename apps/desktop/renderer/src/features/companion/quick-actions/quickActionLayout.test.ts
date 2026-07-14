import { describe, expect, it } from 'vitest';
import { resolveQuickActionLayout, resolveQuickActionMenuLayout } from './quickActionLayout';

const sizes = { talk: { width: 100, height: 38 }, listen: { width: 108, height: 38 }, panel: { width: 128, height: 38 }, more: { width: 94, height: 38 } };
const area = { x: 0, y: 0, width: 800, height: 600 };

function layout(x: number, y: number, workArea = area) {
  return resolveQuickActionLayout({ companionBounds: { x, y, width: 220, height: 230 }, workArea, bubbleSizes: sizes });
}

function withinWorkArea(result: ReturnType<typeof layout>, workArea = area) {
  for (const { rect } of result) {
    expect(rect.x).toBeGreaterThanOrEqual(workArea.x);
    expect(rect.y).toBeGreaterThanOrEqual(workArea.y);
    expect(rect.x + rect.width).toBeLessThanOrEqual(workArea.x + workArea.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(workArea.y + workArea.height);
  }
}

describe('resolveQuickActionLayout', () => {
  it('keeps all four bubbles at their preferred corners around a centered companion', () => {
    const result = layout(290, 185);
    expect(result.map((item) => item.side)).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
    withinWorkArea(result);
  });

  it.each([
    ['top-left', 4, 4],
    ['top-right', 576, 4],
    ['bottom-left', 4, 366],
    ['bottom-right', 576, 366],
  ])('flips and clamps all bubbles at the %s work-area corner', (_corner, x, y) => {
    const result = layout(x, y);
    withinWorkArea(result);
  });

  it('supports mixed bubble sizes without leaking outside a small work area', () => {
    const workArea = { x: 0, y: 0, width: 390, height: 320 };
    const result = resolveQuickActionLayout({
      companionBounds: { x: 84, y: 60, width: 220, height: 230 },
      workArea,
      bubbleSizes: { talk: { width: 66, height: 34 }, listen: { width: 170, height: 48 }, panel: { width: 124, height: 42 }, more: { width: 82, height: 34 } },
    });
    withinWorkArea(result, workArea);
  });

  it('keeps the More menu inside the work area and flips it above a lower bubble', () => {
    const menu = resolveQuickActionMenuLayout({ x: 690, y: 540, width: 94, height: 38 }, area);
    expect(menu.opensAbove).toBe(true);
    expect(menu.rect.x + menu.rect.width).toBeLessThanOrEqual(area.width);
    expect(menu.rect.y).toBeGreaterThanOrEqual(area.y);
    expect(menu.rect.y + menu.rect.height).toBeLessThanOrEqual(area.height);
  });
});
