import type { SpriteSheetConfig } from '../SpriteAnimator';
import { AssetResolver, DEFAULT_ASSET_ROOT } from '../AssetResolver';

export const ANN_FRAME = { width: 300, height: 300 } as const;

export interface CompanionAnimationConfig extends SpriteSheetConfig {
  name: string;
}

function anim(name: string, frames: number, frameMs: number, assetRoot: string): CompanionAnimationConfig {
  const resolver = new AssetResolver(assetRoot);
  return {
    name,
    sheet: resolver.animation(name),
    frameWidth: ANN_FRAME.width,
    frameHeight: ANN_FRAME.height,
    frames,
    frameMs,
    columns: frames,
    rows: 1
  };
}

export function createCompanionAnimations(assetRoot: string = DEFAULT_ASSET_ROOT) {
  return {
    idle_laptop: anim('idle_laptop', 6, 520, assetRoot),
    idle_coffee: anim('idle_coffee', 4, 620, assetRoot),
    idle_notes: anim('idle_notes', 3, 520, assetRoot),
    idle_tired: anim('idle_tired', 4, 560, assetRoot),
    walk: anim('walk', 8, 180, assetRoot),
    return: anim('return', 4, 220, assetRoot),
    think: anim('think', 6, 420, assetRoot),
    focus_typing: anim('focus_typing', 4, 220, assetRoot),
    discovery: anim('discovery', 8, 260, assetRoot),
    discovery_shy: anim('discovery_shy', 4, 340, assetRoot),
    talk: anim('talk', 6, 280, assetRoot),
    talk_happy: anim('talk_happy', 4, 300, assetRoot),
    task_start: anim('task_start', 4, 300, assetRoot),
    task_success: anim('task_success', 4, 320, assetRoot),
    task_failed: anim('task_failed', 4, 360, assetRoot)
  } as const satisfies Record<string, CompanionAnimationConfig>;
}

export const companionAnimations = createCompanionAnimations();

export type AnimationName = keyof typeof companionAnimations;
