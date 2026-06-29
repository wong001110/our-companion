import type { CompanionAnimationName } from '../companion/runtime/animationRegistry';

export type AnimationIntent = CompanionAnimationName;

type AnimationCategory = 'presence' | 'interaction' | 'conversation' | 'thinking' | 'movement' | 'activity' | 'relaxation';

const INTENT_TO_CATEGORY: Record<CompanionAnimationName, AnimationCategory> = {
  Idle_Neutral: 'presence',
  Idle_Breathe: 'presence',
  Idle_Sleepy: 'presence',
  Idle_Sleeping: 'presence',
  Listening: 'interaction',
  Waiting_Response: 'interaction',
  Drag_Hold: 'interaction',
  Drag_Release: 'interaction',
  Talk_Neutral: 'conversation',
  Talk_Happy: 'conversation',
  Talk_Thinking: 'conversation',
  Talk_Concerned: 'conversation',
  Think: 'thinking',
  Walk_Left: 'movement',
  Walk_Right: 'movement',
  Walk_Up: 'movement',
  Walk_Down: 'movement',
  Walk_UpLeft: 'movement',
  Walk_UpRight: 'movement',
  Walk_DownLeft: 'movement',
  Walk_DownRight: 'movement',
  Enter: 'movement',
  Leave: 'movement',
  Expedition_Prepare: 'activity',
  Expedition_Leave: 'activity',
  Expedition_Return: 'activity',
  Expedition_Present: 'activity',
  Work_Focus: 'activity',
  Music_Idle: 'relaxation',
};

export const CATEGORY_FALLBACKS: Record<AnimationCategory, CompanionAnimationName[]> = {
  presence: ['Idle_Neutral', 'Idle_Breathe'],
  interaction: ['Idle_Neutral'],
  conversation: ['Talk_Neutral', 'Idle_Neutral'],
  thinking: ['Think', 'Idle_Neutral'],
  movement: ['Walk_Right', 'Idle_Neutral'],
  activity: ['Think', 'Idle_Neutral'],
  relaxation: ['Idle_Neutral'],
};

export function categorizeIntent(intent: CompanionAnimationName): AnimationCategory {
  return INTENT_TO_CATEGORY[intent] ?? 'presence';
}

export const FALLBACK_CLIP: CompanionAnimationName = 'Idle_Neutral';
