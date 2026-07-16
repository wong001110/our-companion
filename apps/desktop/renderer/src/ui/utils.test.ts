import { describe, expect, it } from 'vitest';
import { COMPANION_ANIMATION_NAMES } from '@our-companion/shared';
import { getDevAnimationsForAssets } from './utils';

describe('getDevAnimationsForAssets', () => {
  it('returns the current Companion animation assets in runtime-manifest order', () => {
    const assets = [
      { name: 'Talk_Thinking.png', subfolder: 'animations' },
      { name: 'Idle_Neutral.png', subfolder: 'animations' },
      { name: 'notes.txt', subfolder: 'animations' },
      { name: 'Walk_Up.png', subfolder: 'other' },
      { name: 'Music_Idle.png', subfolder: 'animations' },
    ];

    expect(getDevAnimationsForAssets(assets)).toEqual([
      'live',
      ...COMPANION_ANIMATION_NAMES.filter((name) => ['Idle_Neutral', 'Talk_Thinking', 'Music_Idle'].includes(name)),
    ]);
  });
});
