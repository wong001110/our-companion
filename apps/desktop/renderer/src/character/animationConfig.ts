import type { SpriteSheetConfig } from './SpriteAnimator';
import { AssetResolver } from './AssetResolver';
import { COMPANION_ANIMATION_MANIFEST_BY_NAME, type CompanionAnimationName } from '@our-companion/shared';

export interface CompanionAnimationConfig extends SpriteSheetConfig {
  name: CompanionAnimationName;
}

const DEFAULT_FRAME_WIDTH = 300;
const DEFAULT_FRAME_HEIGHT = 300;

function anim(name: CompanionAnimationName, assetRoot: string, frameWidth = DEFAULT_FRAME_WIDTH, frameHeight = DEFAULT_FRAME_HEIGHT): CompanionAnimationConfig {
  const resolver = new AssetResolver(assetRoot);
  const definition = COMPANION_ANIMATION_MANIFEST_BY_NAME[name];
  return {
    name,
    sheet: resolver.animation(name),
    frameWidth,
    frameHeight,
    frameMs: definition.frameDurationMs,
    loop: definition.loop,
  };
}

export function createCompanionAnimations(assetRoot: string) {
  return {
    Idle_Neutral: anim('Idle_Neutral', assetRoot), Idle_Breathe: anim('Idle_Breathe', assetRoot), Idle_Sleepy: anim('Idle_Sleepy', assetRoot), Idle_Sleeping: anim('Idle_Sleeping', assetRoot), Walk_Right: anim('Walk_Right', assetRoot), Walk_Left: anim('Walk_Left', assetRoot), Walk_Up: anim('Walk_Up', assetRoot), Walk_Down: anim('Walk_Down', assetRoot), Walk_UpLeft: anim('Walk_UpLeft', assetRoot), Walk_UpRight: anim('Walk_UpRight', assetRoot), Walk_DownLeft: anim('Walk_DownLeft', assetRoot), Walk_DownRight: anim('Walk_DownRight', assetRoot), Enter: anim('Enter', assetRoot), Leave: anim('Leave', assetRoot), Expedition_Return: anim('Expedition_Return', assetRoot), Think: anim('Think', assetRoot), Work_Focus: anim('Work_Focus', assetRoot), Expedition_Present: anim('Expedition_Present', assetRoot), Talk_Neutral: anim('Talk_Neutral', assetRoot), Talk_Happy: anim('Talk_Happy', assetRoot), Talk_Thinking: anim('Talk_Thinking', assetRoot), Talk_Concerned: anim('Talk_Concerned', assetRoot), Expedition_Prepare: anim('Expedition_Prepare', assetRoot), Expedition_Leave: anim('Expedition_Leave', assetRoot), Listening: anim('Listening', assetRoot), Waiting_Response: anim('Waiting_Response', assetRoot), Drag_Hold: anim('Drag_Hold', assetRoot), Drag_Release: anim('Drag_Release', assetRoot), Music_Idle: anim('Music_Idle', assetRoot),
  } as const satisfies Record<string, CompanionAnimationConfig>;
}

export type AnimationName = keyof ReturnType<typeof createCompanionAnimations>;
