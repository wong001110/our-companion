import { describe, expect, it } from 'vitest';
import { COMPANION_ANIMATION_MANIFEST, COMPANION_ANIMATION_NAMES } from '@our-companion/shared';
import { createCompanionAnimations } from './animationConfig';

describe('Companion animation config', () => {
  it('derives all sprite configs and playback metadata from the shared manifest', () => {
    const animations = createCompanionAnimations('companion://companion-1/assets');
    expect(Object.keys(animations)).toEqual(COMPANION_ANIMATION_NAMES);
    for (const entry of COMPANION_ANIMATION_MANIFEST) {
      expect(animations[entry.key]).toMatchObject({
        name: entry.key,
        frameMs: entry.frameDurationMs,
        loop: entry.loop,
        sheet: `companion://companion-1/assets/animations/${entry.fileName}`,
      });
    }
  });
});
