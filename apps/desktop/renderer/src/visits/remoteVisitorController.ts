import type { VisualVisitFacing, VisualVisitRenderModel } from '@our-companion/shared';
import {
  SCENE_SPRITE_SIZE,
  clampScenePosition,
  footprintForPosition,
  footprintsOverlap,
  sceneDepthForPosition,
} from '../motion/sceneMotion';

export const REMOTE_VISITOR_SIZE = SCENE_SPRITE_SIZE;

export interface VisitorBounds { x?: number; y?: number; width: number; height: number; }
export interface VisitorPosition { x: number; y: number; }
export interface VisitorOccupant extends VisitorPosition { width?: number; height?: number; }

/**
 * Draw every character in one scene depth plane.  The y coordinate is the
 * primary ordering (a character lower on screen is in front); identity is a
 * stable tie-breaker so two characters on the same row do not flicker.
 */
export function sceneDepth(position: VisitorPosition, identity: string): number {
  return sceneDepthForPosition(position, identity);
}

export function initialVisitorPosition(bounds: VisitorBounds, sceneSlotIndex = 0, occupants: VisitorOccupant[] = []): VisitorPosition {
  const x = bounds.x ?? 0; const y = bounds.y ?? 0;
  const slot = Math.abs(sceneSlotIndex) % 2;
  const preferred = {
    x: slot === 0 ? x + bounds.width - REMOTE_VISITOR_SIZE.width - 32 : x + 32,
    y: y + Math.round(bounds.height * 0.6),
  };
  return resolveVisitorPosition(preferred, bounds, occupants);
}

export function clampVisitorPosition(position: VisitorPosition, bounds: VisitorBounds): VisitorPosition {
  const clamped = clampScenePosition(position, bounds, REMOTE_VISITOR_SIZE);
  return { x: Math.round(clamped.x), y: Math.round(clamped.y) };
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
    const fallbackAnimation = `Walk_${vertical === 'up' ? 'Up' : 'Down'}${horizontal === 'left' ? 'Left' : 'Right'}`;
    const preferred = `Walk_${vertical === 'up' ? 'Top' : 'Bottom'}${horizontal === 'left' ? 'Left' : 'Right'}`;
    if (available[preferred]) return { animationName: preferred, facing: diagonal };
    if (available[fallbackAnimation]) return { animationName: fallbackAnimation, facing: diagonal };
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

/**
 * Spawn-only compatibility helper. Runtime movement is resolved by the shared
 * SceneOccupancyController and never relocates to a preset fallback.
 */
export function resolveVisitorPosition(candidate: VisitorPosition, bounds: VisitorBounds, occupants: VisitorOccupant[] = []): VisitorPosition {
  const desired = clampVisitorPosition(candidate, bounds);
  if (isClear(desired, occupants)) return desired;
  const candidates = Array.from({ length: 8 }, (_, index) => {
    const angle = index * Math.PI / 4;
    return clampVisitorPosition({
      x: desired.x + Math.cos(angle) * 96,
      y: desired.y + Math.sin(angle) * 64,
    }, bounds);
  });
  return candidates.find((position) => isClear(position, occupants)) ?? desired;
}

function isClear(position: VisitorPosition, occupants: VisitorOccupant[]): boolean {
  const footprint = footprintForPosition(position, REMOTE_VISITOR_SIZE);
  return occupants.every((occupant) => !footprintsOverlap(
    footprint,
    footprintForPosition(occupant, {
      width: occupant.width ?? REMOTE_VISITOR_SIZE.width,
      height: occupant.height ?? REMOTE_VISITOR_SIZE.height,
    }),
  ));
}

export function isVisualVisitModel(value: unknown): value is VisualVisitRenderModel {
  return Boolean(value && typeof value === 'object' && (value as VisualVisitRenderModel).role === 'remote_visitor');
}
