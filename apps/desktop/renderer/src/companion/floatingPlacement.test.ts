import { describe, expect, it } from 'vitest';
import {
  anchorFromBounds,
  computeFloatingPosition,
  rectFitsInArea,
  rectsOverlap,
} from './floatingPlacement';
import type { AnchorRect, Rect } from './floatingPlacement';

function makeAnchor(x: number, y: number, w: number, h: number): AnchorRect {
  return anchorFromBounds({ x, y, width: w, height: h });
}

function makeArea(x: number, y: number, w: number, h: number): Rect {
  return { x, y, width: w, height: h };
}

describe('floatingPlacement', () => {
  const workArea = makeArea(0, 0, 1920, 1080);
  const floating = { width: 300, height: 200 };

  it('top placement fits when anchor is far from top edge', () => {
    const anchor = makeAnchor(800, 500, 100, 100);
    const result = computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: floating,
      screenWorkArea: workArea,
      preferredPlacements: ['top'],
    });
    expect(result.placement).toBe('top');
    expect(result.clamped).toBe(false);
    expect(result.rect.y).toBe(500 - 200 - 12);
  });

  it('top placement falls back when near top edge', () => {
    const anchor = makeAnchor(800, 10, 100, 100);
    const result = computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: floating,
      screenWorkArea: workArea,
      preferredPlacements: ['top', 'right'],
    });
    expect(result.clamped).toBe(true);
    expect(result.rect.y).toBeGreaterThanOrEqual(0);
  });

  it('right placement fails near right edge, falls back to left', () => {
    const anchor = makeAnchor(1800, 500, 100, 100);
    const result = computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: floating,
      screenWorkArea: workArea,
      preferredPlacements: ['right', 'left'],
    });
    expect(result.placement).toBe('left');
    expect(result.clamped).toBe(false);
  });

  it('clamping works when no placement fits', () => {
    const tinyArea = makeArea(0, 0, 50, 50);
    const anchor = makeAnchor(25, 25, 10, 10);
    const result = computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: { width: 40, height: 40 },
      screenWorkArea: tinyArea,
      preferredPlacements: ['top'],
    });
    expect(result.clamped).toBe(true);
    expect(rectFitsInArea(result.rect, tinyArea)).toBe(true);
  });

  it('card avoids bubble obstacle', () => {
    const anchor = makeAnchor(800, 500, 100, 100);
    const bubbleRect: Rect = { x: 924, y: 288, width: 300, height: 200 };
    const result = computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: floating,
      screenWorkArea: workArea,
      preferredPlacements: ['right', 'left', 'top', 'bottom'],
      obstacles: [bubbleRect],
    });
    expect(rectsOverlap(result.rect, bubbleRect)).toBe(false);
    expect(result.placement).not.toBe('right');
  });

  it('multi-monitor workArea input respected', () => {
    const monitor2 = makeArea(1920, 0, 1920, 1080);
    const anchor = makeAnchor(2400, 500, 100, 100);
    const result = computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: floating,
      screenWorkArea: monitor2,
      preferredPlacements: ['top', 'right', 'bottom', 'left'],
    });
    expect(result.rect.x).toBeGreaterThanOrEqual(monitor2.x);
    expect(result.rect.x + result.rect.width).toBeLessThanOrEqual(monitor2.x + monitor2.width);
  });

  it('overlap detection works', () => {
    const a: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const b: Rect = { x: 5, y: 5, width: 10, height: 10 };
    const c: Rect = { x: 20, y: 20, width: 10, height: 10 };
    expect(rectsOverlap(a, b)).toBe(true);
    expect(rectsOverlap(a, c)).toBe(false);
  });

  it('bottom placement works', () => {
    const anchor = makeAnchor(800, 500, 100, 100);
    const result = computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: floating,
      screenWorkArea: workArea,
      preferredPlacements: ['bottom'],
    });
    expect(result.placement).toBe('bottom');
    expect(result.rect.y).toBe(600 + 12);
  });

  it('left placement works', () => {
    const anchor = makeAnchor(800, 500, 100, 100);
    const result = computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: floating,
      screenWorkArea: workArea,
      preferredPlacements: ['left'],
    });
    expect(result.placement).toBe('left');
    expect(result.rect.x).toBe(800 - 300 - 12);
  });
});
