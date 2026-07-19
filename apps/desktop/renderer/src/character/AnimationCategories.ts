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

export const FALLBACK_CLIP: CompanionAnimationName = 'Idle_Neutral';

export { getAnimationFallback, ANIMATION_REGISTRY };
