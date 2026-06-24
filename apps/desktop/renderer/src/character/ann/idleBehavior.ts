import type { CharacterRuntimeState } from '@our-companion/shared';
import type { AnimationName } from './animationConfig';

export type IdleAnimationName = Extract<AnimationName, 'idle_laptop' | 'idle_notes' | 'idle_coffee' | 'idle_tired'>;

const idleAnimationWeights: Array<{ animation: IdleAnimationName; weight: number }> = [
  { animation: 'idle_laptop', weight: 45 },
  { animation: 'idle_notes', weight: 25 },
  { animation: 'idle_coffee', weight: 20 },
  { animation: 'idle_tired', weight: 10 }
];

export function isIdleState(state?: Pick<CharacterRuntimeState, 'coreState' | 'intent'>): boolean {
  return !state || (state.coreState === 'idle' && state.intent === 'waiting');
}

export function selectWeightedIdleAnimation(random = Math.random): IdleAnimationName {
  const roll = clamp01(random()) * 100;
  let cursor = 0;

  for (const item of idleAnimationWeights) {
    cursor += item.weight;
    if (roll < cursor) return item.animation;
  }

  return 'idle_laptop';
}

export function getIdleRotationDelay(random = Math.random): number {
  return 12000 + clamp01(random()) * 13000;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
