import { describe, expect, it } from 'vitest';
import { SceneOccupancyController } from './SceneOccupancyController';
import {
  BASE_WALK_SPEED,
  DEFAULT_MOTION_PROFILE,
  actorHasPriority,
  clampScenePosition,
  computeWalkPlaybackRate,
  footprintForPosition,
  footprintsOverlap,
  isTeleportWithinInvariant,
  motionProfileForPersonality,
  resolveFootprintMovement,
  stepTowardTarget,
  type SceneActor,
} from './sceneMotion';

const bounds = { width: 1_000, height: 700 };
const actor = (id: string, x: number, y: number, phase: SceneActor['phase'] = 'wandering'): SceneActor => ({
  id,
  type: id === 'local' ? 'local_companion' : 'remote_visitor',
  position: { x, y },
  phase,
});

describe('shared scene motion', () => {
  it('keeps personality speed within plus or minus ten percent', () => {
    expect(motionProfileForPersonality(0).walkSpeedPxPerSecond).toBe(BASE_WALK_SPEED * 0.9);
    expect(motionProfileForPersonality(100).walkSpeedPxPerSecond).toBe(BASE_WALK_SPEED * 1.1);
  });

  it('uses bounded acceleration and never exceeds base speed on short or long steps', () => {
    const short = stepTowardTarget({ current: { x: 0, y: 0 }, target: { x: 24, y: 0 }, currentSpeed: 0, deltaTimeMs: 100 });
    const long = stepTowardTarget({ current: { x: 0, y: 0 }, target: { x: 800, y: 0 }, currentSpeed: 79, deltaTimeMs: 100 });
    expect(short.speed).toBeCloseTo(24);
    expect(short.desiredPosition.x).toBeGreaterThan(0);
    expect(long.speed).toBeLessThanOrEqual(DEFAULT_MOTION_PROFILE.walkSpeedPxPerSecond);
    expect(long.desiredPosition.x).toBeLessThanOrEqual(8);
  });

  it('bounds animation playback and decouples it from uploaded frame timing', () => {
    expect(computeWalkPlaybackRate(1)).toBe(0.8);
    expect(computeWalkPlaybackRate(80)).toBe(1);
    expect(computeWalkPlaybackRate(500)).toBe(1.2);
  });

  it('allows sprite bodies to overlap while keeping bottom footprints apart', () => {
    const first = footprintForPosition({ x: 100, y: 100 });
    const bodyOverlappingButFeetClear = footprintForPosition({ x: 150, y: 45 });
    expect(footprintsOverlap(first, bodyOverlappingButFeetClear)).toBe(false);
    expect(footprintsOverlap(first, footprintForPosition({ x: 130, y: 100 }))).toBe(true);
  });

  it('slides locally or stays exactly in place when blocked', () => {
    const mover = actor('visitor-b', 100, 100);
    const blocker = actor('visitor-a', 180, 100, 'stationary');
    const blocked = resolveFootprintMovement(mover, mover.position, { x: 130, y: 100 }, [blocker], bounds);
    expect(blocked).toEqual({ status: 'blocked', position: mover.position });
    const slid = resolveFootprintMovement(mover, mover.position, { x: 130, y: 130 }, [blocker], bounds);
    expect(['slid', 'moved']).toContain(slid.status);
    expect(Math.hypot(slid.position.x - mover.position.x, slid.position.y - mover.position.y)).toBeLessThan(45);
  });

  it('uses stable drag, transition, stationary, wandering, and actor-id priority', () => {
    expect(actorHasPriority(actor('drag', 0, 0, 'dragging'), actor('idle', 0, 0, 'stationary'))).toBe(true);
    expect(actorHasPriority(actor('idle', 0, 0, 'stationary'), actor('walk', 0, 0))).toBe(true);
    expect(actorHasPriority(actor('a', 0, 0), actor('b', 0, 0))).toBe(true);
  });

  it('lets a visitor naturally walk out after the user drags the local actor into it', () => {
    const visitor = actor('visitor', 100, 100);
    const draggedLocal = actor('local', 120, 100, 'dragging');
    const result = resolveFootprintMovement(visitor, visitor.position, { x: 95, y: 100 }, [draggedLocal], bounds);
    expect(result.status).toBe('moved');
    expect(result.position.x).toBeLessThan(visitor.position.x);
  });

  it('enforces the teleport invariant with documented exclusions', () => {
    expect(isTeleportWithinInvariant({ previous: { x: 0, y: 0 }, next: { x: 11, y: 0 }, maxAllowedSpeed: 80, deltaTimeMs: 100 })).toBe(false);
    expect(isTeleportWithinInvariant({ previous: { x: 0, y: 0 }, next: { x: 8, y: 0 }, maxAllowedSpeed: 80, deltaTimeMs: 100 })).toBe(true);
    expect(isTeleportWithinInvariant({ previous: { x: 0, y: 0 }, next: { x: 500, y: 0 }, maxAllowedSpeed: 80, deltaTimeMs: 16, exclusion: 'user_drag' })).toBe(true);
  });

  it('only clamps the minimum required distance during display recovery', () => {
    expect(clampScenePosition({ x: 900, y: 600 }, { width: 800, height: 600 })).toEqual({ x: 580, y: 370 });
  });
});

describe('SceneOccupancyController', () => {
  it('plans 24-320px footprint-safe targets and may return no movement', () => {
    const controller = new SceneOccupancyController(bounds);
    controller.register(actor('local', 100, 100));
    expect(controller.planTarget('local', { x: 900, y: 100 })?.x).toBeLessThanOrEqual(420);
    expect(controller.planTarget('local', { x: 110, y: 100 })).toBeUndefined();
  });

  it('uses the same step for local and remote actors without preset relocation', () => {
    const controller = new SceneOccupancyController(bounds);
    controller.register(actor('local', 100, 100));
    controller.register(actor('visit:1', 500, 100));
    const local = controller.step('local', { x: 300, y: 100 }, 100);
    const remote = controller.step('visit:1', { x: 700, y: 100 }, 100);
    expect(local.speed).toBe(remote.speed);
    expect(local.position.x - 100).toBeCloseTo(remote.position.x - 500);
    expect(controller.getDiagnostics().teleportViolationCount).toBe(0);
  });

  it('resolves simultaneous wandering conflicts by stable actor ID', () => {
    const controller = new SceneOccupancyController(bounds);
    controller.register(actor('a', 100, 100));
    controller.register(actor('b', 180, 100));
    const winner = controller.step('a', { x: 200, y: 100 }, 100);
    const loser = controller.step('b', { x: 80, y: 100 }, 100);
    expect(winner.status).toBe('moved');
    expect(loser.status).toBe('blocked');
  });

  it('cancels a blocked path after 500ms and retains the corner position', () => {
    const controller = new SceneOccupancyController({ width: 440, height: 460 });
    controller.register(actor('visitor', 0, 230));
    controller.register(actor('blocker', 80, 230, 'stationary'));
    let result = controller.step('visitor', { x: 200, y: 230 }, 100);
    for (let index = 0; index < 4; index += 1) result = controller.step('visitor', { x: 200, y: 230 }, 100);
    expect(result.status).toBe('blocked');
    expect(result.cancelPath).toBe(true);
    expect(result.position).toEqual({ x: 0, y: 230 });
  });
});
