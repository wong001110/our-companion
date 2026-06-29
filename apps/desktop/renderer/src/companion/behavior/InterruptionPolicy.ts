import type { CompanionBehaviorState } from './CompanionBehaviorTypes';

export const MIN_TIME_BETWEEN_SPEECH_MS = 3 * 60 * 1000;
export const DISMISS_SUPPRESSION_MS = 10 * 60 * 1000;
export const IGNORE_SUPPRESSION_MS = 20 * 60 * 1000;
export const SOFT_HINT_COOLDOWN_MS = 5 * 60 * 1000;

export interface InterruptionPolicyResult {
  allowed: boolean;
  reason: string;
  suppressedUntil?: number;
}

export function evaluateInterruption(
  state: CompanionBehaviorState,
  now: number,
  userIsTyping: boolean,
): InterruptionPolicyResult {
  if (state.debugOverride) {
    return { allowed: true, reason: 'debug_override' };
  }

  if (userIsTyping) {
    return { allowed: false, reason: 'user_is_typing' };
  }

  if (state.interruptionSuppressedUntil !== null && now < state.interruptionSuppressedUntil) {
    return {
      allowed: false,
      reason: 'suppressed',
      suppressedUntil: state.interruptionSuppressedUntil,
    };
  }

  if (state.lastCompanionSpokeAt !== null) {
    const elapsed = now - state.lastCompanionSpokeAt;
    if (elapsed < MIN_TIME_BETWEEN_SPEECH_MS) {
      return {
        allowed: false,
        reason: 'spoke_too_recently',
        suppressedUntil: state.lastCompanionSpokeAt + MIN_TIME_BETWEEN_SPEECH_MS,
      };
    }
  }

  return { allowed: true, reason: 'ok' };
}

export function applyDismissSuppression(state: CompanionBehaviorState, now: number): CompanionBehaviorState {
  return {
    ...state,
    lastUserDismissedAt: now,
    interruptionSuppressedUntil: now + DISMISS_SUPPRESSION_MS,
  };
}

export function applyIgnoreSuppression(state: CompanionBehaviorState, now: number, ignoreCount: number): CompanionBehaviorState {
  const multiplier = Math.min(ignoreCount, 5);
  const suppressionMs = IGNORE_SUPPRESSION_MS * multiplier;
  return {
    ...state,
    interruptionSuppressedUntil: now + suppressionMs,
  };
}
