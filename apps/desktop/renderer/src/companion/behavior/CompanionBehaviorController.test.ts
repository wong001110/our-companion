import { describe, expect, it } from 'vitest';
import { applyBehaviorHint } from './CompanionBehaviorController';
import { createDefaultBehaviorState } from './CompanionBehaviorTypes';

describe('CompanionBehaviorController — display only', () => {
  it('maps brain displayHint to present_discovery', () => {
    const decision = applyBehaviorHint({
      now: Date.now(),
      hasDiscoveryCandidate: true,
      userIsTyping: false,
      panelOpen: false,
      activeConversation: false,
      recentDismissCount: 0,
      recentIgnoreCount: 0,
      state: createDefaultBehaviorState(),
      displayHint: 'present_discovery',
    });
    expect(decision.type).toBe('present_discovery');
    expect(decision.reason).toContain('brain');
  });

  it('does not decide locally when no displayHint — stays silent', () => {
    const decision = applyBehaviorHint({
      now: Date.now(),
      hasDiscoveryCandidate: true,
      userIsTyping: false,
      panelOpen: false,
      activeConversation: false,
      recentDismissCount: 0,
      recentIgnoreCount: 0,
      state: { ...createDefaultBehaviorState(), initiativeLevel: 5 },
      displayHint: undefined,
    });
    expect(decision.type).toBe('stay_silent');
  });
});
