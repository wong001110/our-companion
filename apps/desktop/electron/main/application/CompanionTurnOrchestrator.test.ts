import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import type {
  ActionPermissionState,
  ActionPlan,
  ActionResult,
  CompanionTurnProposal,
} from '@our-companion/shared';
import { MemoryPolicy } from '../runtime/MemoryPolicy';
import { CompanionTurnOrchestrator } from './CompanionTurnOrchestrator';
import { SqliteMemoryContextProvider } from './MemoryContextProvider';

function createHarness(
  aiReply: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => string,
) {
  const db = new DatabaseService();
  const companion = db.createCompanion({
    name: 'Ann',
    personalityDescription: 'Warm, careful, and concise.',
    personalityAnalysisId: 'test',
    assetRoot: 'test',
    personality: {
      energy: 50,
      curiosity: 50,
      sociability: 50,
      diligence: 50,
      playfulness: 50,
      confidence: 50,
      calmness: 50,
      shyness: 50,
    },
  });
  db.setPrimaryCompanion(companion.id);
  let permissions: ActionPermissionState = db.getActionPermissions();
  const executions: ActionPlan[] = [];
  const aiMessages: Array<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> = [];
  const orchestrator = new CompanionTurnOrchestrator({
    db,
    memoryContext: new SqliteMemoryContextProvider(db, () => new Date('2026-07-18T00:00:00.000Z')),
    memoryPolicy: new MemoryPolicy(db, { now: () => Date.parse('2026-07-18T00:00:00.000Z') }),
    now: () => new Date('2026-07-18T00:00:00.000Z'),
    getReplyLanguage: () => 'en',
    sendToAi: async ({ messages }) => {
      aiMessages.push(messages);
      return { content: aiReply(messages) };
    },
    getPermissions: () => permissions,
    setPermissions: (next) => {
      permissions = next;
      db.setActionPermissions(next);
      return next;
    },
    executePlan: async (plan): Promise<ActionResult> => {
      executions.push(plan);
      return {
        id: `result-${executions.length}`,
        planId: plan.id,
        status: 'success',
        outputs: {},
        completedAt: '2026-07-18T00:00:00.000Z',
      };
    },
  });
  return { db, companion, orchestrator, executions, aiMessages, getPermissions: () => permissions };
}

function proposal(input: Partial<CompanionTurnProposal> = {}): string {
  return JSON.stringify({
    reply: 'Understood.',
    intent: 'conversation',
    actions: [],
    memoryCandidates: [],
    ...input,
  });
}

describe('CompanionTurnOrchestrator', () => {
  it('repairs an unsupported memory claim once and never persists rejected draft candidates', async () => {
    let calls = 0;
    const harness = createHarness(() => {
      calls += 1;
      return calls === 1
        ? proposal({ reply: 'I remember you promised to delete everything.', memoryCandidates: [{ type: 'user_fact', summary: 'False promise', evidence: 'hello', confidence: 1 }] })
        : proposal({ reply: 'I do not have a reliable record of that promise.' });
    });
    const result = await harness.orchestrator.handle({ message: 'hello', source: 'panel_text', characterId: harness.companion.id });
    expect(calls).toBe(2);
    expect(result.message).toBe('I do not have a reliable record of that promise.');
    expect(result.remembered).toEqual([]);
    harness.db.close();
  });

  it('uses the deterministic path, pauses for permission, and continues the same plan after allow once', async () => {
    const harness = createHarness(() => {
      throw new Error('The deterministic path must not call AI.');
    });
    const pending = await harness.orchestrator.handle({
      message: 'open YouTube',
      source: 'panel_text',
    });
    expect(pending.kind).toBe('awaiting_permission');
    expect(pending.requiredScopes).toContain('browser');
    expect(harness.executions).toHaveLength(0);

    const completed = await harness.orchestrator.resolvePermission({
      turnId: pending.turnId,
      decision: 'allow_once',
    });
    expect(completed).toMatchObject({ kind: 'action_completed', actionStatus: 'executed' });
    expect(harness.executions).toHaveLength(1);
    expect(harness.executions[0].id).toBe(pending.actionPlan?.id);
    expect(harness.getPermissions().browser).toBe('ask');
    expect(harness.db.listCompanionMessages({ characterId: harness.companion.id })).toHaveLength(2);
    expect(harness.orchestrator.getInspections()[0]).toMatchObject({
      inputSource: 'panel_text',
      permissionState: 'granted',
      executionResult: 'executed',
    });
    harness.db.close();
  });

  it('captures grounded bilingual Memory and injects it into a later bounded prompt without duplicating the current message', async () => {
    let turn = 0;
    const harness = createHarness(() => {
      turn += 1;
      return turn === 1
        ? proposal({
          reply: '我会记住。',
          memoryCandidates: [{
            type: 'user_preference',
            summary: 'local-first 软件',
            evidence: '我比较喜欢 local-first 软件',
            confidence: 0.9,
          }],
        })
        : proposal({ reply: 'You prefer local-first software.' });
    });
    const first = await harness.orchestrator.handle({
      message: '我比较喜欢 local-first 软件。',
      source: 'companion_text',
    });
    expect(first.remembered).toHaveLength(1);
    expect(harness.db.listMemoryNodes(harness.companion.id)).toHaveLength(1);

    await harness.orchestrator.handle({
      message: 'What do you remember?',
      source: 'voice',
    });
    const secondPrompt = harness.aiMessages[1];
    expect(secondPrompt[0].content).toContain('local-first 软件');
    expect(secondPrompt.filter((message) => message.content === 'What do you remember?')).toHaveLength(1);
    expect(harness.orchestrator.getInspections().map((record) => record.inputSource))
      .toEqual(['voice', 'companion_text']);
    harness.db.close();
  });

  it('falls back to conversation only when structured AI output is malformed', async () => {
    const harness = createHarness(() => 'I can still answer safely, but this is not structured JSON.');
    const result = await harness.orchestrator.handle({
      message: 'Tell me something useful.',
      source: 'panel_text',
    });
    expect(result).toMatchObject({ kind: 'conversation' });
    expect(harness.executions).toHaveLength(0);
    expect(harness.db.listMemoryNodes(harness.companion.id)).toHaveLength(0);
    expect(harness.orchestrator.getInspections()[0].finalReplySource).toBe('safe_fallback');
    harness.db.close();
  });

  it('rejects an unsupported AI tool without executing any validated subset', async () => {
    const harness = createHarness(() => proposal({
      intent: 'action',
      actions: [{ toolName: 'delete_everything', args: {}, reason: 'Unsupported test tool.' }],
    }));
    const result = await harness.orchestrator.handle({
      message: 'Do the unsupported operation.',
      source: 'panel_text',
    });
    expect(result).toMatchObject({ kind: 'action_failed', actionStatus: 'unsupported_tool' });
    expect(harness.executions).toHaveLength(0);
    expect(harness.orchestrator.getInspections()[0].rejectedActions[0].reason).toBe('UNSUPPORTED_TOOL');
    harness.db.close();
  });
});
