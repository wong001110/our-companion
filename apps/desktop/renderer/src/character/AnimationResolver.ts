import type { CompanionPersonality } from '@our-companion/shared';
import type { AnimationIntent } from './AnimationCategories';
import { categorizeIntent, CATEGORY_FALLBACKS, FALLBACK_CLIP } from './AnimationCategories';

export interface AnimationRequest {
  intent: AnimationIntent;
  personality?: CompanionPersonality;
}

export interface AnimationResolution {
  clip: string;
  intent: AnimationIntent;
  usedFallback: boolean;
  fallbackChain: string[];
}

export function resolveAnimation(
  request: AnimationRequest,
  availableClips: string[]
): AnimationResolution {
  const { intent, personality } = request;
  const fallbackChain: string[] = [];

  let resolvedIntent = intent;

  if (intent === 'idle' && personality) {
    resolvedIntent = personalityModifyIdle(personality);
  }

  if (availableClips.includes(resolvedIntent)) {
    return { clip: resolvedIntent, intent: resolvedIntent, usedFallback: false, fallbackChain };
  }

  fallbackChain.push(resolvedIntent);

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

function personalityModifyIdle(personality: CompanionPersonality): AnimationIntent {
  const { energy, curiosity, shyness } = personality;

  if (energy < 20) return 'idle_sleepy';
  if (energy < 35 && shyness > 60) return 'idle_sleepy';
  if (curiosity > 70) return 'idle_breathe';

  return 'idle';
}

export function getAvailableClipNames(animations: Record<string, unknown>): string[] {
  return Object.keys(animations);
}
