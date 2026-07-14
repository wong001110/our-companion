import type { Rect } from './floatingPlacement';

export interface InteractiveRegionLayout {
  companion: Rect;
  bubbles: Rect[];
  safePaths: Rect[];
}

function expand(rect: Rect, amount: number): Rect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

/**
 * Describes the minimal interaction group for the click-through Companion window.
 * Each bridge prevents a pointer travelling from the Companion to a bubble from
 * falling through a transparent gap.
 */
export function resolveInteractiveRegionLayout(companion: Rect, bubbles: Rect[], safePathPadding = 14): InteractiveRegionLayout {
  const companionCenter = { x: companion.x + companion.width / 2, y: companion.y + companion.height / 2 };
  return {
    companion: expand(companion, safePathPadding),
    bubbles: bubbles.map((bubble) => expand(bubble, safePathPadding)),
    safePaths: bubbles.map((bubble) => {
      const bubbleCenter = { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 };
      return expand({
        x: Math.min(companionCenter.x, bubbleCenter.x),
        y: Math.min(companionCenter.y, bubbleCenter.y),
        width: Math.abs(companionCenter.x - bubbleCenter.x),
        height: Math.abs(companionCenter.y - bubbleCenter.y),
      }, safePathPadding);
    }),
  };
}

export function pointIsInteractive(point: { x: number; y: number }, layout: InteractiveRegionLayout): boolean {
  return [layout.companion, ...layout.bubbles, ...layout.safePaths].some((rect) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
}
