import type {
  CompanionBehaviorState,
} from './CompanionBehaviorTypes';
import { evaluateInterruption } from './InterruptionPolicy';

export interface CompanionBehaviorInput {
  now: number;
  hasDiscoveryCandidate: boolean;
  userIsTyping: boolean;
  panelOpen: boolean;
  activeConversation: boolean;
  recentDismissCount: number;
  recentIgnoreCount: number;
  state: CompanionBehaviorState;
  /** Display hint from main-process companion brain — sole decision source */
  displayHint?: string;
}

export type CompanionBehaviorDecision =
  | { type: 'stay_silent'; reason: string }
  | { type: 'ambient_reaction'; reason: string }
  | { type: 'show_soft_hint'; reason: string }
  | { type: 'present_discovery'; reason: string }
  | { type: 'start_conversation'; reason: string }
  | { type: 'suggest_next_action'; reason: string };

/**
 * Applies main-process brain display hints with local interruption gating only.
 * The renderer does not make independent high-level behavior decisions.
 */
export function applyBehaviorHint(input: CompanionBehaviorInput): CompanionBehaviorDecision {
  const { now, userIsTyping, recentDismissCount, recentIgnoreCount, state, displayHint } = input;

  const interruption = evaluateInterruption(state, now, userIsTyping);
  if (!interruption.allowed) {
    return { type: 'stay_silent', reason: interruption.reason };
  }

  if (userIsTyping) {
    return { type: 'stay_silent', reason: 'user_is_typing' };
  }

  if (recentDismissCount >= 3) {
    return { type: 'stay_silent', reason: 'repeated_dismiss' };
  }

  if (recentIgnoreCount >= 3) {
    return { type: 'stay_silent', reason: 'repeated_ignore' };
  }

  const hint = displayHint ?? 'stay_silent';

  switch (hint) {
    case 'present_discovery':
      return { type: 'present_discovery', reason: 'brain_share_discovery' };
    case 'show_soft_hint':
      return { type: 'show_soft_hint', reason: 'brain_soft_hint' };
    case 'start_conversation':
      return { type: 'start_conversation', reason: 'brain_conversation' };
    case 'suggest_next_action':
      return { type: 'suggest_next_action', reason: 'brain_follow_up' };
    case 'ambient_reaction':
      return { type: 'ambient_reaction', reason: 'brain_idle_activity' };
    default:
      return { type: 'stay_silent', reason: 'brain_stay_silent' };
  }
}

/** @deprecated Use applyBehaviorHint — local decision path removed */
export function decideCompanionBehavior(input: CompanionBehaviorInput): CompanionBehaviorDecision {
  return applyBehaviorHint({ ...input, displayHint: 'stay_silent' });
}
