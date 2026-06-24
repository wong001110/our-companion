import type {
  CharacterRuntimeState,
  CoreState,
  EmotionName,
  EmotionState,
  Intent,
  NormalizedDiscovery
} from '@our-companion/shared';
import { DEFAULT_CHARACTER_ID, nowIso } from '@our-companion/shared';

export const neutralEmotion: EmotionState = {
  neutral: 70,
  curious: 35,
  happy: 20,
  excited: 0,
  shy: 45,
  confused: 0,
  focused: 50,
  tired: 10,
  proud: 0,
  concerned: 0
};

export function createInitialCharacterState(characterId = DEFAULT_CHARACTER_ID): CharacterRuntimeState {
  return {
    characterId,
    coreState: 'idle',
    emotion: { ...neutralEmotion },
    intent: 'waiting',
    position: { x: 120, y: 320 },
    lastActivityAt: nowIso(),
    updatedAt: nowIso()
  };
}

export function dominantEmotion(emotion: EmotionState): EmotionName {
  return (Object.entries(emotion) as Array<[EmotionName, number]>).reduce((best, current) =>
    current[1] > best[1] ? current : best
  )[0];
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function decayEmotion(emotion: EmotionState, date = new Date()): EmotionState {
  const lateHour = date.getHours() >= 23 || date.getHours() < 5;
  return {
    neutral: clamp(emotion.neutral),
    excited: clamp(emotion.excited * 0.9),
    happy: clamp(emotion.happy * 0.95),
    proud: clamp(emotion.proud * 0.95),
    curious: clamp(emotion.curious * 0.97),
    shy: clamp(emotion.shy * 0.98),
    confused: clamp(emotion.confused * 0.94),
    focused: clamp(emotion.focused * 0.96),
    tired: clamp(lateHour ? emotion.tired + 10 : emotion.tired * 0.99),
    concerned: clamp(emotion.concerned * 0.9)
  };
}

export type EmotionEvent =
  | 'user_accepts_discovery'
  | 'user_rejects_discovery'
  | 'ignored_multiple_discoveries'
  | 'new_high_score_discovery'
  | 'task_success'
  | 'task_failure'
  | 'late_night'
  | 'expertise_topic_match';

export function applyEmotionEvent(emotion: EmotionState, event: EmotionEvent): EmotionState {
  const next = { ...emotion };
  const add = (name: EmotionName, amount: number) => {
    next[name] = clamp(next[name] + amount);
  };

  switch (event) {
    case 'user_accepts_discovery':
      add('happy', 12);
      add('proud', 10);
      add('shy', -4);
      break;
    case 'user_rejects_discovery':
      add('shy', 5);
      add('curious', -3);
      break;
    case 'ignored_multiple_discoveries':
      add('shy', 8);
      break;
    case 'new_high_score_discovery':
      add('curious', 15);
      add('excited', 8);
      break;
    case 'task_success':
      add('proud', 8);
      add('happy', 6);
      break;
    case 'task_failure':
      add('confused', 10);
      add('concerned', 8);
      break;
    case 'late_night':
      add('tired', 10);
      break;
    case 'expertise_topic_match':
      add('curious', 8);
      add('focused', 8);
      break;
  }

  return next;
}

export interface IntentContext {
  userCommand?: string;
  pendingTasks?: number;
  availableDiscoveries?: NormalizedDiscovery[];
  recentMemoryActivity?: boolean;
  reflectionDue?: boolean;
  userActive?: boolean;
  relationshipBond?: number;
  date?: Date;
}

export function selectIntent(state: CharacterRuntimeState, context: IntentContext): Intent {
  if (context.userCommand || (context.pendingTasks ?? 0) > 0) return 'helping_task';
  if ((context.availableDiscoveries?.length ?? 0) > 0) return 'sharing_discovery';
  if (context.recentMemoryActivity) return 'reviewing_memory';
  if (context.reflectionDue) return 'reflecting_journey';
  if (!context.userActive && dominantEmotion(state.emotion) === 'tired') return 'waiting';
  if (!context.userActive && state.emotion.curious > 50) return 'wandering';
  return 'organizing_backpack';
}

export function transitionState(current: CoreState, intent: Intent, emotion: EmotionName): CoreState {
  if (intent === 'helping_task') {
    if (current === 'thinking') return 'executing';
    if (current === 'executing') return 'returning';
    if (current === 'returning') return 'talking';
    if (current === 'talking') return 'idle';
    return 'thinking';
  }

  if (intent === 'sharing_discovery') {
    if (current === 'thinking') return 'discovering';
    if (current === 'discovering') return 'talking';
    if (current === 'talking') return 'idle';
    return 'thinking';
  }

  if (intent === 'reviewing_memory' || intent === 'reflecting_journey') return 'thinking';
  if (intent === 'organizing_backpack') return current === 'organizing_backpack' ? 'idle' : 'organizing_backpack';
  if (emotion === 'tired') return current === 'sleeping' ? 'idle' : 'sleeping';
  if (current === 'idle') return 'walking';
  if (current === 'walking') return 'observing';
  if (current === 'observing') return 'thinking';
  return 'idle';
}

export function animationFor(intent: Intent, state: CoreState, emotion: EmotionName, availableAnimations: string[]): string {
  const variants: string[] = [];

  if (intent === 'wandering' && emotion === 'tired') variants.push('walk_tired', 'sleep');
  if (intent === 'wandering' && emotion === 'excited') variants.push('walk_excited');
  if (intent === 'sharing_discovery' && emotion === 'shy') variants.push('discover_shy');
  if (intent === 'sharing_discovery' && emotion === 'excited') variants.push('discover_excited');
  if (state === 'talking' && emotion === 'happy') variants.push('talk_happy');
  if (state === 'talking' && emotion === 'confused') variants.push('talk_confused');
  if (state === 'executing' && emotion === 'focused') variants.push('task_start');
  if (state === 'returning' && emotion === 'proud') variants.push('task_success');
  if (state === 'returning' && emotion === 'confused') variants.push('task_fail');

  const baseByState: Record<CoreState, string> = {
    idle: 'idle',
    walking: 'walk',
    sleeping: 'sleep',
    observing: 'observe',
    thinking: 'think',
    discovering: 'discover',
    talking: 'talk',
    listening: 'think',
    executing: 'task_start',
    returning: 'return',
    organizing_backpack: 'organize_backpack'
  };

  variants.push(baseByState[state], 'idle');
  return variants.find((name) => availableAnimations.includes(name)) ?? 'idle';
}

export function advanceCharacter(state: CharacterRuntimeState, context: IntentContext): CharacterRuntimeState {
  const emotion = decayEmotion(state.emotion, context.date);
  const nextIntent = selectIntent({ ...state, emotion }, context);
  const nextEmotion = dominantEmotion(emotion);
  return {
    ...state,
    emotion,
    intent: nextIntent,
    coreState: transitionState(state.coreState, nextIntent, nextEmotion),
    updatedAt: nowIso()
  };
}

export { getDiscoveryFetchDelay, getDiscoveryFetchDelayRange, DISCOVERY_STARTUP_DELAY_MS } from './discoveryTiming';
