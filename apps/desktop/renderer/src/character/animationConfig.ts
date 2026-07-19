import type { SpriteSheetConfig } from './SpriteAnimator';
import { AssetResolver } from './AssetResolver';
import { COMPANION_ANIMATION_MANIFEST, type CompanionAnimationManifestEntry, type CompanionAnimationName } from '@our-companion/shared';

export interface CompanionAnimationConfig extends SpriteSheetConfig {
  name: CompanionAnimationName;
}

const DEFAULT_FRAME_WIDTH = 300;
const DEFAULT_FRAME_HEIGHT = 300;

function anim(definition: CompanionAnimationManifestEntry, assetRoot: string, frameWidth = DEFAULT_FRAME_WIDTH, frameHeight = DEFAULT_FRAME_HEIGHT): CompanionAnimationConfig {
  const resolver = new AssetResolver(assetRoot);
  return {
    name: definition.key,
    sheet: resolver.animation(definition.key),
    frameWidth,
    frameHeight,
    frameMs: definition.frameDurationMs,
    loop: definition.loop,
  };
}

export function createCompanionAnimations(assetRoot: string) {
  return Object.fromEntries(
    COMPANION_ANIMATION_MANIFEST.map((definition) => [definition.key, anim(definition, assetRoot)]),
  ) as Record<CompanionAnimationName, CompanionAnimationConfig>;
}

export type AnimationName = keyof ReturnType<typeof createCompanionAnimations>;
