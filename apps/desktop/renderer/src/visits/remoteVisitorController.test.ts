import { describe, expect, it } from 'vitest';
import { clampVisitorPosition, initialVisitorPosition, nextWalkTarget, resolveVisitorPosition, sceneDepth, walkSelection } from './remoteVisitorController';

describe('remote visitor movement controller', () => {
  it('spawns and clamps inside the current display work area', () => {
    expect(initialVisitorPosition({ width: 800, height: 600 })).toEqual({ x: 548, y: 360 });
    expect(clampVisitorPosition({ x: 9999, y: -4 }, { width: 800, height: 600 })).toEqual({ x: 580, y: 0 });
    expect(clampVisitorPosition({ x: 0, y: 9999 }, { x: 50, y: 40, width: 480, height: 360 })).toEqual({ x: 50, y: 170 });
  });

  it('uses deterministic, separate scene slots and avoids the local Companion bounds', () => {
    const bounds = { width: 1_000, height: 700 };
    const local = { x: 390, y: 320, width: 220, height: 230 };
    const first = initialVisitorPosition(bounds, 0, [local]);
    const second = initialVisitorPosition(bounds, 1, [local, first]);
    expect(first).not.toEqual(second);
    expect(resolveVisitorPosition({ x: first.x, y: first.y }, bounds, [first])).not.toEqual(first);
  });

  it('never uses a top-left collision fallback and allows visual body overlap', () => {
    const bounds = { width: 1_000, height: 700 };
    const occupant = { x: 400, y: 300 };
    const resolved = resolveVisitorPosition(occupant, bounds, [occupant]);
    expect(resolved).not.toEqual({ x: 0, y: 0 });
    expect(resolveVisitorPosition({ x: 450, y: 240 }, bounds, [occupant])).toEqual({ x: 450, y: 240 });
  });

  it('uses cardinal movement when no diagonal asset exists and remains deterministic', () => {
    const assets = { Walk_Left: 'left', Walk_Right: 'right', Walk_Up: 'up', Walk_Down: 'down' };
    expect(walkSelection({ x: 100, y: 100 }, { x: 10, y: 10 }, assets)).toEqual({ animationName: 'Walk_Left', facing: 'top_left' });
    expect(nextWalkTarget('session-1', 3, { x: 300, y: 200 }, { width: 800, height: 600 })).toEqual(nextWalkTarget('session-1', 3, { x: 300, y: 200 }, { width: 800, height: 600 }));
  });

  it('uses one deterministic depth plane for local and remote scene occupants', () => {
    expect(sceneDepth({ x: 0, y: 410 }, 'local-companion')).toBeGreaterThan(sceneDepth({ x: 0, y: 409 }, 'visitor-a'));
    expect(sceneDepth({ x: 0, y: 300 }, 'visitor-a')).toBe(sceneDepth({ x: 0, y: 300 }, 'visitor-a'));
    expect(sceneDepth({ x: 0, y: 300 }, 'visitor-a')).not.toBe(sceneDepth({ x: 0, y: 300 }, 'visitor-b'));
  });
});
