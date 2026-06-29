import type { SpriteSheetConfig } from '../SpriteAnimator';
import { AssetResolver, DEFAULT_ASSET_ROOT } from '../AssetResolver';
import type { CompanionAnimationName } from '../../companion/runtime/animationRegistry';

export const ANN_FRAME = { width: 300, height: 300 } as const;

export interface CompanionAnimationConfig extends SpriteSheetConfig {
  name: CompanionAnimationName;
}

function anim(name: CompanionAnimationName, frames: number, frameMs: number, assetRoot: string): CompanionAnimationConfig {
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
    Idle_Neutral: anim('Idle_Neutral', 6, 520, assetRoot),
    Idle_Breathe: anim('Idle_Breathe', 4, 620, assetRoot),
    Idle_Sleepy: anim('Idle_Sleepy', 3, 520, assetRoot),
    Idle_Sleeping: anim('Idle_Sleeping', 4, 560, assetRoot),
    Walk_Right: anim('Walk_Right', 8, 180, assetRoot),
    Walk_Left: anim('Walk_Left', 8, 180, assetRoot),
    Expedition_Return: anim('Expedition_Return', 4, 220, assetRoot),
    Think: anim('Think', 6, 420, assetRoot),
    Work_Focus: anim('Work_Focus', 4, 220, assetRoot),
    Expedition_Present: anim('Expedition_Present', 8, 260, assetRoot),
    Talk_Neutral: anim('Talk_Neutral', 6, 280, assetRoot),
    Talk_Happy: anim('Talk_Happy', 4, 300, assetRoot),
    Expedition_Prepare: anim('Expedition_Prepare', 4, 300, assetRoot),
    Expedition_Leave: anim('Expedition_Leave', 4, 320, assetRoot),
    Listening: anim('Listening', 4, 360, assetRoot),
  } as const satisfies Record<string, CompanionAnimationConfig>;
}

export const companionAnimations = createCompanionAnimations();

export type AnimationName = keyof typeof companionAnimations;
