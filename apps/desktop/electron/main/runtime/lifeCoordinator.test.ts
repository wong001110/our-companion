import { describe, expect, it } from 'vitest';
import { LifeCoordinator } from './LifeCoordinator';

describe('LifeCoordinator', () => {
  it('enforces minimum duration before transition', () => {
    let now = 1_000_000;
    const life = new LifeCoordinator({ now: () => now, random: () => 0 });
    life.initialize('ann', 'resting', 'test');
    expect(life.canTransition('ann')).toBe(false);
    now += 130_000;
    expect(life.canTransition('ann')).toBe(true);
  });

  it('does not immediately repeat the same activity', () => {
    let randomIdx = 0;
    const randomValues = [0, 0, 0.99];
    const life = new LifeCoordinator({
      now: () => Date.now(),
      random: () => randomValues[randomIdx++ % randomValues.length]
    });
    life.initialize('ann', 'idle', 'start');
    const next = life.selectNextActivity('ann', {
      conversationActive: false,
      companionDragging: false,
      hasPendingAction: false,
      localHour: 14
    });
    expect(next).not.toBe('idle');
  });

  it('restores valid activity after override', () => {
    let now = 1_000_000;
    const life = new LifeCoordinator({ now: () => now, random: () => 0.5 });
    life.initialize('ann', 'thinking', 'test');
    life.interrupt('ann', 'interacting', 'conversation');
    const restored = life.restoreAfterOverride('ann');
    expect(restored).toBe('thinking');
  });
});
