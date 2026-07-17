import { describe, expect, it, vi } from 'vitest';
import type { CompanionDecision } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { CompanionRuntime, shouldEmitCompanionCommand } from './CompanionRuntime';

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

  it('carries the selected Discovery id on the authoritative command', () => {
    const emitCommand = vi.fn(() => true);
    const runtime = new CompanionRuntime({ listActiveConversationSessions: () => [] } as any, vi.fn(), vi.fn(), emitCommand);
    const internals = runtime as unknown as {
      emitCompanionCommand(companionId: string, value: CompanionDecision, discoveryId?: string): boolean;
    };

    expect(internals.emitCompanionCommand('companion', decision('share_discovery', 'now'), 'discovery-1')).toBe(true);
    expect(emitCommand).toHaveBeenCalledWith(expect.objectContaining({
      companionId: 'companion',
      discoveryId: 'discovery-1',
    }));
  });
});

describe('CompanionRuntime session animation state', () => {
  it('publishes semantic talking state, waiting response, and clears stale session intent on idle', () => {
    let current: any = {
      characterId: 'companion', coreState: 'idle', intent: 'waiting', animationIntent: 'Music_Idle',
      lifeActivity: 'listening_music', emotion: { neutral: 1 }
    };
    const db = {
      resolveActiveCompanionId: () => 'companion',
      listActiveConversationSessions: () => [],
      getActiveConversationSession: () => null,
      getCharacterState: () => current,
      saveCharacterState: vi.fn((next) => { current = next; return next; }),
      listPendingActions: () => [],
      getRelationship: () => ({}),
      countAnnouncedToday: () => 0,
      listInteractionFeedbackActions: () => [],
    } as any;
    const emitState = vi.fn();
    const runtime = new CompanionRuntime(db, emitState, vi.fn());

    runtime.setSessionPhase('talking');
    expect(current).toMatchObject({ coreState: 'talking', intent: 'helping_task', animationIntent: undefined, lifeActivity: 'interacting' });

    runtime.setSessionPhase('waiting_for_user');
    expect(current).toMatchObject({ coreState: 'idle', intent: 'waiting', animationIntent: 'Waiting_Response' });

    runtime.setSessionPhase('idle');
    expect(current).toMatchObject({ coreState: 'idle', intent: 'waiting', animationIntent: undefined, lifeActivity: 'idle' });
    expect(emitState).toHaveBeenCalledTimes(3);
  });
});
