export type CompanionAnimationName =
  | 'Idle_Neutral'
  | 'Idle_Breathe'
  | 'Idle_Sleepy'
  | 'Idle_Sleeping'
  | 'Listening'
  | 'Waiting_Response'
  | 'Drag_Hold'
  | 'Drag_Release'
  | 'Talk_Neutral'
  | 'Talk_Happy'
  | 'Talk_Thinking'
  | 'Talk_Concerned'
  | 'Think'
  | 'Walk_Left'
  | 'Walk_Right'
  | 'Walk_Up'
  | 'Walk_Down'
  | 'Walk_UpLeft'
  | 'Walk_UpRight'
  | 'Walk_DownLeft'
  | 'Walk_DownRight'
  | 'Enter'
  | 'Leave'
  | 'Expedition_Prepare'
  | 'Expedition_Leave'
  | 'Expedition_Return'
  | 'Expedition_Present'
  | 'Work_Focus'
  | 'Music_Idle';

export type AnimationCategory =
  | 'presence'
  | 'interaction'
  | 'conversation'
  | 'thinking'
  | 'movement'
  | 'activity'
  | 'relaxation';

export interface CompanionAnimationDefinition {
  name: CompanionAnimationName;
  category: AnimationCategory;
  purpose: string;
  loop: boolean;
  priority: number;
  interruptible: boolean;
  fallback: CompanionAnimationName;
}

export const ANIMATION_REGISTRY: Record<CompanionAnimationName, CompanionAnimationDefinition> = {
  Idle_Neutral: {
    name: 'Idle_Neutral',
    category: 'presence',
    purpose: 'Default idle state when companion is not doing anything else',
    loop: true,
    priority: 0,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Idle_Breathe: {
    name: 'Idle_Breathe',
    category: 'presence',
    purpose: 'Subtle living presence when companion is idle',
    loop: true,
    priority: 0,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Idle_Sleepy: {
    name: 'Idle_Sleepy',
    category: 'presence',
    purpose: 'Low energy state after longer inactive periods',
    loop: true,
    priority: 0,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Idle_Sleeping: {
    name: 'Idle_Sleeping',
    category: 'presence',
    purpose: 'Deep sleep state after extended inactivity',
    loop: true,
    priority: 0,
    interruptible: true,
    fallback: 'Idle_Sleepy',
  },
  Listening: {
    name: 'Listening',
    category: 'interaction',
    purpose: 'Listening to user voice input',
    loop: true,
    priority: 2,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Waiting_Response: {
    name: 'Waiting_Response',
    category: 'interaction',
    purpose: 'Waiting for user response after speaking',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Drag_Hold: {
    name: 'Drag_Hold',
    category: 'interaction',
    purpose: 'Being dragged by user',
    loop: true,
    priority: 3,
    interruptible: false,
    fallback: 'Idle_Neutral',
  },
  Drag_Release: {
    name: 'Drag_Release',
    category: 'interaction',
    purpose: 'Released after being dragged',
    loop: false,
    priority: 2,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Talk_Neutral: {
    name: 'Talk_Neutral',
    category: 'conversation',
    purpose: 'Neutral conversation state',
    loop: true,
    priority: 2,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Talk_Happy: {
    name: 'Talk_Happy',
    category: 'conversation',
    purpose: 'Happy or excited conversation',
    loop: true,
    priority: 2,
    interruptible: true,
    fallback: 'Talk_Neutral',
  },
  Talk_Thinking: {
    name: 'Talk_Thinking',
    category: 'conversation',
    purpose: 'Thinking while speaking',
    loop: true,
    priority: 2,
    interruptible: true,
    fallback: 'Talk_Neutral',
  },
  Talk_Concerned: {
    name: 'Talk_Concerned',
    category: 'conversation',
    purpose: 'Concerned or serious conversation',
    loop: true,
    priority: 2,
    interruptible: true,
    fallback: 'Talk_Neutral',
  },
  Think: {
    name: 'Think',
    category: 'thinking',
    purpose: 'Reasoning, internal processing, loading, waiting for AI response',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Walk_Left: {
    name: 'Walk_Left',
    category: 'movement',
    purpose: 'Walking left (walk-in-place)',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Walk_Right: {
    name: 'Walk_Right',
    category: 'movement',
    purpose: 'Walking right (walk-in-place)',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Walk_Up: {
    name: 'Walk_Up',
    category: 'movement',
    purpose: 'Walking up (walk-in-place)',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Walk_Down: {
    name: 'Walk_Down',
    category: 'movement',
    purpose: 'Walking down (walk-in-place)',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
  Walk_UpLeft: {
    name: 'Walk_UpLeft',
    category: 'movement',
    purpose: 'Walking up-left (walk-in-place)',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Walk_Left',
  },
  Walk_UpRight: {
    name: 'Walk_UpRight',
    category: 'movement',
    purpose: 'Walking up-right (walk-in-place)',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Walk_Right',
  },
  Walk_DownLeft: {
    name: 'Walk_DownLeft',
    category: 'movement',
    purpose: 'Walking down-left (walk-in-place)',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Walk_Left',
  },
  Walk_DownRight: {
    name: 'Walk_DownRight',
    category: 'movement',
    purpose: 'Walking down-right (walk-in-place)',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Walk_Right',
  },
  Enter: {
    name: 'Enter',
    category: 'movement',
    purpose: 'Entering the desktop scene',
    loop: false,
    priority: 2,
    interruptible: false,
    fallback: 'Walk_Right',
  },
  Leave: {
    name: 'Leave',
    category: 'movement',
    purpose: 'Leaving the desktop scene',
    loop: false,
    priority: 2,
    interruptible: false,
    fallback: 'Walk_Left',
  },
  Expedition_Prepare: {
    name: 'Expedition_Prepare',
    category: 'activity',
    purpose: 'Preparing for discovery expedition',
    loop: false,
    priority: 1,
    interruptible: true,
    fallback: 'Think',
  },
  Expedition_Leave: {
    name: 'Expedition_Leave',
    category: 'activity',
    purpose: 'Leaving for discovery expedition',
    loop: false,
    priority: 1,
    interruptible: false,
    fallback: 'Leave',
  },
  Expedition_Return: {
    name: 'Expedition_Return',
    category: 'activity',
    purpose: 'Returning from discovery expedition',
    loop: false,
    priority: 1,
    interruptible: false,
    fallback: 'Enter',
  },
  Expedition_Present: {
    name: 'Expedition_Present',
    category: 'activity',
    purpose: 'Presenting discovery findings to user',
    loop: true,
    priority: 2,
    interruptible: true,
    fallback: 'Talk_Happy',
  },
  Work_Focus: {
    name: 'Work_Focus',
    category: 'activity',
    purpose: 'Focused on performing a task',
    loop: true,
    priority: 1,
    interruptible: true,
    fallback: 'Think',
  },
  Music_Idle: {
    name: 'Music_Idle',
    category: 'relaxation',
    purpose: 'Relaxed music-listening state',
    loop: true,
    priority: 0,
    interruptible: true,
    fallback: 'Idle_Neutral',
  },
};

export function getAnimationDefinition(name: CompanionAnimationName): CompanionAnimationDefinition {
  return ANIMATION_REGISTRY[name];
}

export function getAnimationFallback(name: CompanionAnimationName): CompanionAnimationName {
  return ANIMATION_REGISTRY[name].fallback;
}

export function getAnimationsByCategory(category: AnimationCategory): CompanionAnimationName[] {
  return Object.values(ANIMATION_REGISTRY)
    .filter((def) => def.category === category)
    .map((def) => def.name);
}
