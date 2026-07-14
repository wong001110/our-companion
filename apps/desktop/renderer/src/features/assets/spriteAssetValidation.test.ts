import { describe, expect, it } from 'vitest';
import { matchingAnimationName } from './spriteAssetValidation';

describe('sprite asset filename matching', () => {
  const animations = ['Idle_Neutral', 'Walk_Left', 'Enter'];
  it('matches case, dashes, and spaces without logging debug data', () => {
    expect(matchingAnimationName('idle-neutral.PNG', animations)).toBe('Idle_Neutral');
    expect(matchingAnimationName('Walk Left.png', animations)).toBe('Walk_Left');
  });
  it('rejects unknown names', () => expect(matchingAnimationName('notes.png', animations)).toBeUndefined());
});
