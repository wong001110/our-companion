import type { CompanionPersonality } from '@our-companion/shared';
import type { CompanionAnimationName } from '../companion/runtime/animationRegistry';
import { ANIMATION_REGISTRY, getAnimationFallback } from '../companion/runtime/animationRegistry';
import { categorizeIntent, CATEGORY_FALLBACKS, FALLBACK_CLIP } from './AnimationCategories';

export interface AnimationRequest {
  intent: CompanionAnimationName;
  personality?: CompanionPersonality;
}

export interface AnimationResolution {
  clip: CompanionAnimationName;
  intent: CompanionAnimationName;
  usedFallback: boolean;
  fallbackChain: CompanionAnimationName[];
}

export function resolveAnimation(
  request: AnimationRequest,
  availableClips: string[]
): AnimationResolution {
  const { intent, personality } = request;
  const fallbackChain: CompanionAnimationName[] = [];

  let resolvedIntent = intent;

  if (intent === 'Idle_Neutral' && personality) {
    resolvedIntent = personalityModifyIdle(personality);
  }

  if (availableClips.includes(resolvedIntent)) {
    return { clip: resolvedIntent, intent: resolvedIntent, usedFallback: false, fallbackChain };
  }

  fallbackChain.push(resolvedIntent);

  const registryFallback = getAnimationFallback(resolvedIntent);
  if (availableClips.includes(registryFallback)) {
    fallbackChain.push(registryFallback);
    return { clip: registryFallback, intent: resolvedIntent, usedFallback: true, fallbackChain };
  }

  const category = categorizeIntent(resolvedIntent);
  const categoryFallbacks = CATEGORY_FALLBACKS[category];

  for (const fallback of categoryFallbacks) {
    fallbackChain.push(fallback);
    if (availableClips.includes(fallback)) {
      return { clip: fallback, intent: resolvedIntent, usedFallback: true, fallbackChain };
    }
  }

  fallbackChain.push(FALLBACK_CLIP);
  return { clip: FALLBACK_CLIP, intent: resolvedIntent, usedFallback: true, fallbackChain };
}

function personalityModifyIdle(personality: CompanionPersonality): CompanionAnimationName {
  const { energy, curiosity, shyness } = personality;

  if (energy < 20) return 'Idle_Sleepy';
  if (energy < 35 && shyness > 60) return 'Idle_Sleepy';
  if (curiosity > 70) return 'Idle_Breathe';

  return 'Idle_Neutral';
}

export function getAvailableClipNames(animations: Record<string, unknown>): string[] {
  return Object.keys(animations);
}
