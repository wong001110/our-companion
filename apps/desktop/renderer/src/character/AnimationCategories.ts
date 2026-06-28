export type AnimationIntent =
  | 'idle' | 'idle_sleepy' | 'idle_sleeping' | 'idle_breathe'
  | 'walk_left' | 'walk_right' | 'walk_up' | 'walk_down'
  | 'enter' | 'leave'
  | 'talk_neutral' | 'talk_thinking' | 'think' | 'work_focus'
  | 'expedition_prepare' | 'expedition_leave' | 'expedition_return' | 'expedition_present'
  | 'discovery' | 'task_success' | 'task_failed';

type AnimationCategory = 'idle' | 'walk' | 'talk' | 'expedition' | 'thinking' | 'misc';

const INTENT_TO_CATEGORY: Record<AnimationIntent, AnimationCategory> = {
  idle: 'idle',
  idle_sleepy: 'idle',
  idle_sleeping: 'idle',
  idle_breathe: 'idle',
  walk_left: 'walk',
  walk_right: 'walk',
  walk_up: 'walk',
  walk_down: 'walk',
  enter: 'misc',
  leave: 'misc',
  talk_neutral: 'talk',
  talk_thinking: 'talk',
  think: 'thinking',
  work_focus: 'thinking',
  expedition_prepare: 'expedition',
  expedition_leave: 'expedition',
  expedition_return: 'expedition',
  expedition_present: 'expedition',
  discovery: 'misc',
  task_success: 'misc',
  task_failed: 'misc'
};

export const CATEGORY_FALLBACKS: Record<AnimationCategory, string[]> = {
  idle: ['idle_laptop', 'idle_coffee'],
  walk: ['walk', 'idle_laptop'],
  talk: ['talk', 'idle_laptop'],
  expedition: ['task_start', 'think', 'idle_laptop'],
  thinking: ['think', 'idle_laptop'],
  misc: ['idle_laptop']
};

export function categorizeIntent(intent: AnimationIntent): AnimationCategory {
  return INTENT_TO_CATEGORY[intent] ?? 'misc';
}

export const FALLBACK_CLIP = 'idle_coffee';
