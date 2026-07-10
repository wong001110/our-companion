import type { AnimationIntent, CompanionLifeActivity, CompanionSessionPhase } from '@our-companion/shared';

export const ANIMATION_FALLBACK = 'Idle_Neutral';

export interface AnimationResolution {
  assetKey: string;
  usedFallback: boolean;
  fallbackReason?: string;
}

export function resolveAnimationIntent(intent: AnimationIntent): AnimationResolution {
  const key = mapIntentToAsset(intent);
  if (key) return { assetKey: key, usedFallback: false };

  const fallbackKey = categoryFallback(intent.category);
  return {
    assetKey: fallbackKey,
    usedFallback: true,
    fallbackReason: `no mapping for ${intent.category}${intent.variant ? `/${intent.variant}` : ''}${intent.emotion ? `/${intent.emotion}` : ''}`
  };
}

function mapIntentToAsset(intent: AnimationIntent): string | undefined {
  const { category, variant, emotion } = intent;

  if (category === 'idle') {
    if (variant === 'sleeping') return 'Idle_Sleeping';
    if (variant === 'sleepy') return 'Idle_Sleepy';
    if (variant === 'breathe') return 'Idle_Breathe';
    return 'Idle_Neutral';
  }
  if (category === 'talk') {
    if (emotion === 'happy') return 'Talk_Happy';
    if (emotion === 'thinking' || emotion === 'think') return 'Talk_Thinking';
    if (emotion === 'concerned') return 'Talk_Concerned';
    return 'Talk_Neutral';
  }
  if (category === 'listen') return 'Listening';
  if (category === 'think') return 'Talk_Thinking';
  if (category === 'walk') return 'Walk_Right';
  if (category === 'expedition') {
    if (variant === 'return') return 'Expedition_Return';
    if (variant === 'prepare') return 'Expedition_Prepare';
    return 'Expedition_Present';
  }
  if (category === 'work') return 'Work_Focus';
  if (category === 'music') return 'Music_Idle';
  return undefined;
}

function categoryFallback(category: AnimationIntent['category']): string {
  const map: Partial<Record<AnimationIntent['category'], string>> = {
    idle: 'Idle_Neutral',
    talk: 'Talk_Neutral',
    listen: 'Listening',
    think: 'Talk_Thinking',
    walk: 'Walk_Right',
    expedition: 'Expedition_Present',
    work: 'Work_Focus',
    music: 'Music_Idle'
  };
  return map[category] ?? ANIMATION_FALLBACK;
}

export function animationIntentForLifeActivity(activity: CompanionLifeActivity): AnimationIntent {
  const map: Record<CompanionLifeActivity, AnimationIntent> = {
    idle: { category: 'idle' },
    resting: { category: 'idle', variant: 'breathe' },
    sleeping: { category: 'idle', variant: 'sleeping' },
    working: { category: 'work' },
    listening_music: { category: 'music' },
    thinking: { category: 'think' },
    exploring: { category: 'expedition', variant: 'prepare' },
    returning: { category: 'expedition', variant: 'return' },
    waiting: { category: 'listen' },
    interacting: { category: 'listen' }
  };
  return map[activity] ?? { category: 'idle' };
}

export function animationIntentForSessionPhase(phase: CompanionSessionPhase): AnimationIntent | null {
  if (phase === 'listening') return { category: 'listen' };
  if (phase === 'thinking') return { category: 'think' };
  if (phase === 'talking' || phase === 'responding') return { category: 'talk', emotion: 'neutral' };
  return null;
}

export function resolveToAssetKey(intent: AnimationIntent): string {
  return resolveAnimationIntent(intent).assetKey;
}
