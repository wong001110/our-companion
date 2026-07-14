import type { VisualVisitFacing, VisualVisitRenderModel } from '@our-companion/shared';

export const REMOTE_VISITOR_SPEED_PX_PER_SECOND = 60;
export const REMOTE_VISITOR_SIZE = { width: 220, height: 230 };

export interface VisitorBounds { x?: number; y?: number; width: number; height: number; }
export interface VisitorPosition { x: number; y: number; }

export function initialVisitorPosition(bounds: VisitorBounds): VisitorPosition {
  const x = bounds.x ?? 0; const y = bounds.y ?? 0;
  return clampVisitorPosition({ x: x + bounds.width - REMOTE_VISITOR_SIZE.width - 32, y: y + Math.round(bounds.height * 0.6) }, bounds);
}

export function clampVisitorPosition(position: VisitorPosition, bounds: VisitorBounds): VisitorPosition {
  const x = bounds.x ?? 0; const y = bounds.y ?? 0;
  return {
    x: Math.max(x, Math.min(Math.round(position.x), Math.max(x, x + bounds.width - REMOTE_VISITOR_SIZE.width))),
    y: Math.max(y, Math.min(Math.round(position.y), Math.max(y, y + bounds.height - REMOTE_VISITOR_SIZE.height))),
  };
}

export function seededUnit(seed: string, index: number): number {
  let value = 2166136261;
  for (const char of `${seed}:${index}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return ((value >>> 0) % 10_000) / 10_000;
}

export function walkSelection(
  current: VisitorPosition,
  target: VisitorPosition,
  available: Record<string, string>,
): { animationName: string; facing: VisualVisitFacing } {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const horizontal = dx < 0 ? 'left' : 'right';
  const vertical = dy < 0 ? 'up' : 'down';
  if (Math.abs(dx) > 8 && Math.abs(dy) > 8) {
    const diagonal = `${vertical === 'up' ? 'top' : 'bottom'}_${horizontal}` as VisualVisitFacing;
    const legacy = `Walk_${vertical === 'up' ? 'Up' : 'Down'}${horizontal === 'left' ? 'Left' : 'Right'}`;
    const preferred = `Walk_${vertical === 'up' ? 'Top' : 'Bottom'}${horizontal === 'left' ? 'Left' : 'Right'}`;
    if (available[preferred]) return { animationName: preferred, facing: diagonal };
    if (available[legacy]) return { animationName: legacy, facing: diagonal };
    return { animationName: horizontal === 'left' ? 'Walk_Left' : 'Walk_Right', facing: diagonal };
  }
  if (Math.abs(dx) >= Math.abs(dy)) return { animationName: horizontal === 'left' ? 'Walk_Left' : 'Walk_Right', facing: horizontal };
  return { animationName: vertical === 'up' ? 'Walk_Up' : 'Walk_Down', facing: vertical };
}

export function nextWalkTarget(sessionId: string, moveIndex: number, current: VisitorPosition, bounds: VisitorBounds): VisitorPosition {
  const distance = 60 + seededUnit(sessionId, moveIndex) * 140;
  const angle = seededUnit(sessionId, moveIndex + 1000) * Math.PI * 2;
  return clampVisitorPosition({ x: current.x + Math.cos(angle) * distance, y: current.y + Math.sin(angle) * distance }, bounds);
}

export function isVisualVisitModel(value: unknown): value is VisualVisitRenderModel {
  return Boolean(value && typeof value === 'object' && (value as VisualVisitRenderModel).role === 'remote_visitor');
}
