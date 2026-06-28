import { describe, it, expect } from 'vitest';
import { decideCompanionBehavior, type CompanionBehaviorInput } from './CompanionBehaviorController';
import { createDefaultBehaviorState } from './CompanionBehaviorTypes';
import type { CompanionBehaviorState } from './CompanionBehaviorTypes';

function base(overrides: Partial<CompanionBehaviorInput> = {}): CompanionBehaviorInput {
  return {
    now: Date.now(),
    hasDiscoveryCandidate: false,
    userIsTyping: false,
    panelOpen: false,
    activeConversation: false,
    recentDismissCount: 0,
    recentIgnoreCount: 0,
    state: createDefaultBehaviorState(),
    ...overrides,
  };
}

describe('decideCompanionBehavior', () => {
  it('stays silent when user is typing', () => {
    const decision = decideCompanionBehavior(base({ userIsTyping: true }));
    expect(decision.type).toBe('stay_silent');
  });

  it('stays silent when interruption suppressed', () => {
    const state: CompanionBehaviorState = {
      ...createDefaultBehaviorState(),
      interruptionSuppressedUntil: Date.now() + 60_000,
    };
    const decision = decideCompanionBehavior(base({ state }));
    expect(decision.type).toBe('stay_silent');
  });

  it('stays silent on repeated dismiss', () => {
    const decision = decideCompanionBehavior(base({ recentDismissCount: 3 }));
    expect(decision.type).toBe('stay_silent');
  });

  it('stays silent on repeated ignore', () => {
    const decision = decideCompanionBehavior(base({ recentIgnoreCount: 3 }));
    expect(decision.type).toBe('stay_silent');
  });

  it('returns ambient_reaction when idle long enough', () => {
    const state: CompanionBehaviorState = {
      ...createDefaultBehaviorState(),
      lastUserInteractionAt: Date.now() - 20 * 60_000,
      lastAnnSpokeAt: Date.now() - 10 * 60_000,
    };
    const decision = decideCompanionBehavior(base({ state }));
    expect(decision.type).toBe('ambient_reaction');
  });

  it('shows soft hint when initiative >= 2 and queued', () => {
    const state: CompanionBehaviorState = {
      ...createDefaultBehaviorState(),
      mood: 'curious',
      initiativeLevel: 3,
      discoveryPresentationState: 'queued',
      lastAnnSpokeAt: Date.now() - 10 * 60_000,
    };
    const decision = decideCompanionBehavior(base({ hasDiscoveryCandidate: true, state }));
    expect(decision.type).toBe('show_soft_hint');
  });

  it('shows soft hint when initiative >= 2', () => {
    const state: CompanionBehaviorState = {
      ...createDefaultBehaviorState(),
      mood: 'curious',
      initiativeLevel: 2,
      discoveryPresentationState: 'queued',
      lastAnnSpokeAt: Date.now() - 10 * 60_000,
    };
    const decision = decideCompanionBehavior(base({ hasDiscoveryCandidate: true, state }));
    expect(decision.type).toBe('show_soft_hint');
  });

  it('suggests next action after discovery discussed', () => {
    const state: CompanionBehaviorState = {
      ...createDefaultBehaviorState(),
      mood: 'curious',
      initiativeLevel: 4,
      discoveryPresentationState: 'presented',
    };
    const decision = decideCompanionBehavior(base({ state }));
    expect(decision.type).toBe('suggest_next_action');
  });

  it('debug override presents discovery', () => {
    const state: CompanionBehaviorState = {
      ...createDefaultBehaviorState(),
      debugOverride: true,
      discoveryPresentationState: 'queued',
    };
    const decision = decideCompanionBehavior(base({ hasDiscoveryCandidate: true, state }));
    expect(decision.type).toBe('present_discovery');
  });

  it('starts conversation when active', () => {
    const decision = decideCompanionBehavior(base({ activeConversation: true }));
    expect(decision.type).toBe('start_conversation');
  });
});
