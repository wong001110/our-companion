import type { CharacterRuntimeState, CompanionAnimationName, EmotionState } from '@our-companion/shared';
import { COMPANION_ANIMATION_NAMES } from '@our-companion/shared';
import { ANIMATION_REGISTRY } from '../companion/runtime/animationRegistry';

export type AnimationSource = 'drag' | 'performance' | 'session' | 'movement' | 'runtime' | 'life' | 'interaction' | 'idle';
export interface ResolvedCompanionAnimation {
  name: CompanionAnimationName;
  source: AnimationSource;
  priority: number;
  oneShot: boolean;
  fallbackChain: CompanionAnimationName[];
}

export function isCompanionAnimationName(value: unknown): value is CompanionAnimationName {
  return typeof value === 'string' && (COMPANION_ANIMATION_NAMES as readonly string[]).includes(value);
}

export function resolveWalkDirection(dx: number, dy: number, deadZone = 6): CompanionAnimationName | null {
  if (Math.hypot(dx, dy) < deadZone) return null;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ['Walk_Right', 'Walk_DownRight', 'Walk_Down', 'Walk_DownLeft', 'Walk_Left', 'Walk_UpLeft', 'Walk_Up', 'Walk_UpRight'][(sector + 8) % 8] as CompanionAnimationName;
}

export function resolveTalkAnimation(emotion?: EmotionState): CompanionAnimationName {
  if (emotion?.concerned && emotion.concerned > 60) return 'Talk_Concerned';
  if ((emotion?.focused ?? 0) > 60 || (emotion?.confused ?? 0) > 50) return 'Talk_Thinking';
  if ((emotion?.happy ?? 0) > 60 || (emotion?.excited ?? 0) > 60) return 'Talk_Happy';
  return 'Talk_Neutral';
}

export function resolveAnimationFallback(requested: CompanionAnimationName, available: ReadonlySet<CompanionAnimationName>): CompanionAnimationName {
  const attempted = new Set<CompanionAnimationName>();
  let current = requested;
  while (!attempted.has(current)) {
    attempted.add(current);
    if (available.has(current)) return current;
    current = ANIMATION_REGISTRY[current].fallback;
  }
  return 'Idle_Neutral';
}

export function resolveCompanionAnimation(input: {
  state?: CharacterRuntimeState;
  dragState?: 'idle' | 'dragging' | 'releasing';
  performanceAnimation?: CompanionAnimationName;
  movementAnimation?: CompanionAnimationName;
  idleAnimation?: CompanionAnimationName;
  userIsTyping?: boolean;
}): ResolvedCompanionAnimation {
  const candidate = (name: CompanionAnimationName, source: AnimationSource, priority: number): ResolvedCompanionAnimation => ({
    name, source, priority, oneShot: !ANIMATION_REGISTRY[name].loop, fallbackChain: [name, ANIMATION_REGISTRY[name].fallback, 'Idle_Neutral'],
  });
  if (input.dragState === 'dragging') return candidate('Drag_Hold', 'drag', 100);
  if (input.dragState === 'releasing') return candidate('Drag_Release', 'drag', 99);
  if (input.performanceAnimation) return candidate(input.performanceAnimation, 'performance', 80);
  const state = input.state;
  if (state?.coreState === 'talking') return candidate(resolveTalkAnimation(state.emotion), 'session', 70);
  if (state?.coreState === 'listening') return candidate('Listening', 'session', 70);
  if (state?.coreState === 'thinking') return candidate('Think', 'session', 70);
  if (input.movementAnimation) return candidate(input.movementAnimation, 'movement', 60);
  if (state?.coreState === 'walking') return candidate(isCompanionAnimationName(state.animationIntent) && state.animationIntent.startsWith('Walk_') ? state.animationIntent : 'Walk_Right', 'movement', 60);
  if (isCompanionAnimationName(state?.animationIntent)) return candidate(state.animationIntent, 'runtime', 50);
  const life = state?.lifeActivity;
  const lifeAnimation: Partial<Record<NonNullable<CharacterRuntimeState['lifeActivity']>, CompanionAnimationName>> = {
    resting: 'Idle_Breathe', sleeping: 'Idle_Sleeping', working: 'Work_Focus', listening_music: 'Music_Idle',
    thinking: 'Think', exploring: 'Expedition_Prepare', returning: 'Expedition_Return',
  };
  if (life && life !== 'idle' && lifeAnimation[life]) return candidate(lifeAnimation[life]!, 'life', 40);
  if (input.userIsTyping) return candidate('Waiting_Response', 'interaction', 30);
  return candidate(input.idleAnimation ?? 'Idle_Neutral', 'idle', 10);
}
