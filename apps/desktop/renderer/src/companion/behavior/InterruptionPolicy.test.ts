import { describe, it, expect } from 'vitest';
import {
  evaluateInterruption,
  applyDismissSuppression,
  applyIgnoreSuppression,
  MIN_TIME_BETWEEN_SPEECH_MS,
  DISMISS_SUPPRESSION_MS,
  IGNORE_SUPPRESSION_MS,
} from './InterruptionPolicy';
import { createDefaultBehaviorState } from './CompanionBehaviorTypes';

describe('evaluateInterruption', () => {
  it('allows when state is clean', () => {
    const result = evaluateInterruption(createDefaultBehaviorState(), Date.now(), false);
    expect(result.allowed).toBe(true);
  });

  it('blocks when user is typing', () => {
    const result = evaluateInterruption(createDefaultBehaviorState(), Date.now(), true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('user_is_typing');
  });

  it('blocks when suppressed', () => {
    const state = { ...createDefaultBehaviorState(), interruptionSuppressedUntil: Date.now() + 60_000 };
    const result = evaluateInterruption(state, Date.now(), false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('suppressed');
  });

  it('allows when suppression expired', () => {
    const state = { ...createDefaultBehaviorState(), interruptionSuppressedUntil: Date.now() - 1000 };
    const result = evaluateInterruption(state, Date.now(), false);
    expect(result.allowed).toBe(true);
  });

  it('blocks when spoke too recently', () => {
    const state = { ...createDefaultBehaviorState(), lastAnnSpokeAt: Date.now() - 60_000 };
    const result = evaluateInterruption(state, Date.now(), false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('spoke_too_recently');
  });

  it('allows when enough time since last speech', () => {
    const state = { ...createDefaultBehaviorState(), lastAnnSpokeAt: Date.now() - MIN_TIME_BETWEEN_SPEECH_MS - 1000 };
    const result = evaluateInterruption(state, Date.now(), false);
    expect(result.allowed).toBe(true);
  });

  it('debug override bypasses all checks', () => {
    const state = {
      ...createDefaultBehaviorState(),
      debugOverride: true,
      interruptionSuppressedUntil: Date.now() + 60_000,
      lastAnnSpokeAt: Date.now(),
    };
    const result = evaluateInterruption(state, Date.now(), true);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('debug_override');
  });
});

describe('applyDismissSuppression', () => {
  it('sets suppression until DISMISS_SUPPRESSION_MS', () => {
    const now = Date.now();
    const state = applyDismissSuppression(createDefaultBehaviorState(), now);
    expect(state.lastUserDismissedAt).toBe(now);
    expect(state.interruptionSuppressedUntil).toBe(now + DISMISS_SUPPRESSION_MS);
  });
});

describe('applyIgnoreSuppression', () => {
  it('scales suppression with ignore count', () => {
    const now = Date.now();
    const state = applyIgnoreSuppression(createDefaultBehaviorState(), now, 3);
    expect(state.interruptionSuppressedUntil).toBe(now + IGNORE_SUPPRESSION_MS * 3);
  });

  it('caps multiplier at 5', () => {
    const now = Date.now();
    const state = applyIgnoreSuppression(createDefaultBehaviorState(), now, 10);
    expect(state.interruptionSuppressedUntil).toBe(now + IGNORE_SUPPRESSION_MS * 5);
  });
});
