import { describe, expect, it } from 'vitest';
import type { CompanionDecision } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { shouldEmitCompanionCommand } from './CompanionRuntime';

function decision(action: CompanionDecision['action'], timing: CompanionDecision['timing']): CompanionDecision {
  return { id: createId('decision'), action, timing, priority: 'normal', reason: 'test', createdAt: nowIso() };
}

describe('CompanionRuntime command emission', () => {
  it('emits only immediate discovery-share decisions', () => {
    expect(shouldEmitCompanionCommand(decision('share_discovery', 'now'))).toBe(true);
    expect(shouldEmitCompanionCommand(decision('share_discovery', 'next_idle'))).toBe(false);
    expect(shouldEmitCompanionCommand(decision('share_discovery', 'later'))).toBe(false);
    expect(shouldEmitCompanionCommand(decision('stay_silent', 'now'))).toBe(false);
  });
});
