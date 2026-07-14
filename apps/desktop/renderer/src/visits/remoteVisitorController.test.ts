import { describe, expect, it } from 'vitest';
import { clampVisitorPosition, initialVisitorPosition, nextWalkTarget, walkSelection } from './remoteVisitorController';

describe('remote visitor movement controller', () => {
  it('spawns and clamps inside the current display work area', () => {
    expect(initialVisitorPosition({ width: 800, height: 600 })).toEqual({ x: 548, y: 360 });
    expect(clampVisitorPosition({ x: 9999, y: -4 }, { width: 800, height: 600 })).toEqual({ x: 580, y: 0 });
    expect(clampVisitorPosition({ x: 0, y: 9999 }, { x: 50, y: 40, width: 480, height: 360 })).toEqual({ x: 50, y: 170 });
  });

  it('uses cardinal movement when no diagonal asset exists and remains deterministic', () => {
    const assets = { Walk_Left: 'left', Walk_Right: 'right', Walk_Up: 'up', Walk_Down: 'down' };
    expect(walkSelection({ x: 100, y: 100 }, { x: 10, y: 10 }, assets)).toEqual({ animationName: 'Walk_Left', facing: 'top_left' });
    expect(nextWalkTarget('session-1', 3, { x: 300, y: 200 }, { width: 800, height: 600 })).toEqual(nextWalkTarget('session-1', 3, { x: 300, y: 200 }, { width: 800, height: 600 }));
  });
});
