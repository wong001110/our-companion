import type { Rect } from '../../../companion/floatingPlacement';

export type QuickActionSide = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface QuickActionPlacement {
  id: string;
  preferredSide: QuickActionSide;
  offsetX?: number;
  offsetY?: number;
}

export interface ResolvedQuickActionPlacement {
  id: string;
  side: QuickActionSide;
  rect: Rect;
  flippedHorizontally: boolean;
  flippedVertically: boolean;
}

export interface QuickActionMenuLayout {
  rect: Rect;
  opensAbove: boolean;
}

export const DEFAULT_QUICK_ACTION_PLACEMENTS: QuickActionPlacement[] = [
  { id: 'talk', preferredSide: 'top-left' },
  { id: 'listen', preferredSide: 'top-right' },
  { id: 'panel', preferredSide: 'bottom-left' },
  { id: 'more', preferredSide: 'bottom-right' },
];

// The Companion interaction bounds include transparent sprite padding. A small
// negative gap pulls the bubbles toward the rendered character while keeping
// their existing boundary-aware placement behavior.
const DEFAULT_GAP = -12;

function sideParts(side: QuickActionSide) {
  return {
    horizontal: side.endsWith('left') ? 'left' : 'right',
    vertical: side.startsWith('top') ? 'top' : 'bottom',
  } as const;
}

function makeSide(horizontal: 'left' | 'right', vertical: 'top' | 'bottom'): QuickActionSide {
  return `${vertical}-${horizontal}`;
}

function rectForSide(companionBounds: Rect, size: { width: number; height: number }, side: QuickActionSide, gap: number, offsetX = 0, offsetY = 0): Rect {
  const { horizontal, vertical } = sideParts(side);
  const x = horizontal === 'left'
    ? companionBounds.x - size.width - gap + offsetX
    : companionBounds.x + companionBounds.width + gap + offsetX;
  const y = vertical === 'top'
    ? companionBounds.y - size.height - gap + offsetY
    : companionBounds.y + companionBounds.height + gap + offsetY;
  return { x, y, width: size.width, height: size.height };
}

function fits(rect: Rect, area: Rect) {
  return rect.x >= area.x && rect.y >= area.y && rect.x + rect.width <= area.x + area.width && rect.y + rect.height <= area.y + area.height;
}

function clamp(rect: Rect, area: Rect): Rect {
  return {
    ...rect,
    x: Math.max(area.x, Math.min(rect.x, area.x + area.width - rect.width)),
    y: Math.max(area.y, Math.min(rect.y, area.y + area.height - rect.height)),
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Keeps boundary flips from collapsing multiple bubbles into the same corner. */
function avoidBubbleCollisions(rect: Rect, placed: ResolvedQuickActionPlacement[], area: Rect): Rect {
  if (!placed.some((item) => overlaps(rect, item.rect))) return rect;
  const step = 50;
  const offsets: Array<[number, number]> = [];
  for (let distance = step; distance <= step * 8; distance += step) {
    offsets.push([0, distance], [0, -distance], [distance, 0], [-distance, 0]);
  }
  for (const [x, y] of offsets) {
    const candidate = { ...rect, x: rect.x + x, y: rect.y + y };
    if (fits(candidate, area) && !placed.some((item) => overlaps(candidate, item.rect))) return candidate;
  }
  return rect;
}

/** Places the secondary More menu inside the usable display bounds. */
export function resolveQuickActionMenuLayout(anchor: Rect, workArea: Rect, size = { width: 176, height: 122 }, gap = 8): QuickActionMenuLayout {
  const opensAbove = anchor.y + anchor.height + gap + size.height > workArea.y + workArea.height;
  const preferred: Rect = {
    x: anchor.x,
    y: opensAbove ? anchor.y - size.height - gap : anchor.y + anchor.height + gap,
    width: size.width,
    height: size.height,
  };
  return { rect: clamp(preferred, workArea), opensAbove };
}

/** Resolves the four action bubbles as a single boundary-aware group. */
export function resolveQuickActionLayout({
  companionBounds,
  workArea,
  bubbleSizes,
  preferredPlacements = DEFAULT_QUICK_ACTION_PLACEMENTS,
  gap = DEFAULT_GAP,
}: {
  companionBounds: Rect;
  workArea: Rect;
  bubbleSizes: Record<string, { width: number; height: number }>;
  preferredPlacements?: QuickActionPlacement[];
  gap?: number;
}): ResolvedQuickActionPlacement[] {
  const resolved: ResolvedQuickActionPlacement[] = [];
  for (const placement of preferredPlacements) {
    const size = bubbleSizes[placement.id];
    if (!size) continue;
    const preferred = sideParts(placement.preferredSide);
    let horizontal = preferred.horizontal;
    let vertical = preferred.vertical;
    let side = makeSide(horizontal, vertical);
    let rect = rectForSide(companionBounds, size, side, gap, placement.offsetX, placement.offsetY);
    let flippedHorizontally = false;
    let flippedVertically = false;

    if (rect.x < workArea.x || rect.x + rect.width > workArea.x + workArea.width) {
      horizontal = horizontal === 'left' ? 'right' : 'left';
      flippedHorizontally = true;
      side = makeSide(horizontal, vertical);
      rect = rectForSide(companionBounds, size, side, gap, placement.offsetX, placement.offsetY);
    }
    if (rect.y < workArea.y || rect.y + rect.height > workArea.y + workArea.height) {
      vertical = vertical === 'top' ? 'bottom' : 'top';
      flippedVertically = true;
      side = makeSide(horizontal, vertical);
      rect = rectForSide(companionBounds, size, side, gap, placement.offsetX, placement.offsetY);
    }

    // A very small work area can make even the flipped direction unavailable.
    if (!fits(rect, workArea)) rect = clamp(rect, workArea);
    rect = avoidBubbleCollisions(rect, resolved, workArea);
    resolved.push({ id: placement.id, side, rect, flippedHorizontally, flippedVertically });
  }
  return resolved;
}
