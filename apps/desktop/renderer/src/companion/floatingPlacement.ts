export type Placement = 'top' | 'right' | 'bottom' | 'left';

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnchorRect = Rect & {
  centerX: number;
  centerY: number;
};

export const DEFAULT_FLOATING_GAP = 12;

export function anchorFromBounds(bounds: Rect): AnchorRect {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    centerX: bounds.x + bounds.width / 2,
    centerY: bounds.y + bounds.height / 2,
  };
}

export function rectFitsInArea(rect: Rect, area: Rect): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.width <= area.x + area.width &&
    rect.y + rect.height <= area.y + area.height
  );
}

export function clampRectToArea(rect: Rect, area: Rect): Rect {
  const x = Math.max(area.x, Math.min(rect.x, area.x + area.width - rect.width));
  const y = Math.max(area.y, Math.min(rect.y, area.y + area.height - rect.height));
  return { x, y, width: rect.width, height: rect.height };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function computeRect(
  anchor: AnchorRect,
  floating: { width: number; height: number },
  placement: Placement,
  gap: number,
): Rect {
  switch (placement) {
    case 'top':
      return {
        x: anchor.centerX - floating.width / 2,
        y: anchor.y - floating.height - gap,
        width: floating.width,
        height: floating.height,
      };
    case 'right':
      return {
        x: anchor.x + anchor.width + gap,
        y: anchor.centerY - floating.height / 2,
        width: floating.width,
        height: floating.height,
      };
    case 'bottom':
      return {
        x: anchor.centerX - floating.width / 2,
        y: anchor.y + anchor.height + gap,
        width: floating.width,
        height: floating.height,
      };
    case 'left':
      return {
        x: anchor.x - floating.width - gap,
        y: anchor.centerY - floating.height / 2,
        width: floating.width,
        height: floating.height,
      };
  }
}

export type ComputeFloatingPositionInput = {
  anchorRect: AnchorRect;
  floatingSize: { width: number; height: number };
  screenWorkArea: Rect;
  preferredPlacements: Placement[];
  gap?: number;
  obstacles?: Rect[];
};

export type ComputeFloatingPositionResult = {
  rect: Rect;
  placement: Placement;
  clamped: boolean;
  overlappedObstacle: boolean;
};

export function computeFloatingPosition(
  input: ComputeFloatingPositionInput,
): ComputeFloatingPositionResult {
  const { anchorRect, floatingSize, screenWorkArea, preferredPlacements, obstacles = [] } = input;
  const gap = input.gap ?? DEFAULT_FLOATING_GAP;

  for (const placement of preferredPlacements) {
    const rect = computeRect(anchorRect, floatingSize, placement, gap);
    if (!rectFitsInArea(rect, screenWorkArea)) continue;
    if (obstacles.some((obs) => rectsOverlap(rect, obs))) continue;
    return { rect, placement, clamped: false, overlappedObstacle: false };
  }

  const firstPlacement = preferredPlacements[0] ?? 'top';
  const rect = clampRectToArea(
    computeRect(anchorRect, floatingSize, firstPlacement, gap),
    screenWorkArea,
  );
  const overlappedObstacle = obstacles.some((obs) => rectsOverlap(rect, obs));
  return { rect, placement: firstPlacement, clamped: true, overlappedObstacle };
}
