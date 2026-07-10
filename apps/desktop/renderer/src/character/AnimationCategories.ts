/**
 * Re-exports from the canonical animation registry.
 * Do not duplicate category metadata here.
 */
import {
  ANIMATION_REGISTRY,
  type AnimationCategory,
  type CompanionAnimationName,
  getAnimationFallback,
} from '../companion/runtime/animationRegistry';

export type { AnimationCategory, CompanionAnimationName };
export type AnimationIntent = CompanionAnimationName;

export function categorizeIntent(intent: CompanionAnimationName): AnimationCategory {
  return ANIMATION_REGISTRY[intent]?.category ?? 'presence';
}

export const CATEGORY_FALLBACKS: Record<AnimationCategory, CompanionAnimationName[]> = {
  presence: ['Idle_Neutral', 'Idle_Breathe'],
  interaction: ['Idle_Neutral', 'Listening'],
  conversation: ['Talk_Neutral', 'Idle_Neutral'],
  thinking: ['Think', 'Idle_Neutral'],
  movement: ['Walk_Right', 'Idle_Neutral'],
  activity: ['Think', 'Idle_Neutral'],
  relaxation: ['Music_Idle', 'Idle_Neutral'],
};

export const FALLBACK_CLIP: CompanionAnimationName = 'Idle_Neutral';

export { getAnimationFallback, ANIMATION_REGISTRY };
