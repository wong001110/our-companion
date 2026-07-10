import { describe, expect, it } from 'vitest';
import { resolveAnimationIntent, resolveToAssetKey } from './AnimationResolver';

describe('AnimationResolver', () => {
  it('maps sleeping idle to Idle_Sleeping', () => {
    expect(resolveToAssetKey({ category: 'idle', variant: 'sleeping' })).toBe('Idle_Sleeping');
  });

  it('maps neutral talk to Talk_Neutral', () => {
    expect(resolveToAssetKey({ category: 'talk', emotion: 'neutral' })).toBe('Talk_Neutral');
  });

  it('maps thinking to Talk_Thinking', () => {
    expect(resolveToAssetKey({ category: 'think' })).toBe('Talk_Thinking');
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
