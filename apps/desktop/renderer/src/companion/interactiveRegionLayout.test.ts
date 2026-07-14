import { describe, expect, it } from 'vitest';
import { pointIsInteractive, resolveInteractiveRegionLayout } from './interactiveRegionLayout';

describe('interactive region layout', () => {
  it('keeps the Companion, bubbles, and the pointer path between them interactive', () => {
    const layout = resolveInteractiveRegionLayout(
      { x: 400, y: 400, width: 120, height: 160 },
      [{ x: 280, y: 290, width: 100, height: 38 }],
    );
    expect(pointIsInteractive({ x: 460, y: 480 }, layout)).toBe(true);
    expect(pointIsInteractive({ x: 330, y: 310 }, layout)).toBe(true);
    expect(pointIsInteractive({ x: 390, y: 365 }, layout)).toBe(true);
    expect(pointIsInteractive({ x: 80, y: 80 }, layout)).toBe(false);
  });

  it('creates an independent safe bridge for every bubble', () => {
    const layout = resolveInteractiveRegionLayout(
      { x: 200, y: 200, width: 100, height: 120 },
      [{ x: 80, y: 80, width: 80, height: 36 }, { x: 340, y: 340, width: 100, height: 36 }],
    );
    expect(layout.safePaths).toHaveLength(2);
    expect(pointIsInteractive({ x: 355, y: 355 }, layout)).toBe(true);
  });
});
