import {
  COMPANION_ANIMATION_MANIFEST,
  type CompanionAnimationCategory,
  type CompanionAnimationName,
} from '@our-companion/shared';

export type { CompanionAnimationName } from '@our-companion/shared';
export type AnimationCategory = CompanionAnimationCategory;

export interface CompanionAnimationDefinition {
  name: CompanionAnimationName;
  category: AnimationCategory;
  purpose: string;
  loop: boolean;
  priority: number;
  interruptible: boolean;
  fallback: CompanionAnimationName;
}

/**
 * Runtime presentation of the shared animation manifest. Names, timing,
 * interruptibility, and fallback behavior must be authored in shared only.
 */
export const ANIMATION_REGISTRY: Readonly<Record<CompanionAnimationName, CompanionAnimationDefinition>> =
  Object.fromEntries(COMPANION_ANIMATION_MANIFEST.map((entry) => [entry.key, {
    name: entry.key,
    category: entry.category,
    purpose: entry.purpose,
    loop: entry.loop,
    priority: entry.priority,
    interruptible: entry.interruptible,
    fallback: entry.fallback,
  }])) as Record<CompanionAnimationName, CompanionAnimationDefinition>;

export function getAnimationDefinition(name: CompanionAnimationName): CompanionAnimationDefinition {
  return ANIMATION_REGISTRY[name];
}

export function getAnimationFallback(name: CompanionAnimationName): CompanionAnimationName {
  return ANIMATION_REGISTRY[name].fallback;
}

export function getAnimationsByCategory(category: AnimationCategory): CompanionAnimationName[] {
  return COMPANION_ANIMATION_MANIFEST
    .filter((definition) => definition.category === category)
    .map((definition) => definition.key);
}
