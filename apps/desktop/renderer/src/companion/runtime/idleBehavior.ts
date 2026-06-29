import type { CharacterRuntimeState, CompanionPersonality } from '@our-companion/shared';
import type { CompanionAnimationName } from './animationRegistry';

export type IdleAnimationName = Extract<CompanionAnimationName, 'Idle_Neutral' | 'Idle_Breathe' | 'Idle_Sleepy' | 'Idle_Sleeping'>;

interface IdleWeight {
  animation: IdleAnimationName;
  baseWeight: number;
}

const idleAnimations: IdleWeight[] = [
  { animation: 'Idle_Neutral', baseWeight: 45 },
  { animation: 'Idle_Breathe', baseWeight: 25 },
  { animation: 'Idle_Sleepy', baseWeight: 20 },
  { animation: 'Idle_Sleeping', baseWeight: 10 }
];

export function isIdleState(state?: Pick<CharacterRuntimeState, 'coreState' | 'intent'>): boolean {
  return !state || (state.coreState === 'idle' && state.intent === 'waiting');
}

export function selectWeightedIdleAnimation(
  random = Math.random,
  personality?: CompanionPersonality
): IdleAnimationName {
  const weights = personality
    ? idleAnimations.map((item) => ({
        animation: item.animation,
        weight: applyPersonalityWeight(item, personality)
      }))
    : idleAnimations.map((item) => ({
        animation: item.animation,
        weight: item.baseWeight
      }));

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  const roll = clamp01(random()) * totalWeight;
  let cursor = 0;

  for (const item of weights) {
    cursor += item.weight;
    if (roll < cursor) return item.animation;
  }

  return 'Idle_Neutral';
}

function applyPersonalityWeight(item: IdleWeight, personality: CompanionPersonality): number {
  let weight = item.baseWeight;
  const { energy, curiosity, shyness, diligence } = personality;

  switch (item.animation) {
    case 'Idle_Sleepy':
      weight += energy < 30 ? 20 : energy < 50 ? 10 : 0;
      weight += shyness > 70 ? 5 : 0;
      break;
    case 'Idle_Breathe':
      weight += curiosity > 60 ? 10 : 0;
      weight += diligence > 70 ? 8 : 0;
      break;
    case 'Idle_Sleeping':
      weight += energy < 40 ? 8 : 0;
      break;
    case 'Idle_Neutral':
      weight += diligence > 60 ? 10 : 0;
      break;
  }

  return Math.max(1, weight);
}

export function getIdleRotationDelay(random = Math.random, personality?: CompanionPersonality): number {
  const base = 12000 + clamp01(random()) * 13000;
  if (!personality) return base;
  const energyFactor = personality.energy < 30 ? 1.4 : personality.energy > 70 ? 0.7 : 1;
  return Math.round(base * energyFactor);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
