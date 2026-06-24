import { describe, expect, it } from 'vitest';
import { getSpeechDuration, getWalkDelay, getWalkDelayRange, selectSpeechLine } from './companionBehavior';

describe('Ann companion behavior', () => {
  it('maps low movement to slower walking than high movement', () => {
    const calm = getWalkDelayRange(25);
    const energetic = getWalkDelayRange(90);

    expect(calm.minMs).toBeGreaterThan(energetic.minMs);
    expect(calm.maxMs).toBeGreaterThan(energetic.maxMs);
    expect(calm.minMs).toBeGreaterThanOrEqual(30000);
  });

  it('supports deterministic walk delays', () => {
    const range = getWalkDelayRange(100);

    expect(getWalkDelay(100, () => 0)).toBe(range.minMs);
    expect(getWalkDelay(100, () => 1)).toBe(range.maxMs);
  });

  it('selects short local speech lines', () => {
    expect(selectSpeechLine('walk_start', () => 0)).toBe('Stretching my legs for a bit.');
    expect(selectSpeechLine('walk_end', () => 0.99)).toBe('That was a nice little walk.');
    expect(getSpeechDuration('Back to my spot.')).toBeGreaterThanOrEqual(3000);
  });
});
