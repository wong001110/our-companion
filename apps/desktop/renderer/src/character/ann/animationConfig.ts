import type { SpriteSheetConfig } from '../SpriteAnimator';
import { AssetResolver, DEFAULT_ASSET_ROOT } from '../AssetResolver';
import type { CompanionAnimationName } from '../../companion/runtime/animationRegistry';

export interface CompanionAnimationConfig extends SpriteSheetConfig {
  name: CompanionAnimationName;
}

const DEFAULT_FRAME_WIDTH = 300;
const DEFAULT_FRAME_HEIGHT = 300;

function anim(name: CompanionAnimationName, frameMs: number, assetRoot: string, frameWidth = DEFAULT_FRAME_WIDTH, frameHeight = DEFAULT_FRAME_HEIGHT): CompanionAnimationConfig {
  const resolver = new AssetResolver(assetRoot);
  return {
    name,
    sheet: resolver.animation(name),
    frameWidth,
    frameHeight,
    frameMs,
  };
}

export function createCompanionAnimations(assetRoot: string = DEFAULT_ASSET_ROOT) {
  return {
    Idle_Neutral: anim('Idle_Neutral', 520, assetRoot),
    Idle_Breathe: anim('Idle_Breathe', 620, assetRoot),
    Idle_Sleepy: anim('Idle_Sleepy', 520, assetRoot),
    Idle_Sleeping: anim('Idle_Sleeping', 560, assetRoot),
    Walk_Right: anim('Walk_Right', 180, assetRoot),
    Walk_Left: anim('Walk_Left', 180, assetRoot),
    Expedition_Return: anim('Expedition_Return', 220, assetRoot),
    Think: anim('Think', 420, assetRoot),
    Work_Focus: anim('Work_Focus', 220, assetRoot),
    Expedition_Present: anim('Expedition_Present', 260, assetRoot),
    Talk_Neutral: anim('Talk_Neutral', 280, assetRoot),
    Talk_Happy: anim('Talk_Happy', 300, assetRoot),
    Expedition_Prepare: anim('Expedition_Prepare', 300, assetRoot),
    Expedition_Leave: anim('Expedition_Leave', 320, assetRoot),
    Listening: anim('Listening', 360, assetRoot),
  } as const satisfies Record<string, CompanionAnimationConfig>;
}

export const companionAnimations = createCompanionAnimations();

export type AnimationName = keyof typeof companionAnimations;
