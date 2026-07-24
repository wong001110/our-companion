import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import type { ActionPermissionState, ActionPlan, ActionResult, CompanionTurnProposal } from '@our-companion/shared';
import { MemoryPolicy } from '../runtime/MemoryPolicy';
import { CompanionTurnOrchestrator } from './CompanionTurnOrchestrator';
import { GroundingValidator } from './GroundingValidator';
import { SqliteMemoryContextProvider } from './MemoryContextProvider';

const grounding = new GroundingValidator({
  embedQuery: async (text) => /local-first/i.test(text) ? new Float32Array([1, 0]) : new Float32Array([0, 1]),
  embedDocuments: async (texts) => texts.map((text) => /local-first/i.test(text) ? new Float32Array([1, 0]) : new Float32Array([0, 1])),
  getStatus: () => ({ state: 'ready', modelId: 'Xenova/multilingual-e5-small' }),
});

function createHarness(aiReply: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => string) {
  const db = new DatabaseService();
  const companion = db.createCompanion({ name: 'Ann', personalityDescription: 'Warm and concise.', personalityAnalysisId: 'test', assetRoot: 'test', personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 } });
  db.setPrimaryCompanion(companion.id);
  let permissions: ActionPermissionState = db.getActionPermissions();
  const executions: ActionPlan[] = [];
  const aiMessages: Array<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> = [];
  const orchestrator = new CompanionTurnOrchestrator({
    db, groundingValidator: grounding, memoryContext: new SqliteMemoryContextProvider(db, () => new Date('2026-07-18T00:00:00.000Z')),
    memoryPolicy: new MemoryPolicy(db, { now: () => Date.parse('2026-07-18T00:00:00.000Z') }), now: () => new Date('2026-07-18T00:00:00.000Z'), getReplyLanguage: () => 'en',
    sendToAi: async ({ messages }) => { aiMessages.push(messages); return { content: aiReply(messages) }; },
    getPermissions: () => permissions, setPermissions: (next) => { permissions = next; db.setActionPermissions(next); return next; },
    executePlan: async (plan): Promise<ActionResult> => { executions.push(plan); return { id: `result-${executions.length}`, planId: plan.id, status: 'success', outputs: {}, completedAt: '2026-07-18T00:00:00.000Z' }; },
  });
  return { db, companion, orchestrator, executions, aiMessages, getPermissions: () => permissions };
}
function proposal(input: Partial<CompanionTurnProposal> = {}): string {
  return JSON.stringify({ replySegments: [{ segmentId: 'reply', text: 'Understood.', provenance: 'current_turn' }], intent: 'conversation', actions: [], memoryCandidates: [], ...input });
}

describe('CompanionTurnOrchestrator', () => {
  it('regenerates an invalid memory segment once and persists only the accepted assembled reply', async () => {
    let calls = 0;
    const harness = createHarness(() => (++calls === 1
      ? proposal({ replySegments: [{ segmentId: 'bad', text: 'I remember a promise.', provenance: 'memory', supportingMemoryId: 'invented' }], memoryCandidates: [{ type: 'user_fact', summary: 'False promise', evidence: 'hello', confidence: 1 }] })
      : proposal({ replySegments: [{ segmentId: 'safe', text: 'I do not have a reliable record of that promise.', provenance: 'current_turn' }] })));
    const result = await harness.orchestrator.handle({ message: 'hello', source: 'panel_text', characterId: harness.companion.id });
    expect(calls).toBe(2);
    expect(result.message).toBe('I do not have a reliable record of that promise.');
    expect(harness.db.listCompanionMessages({ characterId: harness.companion.id }).at(-1)?.content).toBe(result.message);
    expect(result.remembered).toEqual([]);
    harness.db.close();
  });

  it('uses the deterministic path and continues the same plan after permission', async () => {
    const harness = createHarness(() => { throw new Error('deterministic path must not call AI'); });
    const pending = await harness.orchestrator.handle({ message: 'open YouTube', source: 'panel_text' });
    expect(pending.kind).toBe('awaiting_permission');
    const completed = await harness.orchestrator.resolvePermission({ turnId: pending.turnId, decision: 'allow_once' });
    expect(completed).toMatchObject({ kind: 'action_completed', actionStatus: 'executed' });
    expect(harness.executions).toHaveLength(1);
    expect(harness.getPermissions().browser).toBe('ask');
    harness.db.close();
  });

  it('assembles every validated segment for the final reply', async () => {
    const harness = createHarness(() => proposal({ replySegments: [
      { segmentId: 'a', text: 'Hello', provenance: 'current_turn' },
      { segmentId: 'b', text: ' world.', provenance: 'general_knowledge' },
    ] }));
    const result = await harness.orchestrator.handle({ message: 'hello', source: 'panel_text', characterId: harness.companion.id });
    expect(result.message).toBe('Hello world.');
    harness.db.close();
  });

  it('falls back when structured output is malformed', async () => {
    const harness = createHarness(() => 'unstructured output');
    const result = await harness.orchestrator.handle({ message: 'Tell me something useful.', source: 'panel_text', characterId: harness.companion.id });
    expect(result.kind).toBe('conversation');
    expect(harness.orchestrator.getInspections()[0].finalReplySource).toBe('safe_fallback');
    harness.db.close();
  });

  it('does not execute actions from a proposal that fails grounding twice', async () => {
    const harness = createHarness(() => proposal({ intent: 'action', replySegments: [{ segmentId: 'bad', text: 'I remember a secret.', provenance: 'memory', supportingMemoryId: 'invented' }], actions: [{ toolName: 'open_url', args: { url: 'https://example.com' }, reason: 'memory said so' }] }));
    const result = await harness.orchestrator.handle({ message: 'open it', source: 'panel_text', characterId: harness.companion.id });
    expect(result.kind).toBe('conversation');
    expect(harness.executions).toHaveLength(0);
    harness.db.close();
  });
});
