import { describe, expect, it } from 'vitest';
import { resolveAnimationIntent, resolveToAssetKey } from './AnimationResolver';

describe('AnimationResolver', () => {
  it('maps sleeping idle to Idle_Sleeping', () => {
    expect(resolveToAssetKey({ category: 'idle', variant: 'sleeping' })).toBe('Idle_Sleeping');
  });

  it('maps neutral talk to Talk_Neutral', () => {
    expect(resolveToAssetKey({ category: 'talk', emotion: 'neutral' })).toBe('Talk_Neutral');
  });

  it('maps silent thinking to Think', () => {
    expect(resolveToAssetKey({ category: 'think' })).toBe('Think');
  });

  it('keeps thinking while speaking distinct', () => {
    expect(resolveToAssetKey({ category: 'talk', emotion: 'thinking' })).toBe('Talk_Thinking');
  });

  it('maps all eight walk directions', () => {
    const expected = { left: 'Walk_Left', right: 'Walk_Right', up: 'Walk_Up', down: 'Walk_Down', top_left: 'Walk_UpLeft', top_right: 'Walk_UpRight', bottom_left: 'Walk_DownLeft', bottom_right: 'Walk_DownRight' } as const;
    for (const [direction, asset] of Object.entries(expected)) {
      expect(resolveToAssetKey({ category: 'walk', direction: direction as keyof typeof expected })).toBe(asset);
    }
    expect(resolveAnimationIntent({ category: 'walk' }).assetKey).toBe('Idle_Neutral');
  });

  it('uses Idle_Neutral fallback for unknown mapping', () => {
    const result = resolveAnimationIntent({ category: 'enter' });
    expect(result.assetKey).toBe('Idle_Neutral');
    expect(result.usedFallback).toBe(true);
  });

  it('does not emit raw Sleep or Talk keys', () => {
    const sleeping = resolveToAssetKey({ category: 'idle', variant: 'sleeping' });
    const talking = resolveToAssetKey({ category: 'talk', emotion: 'neutral' });
    expect(sleeping).not.toBe('Sleep');
    expect(talking).not.toBe('Talk');
  });
});
