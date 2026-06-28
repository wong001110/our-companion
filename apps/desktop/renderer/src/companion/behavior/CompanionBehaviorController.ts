import type {
  CompanionBehaviorState,
  InitiativeLevel,
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
}

export type CompanionBehaviorDecision =
  | { type: 'stay_silent'; reason: string }
  | { type: 'ambient_reaction'; reason: string }
  | { type: 'show_soft_hint'; reason: string }
  | { type: 'present_discovery'; reason: string }
  | { type: 'start_conversation'; reason: string }
  | { type: 'suggest_next_action'; reason: string };

function adjustedInitiative(state: CompanionBehaviorState): InitiativeLevel {
  let level = state.initiativeLevel;
  if (state.energy === 'low') level = Math.max(0, level - 1) as InitiativeLevel;
  if (state.energy === 'high') level = Math.min(5, level + 1) as InitiativeLevel;
  if (state.mood === 'calm') level = Math.max(0, level - 1) as InitiativeLevel;
  if (state.mood === 'excited') level = Math.min(5, level + 1) as InitiativeLevel;
  if (state.mood === 'tired') level = Math.max(0, level - 1) as InitiativeLevel;
  return level;
}

function timeSince(ms: number | null, now: number): number {
  return ms === null ? Infinity : now - ms;
}

export function decideCompanionBehavior(
  input: CompanionBehaviorInput
): CompanionBehaviorDecision {
  const { now, hasDiscoveryCandidate, userIsTyping, panelOpen, activeConversation, recentDismissCount, recentIgnoreCount, state } = input;

  if (state.debugOverride) {
    if (hasDiscoveryCandidate && state.discoveryPresentationState === 'queued') {
      return { type: 'present_discovery', reason: 'debug_override_present' };
    }
    return { type: 'ambient_reaction', reason: 'debug_override_idle' };
  }

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

  const initiative = adjustedInitiative(state);

  const timeSinceInteraction = timeSince(state.lastUserInteractionAt, now);
  const timeSinceSpeech = timeSince(state.lastAnnSpokeAt, now);

  if (activeConversation || state.focus === 'listening' || state.focus === 'thinking') {
    return { type: 'start_conversation', reason: 'active_conversation' };
  }

  if (state.discoveryPresentationState === 'presented' || state.discoveryPresentationState === 'discussed') {
    if (initiative >= 4) {
      return { type: 'suggest_next_action', reason: 'post_discovery_follow_up' };
    }
  }

  if (hasDiscoveryCandidate && state.discoveryPresentationState === 'queued') {
    if (state.debugOverride) {
      return { type: 'present_discovery', reason: 'debug_override_present' };
    }

    if (initiative >= 3 && timeSinceSpeech > MIN_SPEECH_GAP) {
      return { type: 'present_discovery', reason: 'initiative_meets_threshold' };
    }

    if (initiative >= 2 && timeSinceSpeech > SOFT_HINT_GAP) {
      return { type: 'show_soft_hint', reason: 'soft_hint_available' };
    }
  }

  if (timeSinceInteraction > IDLE_AMBIENT_THRESHOLD && timeSinceSpeech > MIN_SPEECH_GAP) {
    return { type: 'ambient_reaction', reason: 'idle_ambient' };
  }

  return { type: 'stay_silent', reason: 'no_action_needed' };
}

const MIN_SPEECH_GAP = 3 * 60 * 1000;
const SOFT_HINT_GAP = 5 * 60 * 1000;
const IDLE_AMBIENT_THRESHOLD = 15 * 60 * 1000;
