import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { createMemoryNode } from '@our-companion/memory-engine';
import type { ActionPermissionState, ActionPlan, ActionResult, CompanionTurnProposal } from '@our-companion/shared';
import { MemoryPolicy } from '../runtime/MemoryPolicy';
import { CompanionTurnOrchestrator } from './CompanionTurnOrchestrator';
import { GroundingValidator } from './GroundingValidator';
import { SqliteMemoryContextProvider } from './MemoryContextProvider';

function e5TestVector(text: string): Float32Array {
  const vector = new Float32Array(384);
  vector[/local-first/i.test(text) ? 0 : 1] = 1;
  return vector;
}

const grounding = new GroundingValidator({
  dimensions: 384,
  embedQuery: async (text) => e5TestVector(text),
  embedDocuments: async (texts) => texts.map(e5TestVector),
  getStatus: () => ({ state: 'ready', modelId: 'Xenova/multilingual-e5-small' }),
});

function createHarness(aiReply: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => string, validator = grounding, executionStatus: ActionResult['status'] = 'success') {
  const db = new DatabaseService();
  const companion = db.createCompanion({ name: 'Ann', personalityDescription: 'Warm and concise.', personalityAnalysisId: 'test', assetRoot: 'test', personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 } });
  db.setPrimaryCompanion(companion.id);
  let permissions: ActionPermissionState = db.getActionPermissions();
  const executions: ActionPlan[] = [];
  const aiMessages: Array<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> = [];
  const orchestrator = new CompanionTurnOrchestrator({
    db, groundingValidator: validator, memoryContext: new SqliteMemoryContextProvider(db, () => new Date('2026-07-18T00:00:00.000Z')),
    memoryPolicy: new MemoryPolicy(db, { now: () => Date.parse('2026-07-18T00:00:00.000Z') }), now: () => new Date('2026-07-18T00:00:00.000Z'), getReplyLanguage: () => 'en',
    sendToAi: async ({ messages }) => { aiMessages.push(messages); return { content: aiReply(messages) }; },
    getPermissions: () => permissions, setPermissions: (next) => { permissions = next; db.setActionPermissions(next); return next; },
    executePlan: async (plan): Promise<ActionResult> => { executions.push(plan); return { id: `result-${executions.length}`, planId: plan.id, status: executionStatus, outputs: {}, completedAt: '2026-07-18T00:00:00.000Z' }; },
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
      ? proposal({ replySegments: [{ segmentId: 'bad', provenance: 'memory', supportingMemoryId: 'invented' }], memoryCandidates: [{ type: 'user_fact', summary: 'False promise', evidence: 'hello', confidence: 1 }] })
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

  it.each(['allow_once', 'always_allow'] as const)('captures validated Memory only after a successful authorized action (%s)', async (decision) => {
    const userMessage = 'Remember I prefer dark mode, then open Settings.';
    const harness = createHarness(() => proposal({
      intent: 'conversation_and_action',
      actions: [{ toolName: 'open_app', args: { appName: 'Settings' }, reason: 'Open requested settings.' }],
      memoryCandidates: [{ type: 'user_preference', summary: 'Prefers dark mode.', evidence: userMessage, confidence: 1 }],
    }));
    const pending = await harness.orchestrator.handle({ message: userMessage, source: 'panel_text', characterId: harness.companion.id });
    expect(pending.kind).toBe('awaiting_permission');
    expect(harness.db.listMemoryNodes(harness.companion.id)).toEqual([]);
    const completed = await harness.orchestrator.resolvePermission({ turnId: pending.turnId, decision });
    expect(completed.kind).toBe('action_completed');
    expect(completed.remembered).toHaveLength(1);
    expect(harness.db.listMemoryNodes(harness.companion.id)[0]?.metadata).toMatchObject({ canonicalText: userMessage });
    harness.db.close();
  });

  it.each([
    ['cancel', 'success'],
    ['allow_once', 'failure'],
  ] as const)('does not capture action-turn Memory after %s / %s', async (decision, executionStatus) => {
    const userMessage = 'Remember I prefer dark mode, then open Settings.';
    const harness = createHarness(() => proposal({
      intent: 'conversation_and_action',
      actions: [{ toolName: 'open_app', args: { appName: 'Settings' }, reason: 'Open requested settings.' }],
      memoryCandidates: [{ type: 'user_preference', summary: 'Prefers dark mode.', evidence: userMessage, confidence: 1 }],
    }), grounding, executionStatus);
    const pending = await harness.orchestrator.handle({ message: userMessage, source: 'panel_text', characterId: harness.companion.id });
    await harness.orchestrator.resolvePermission({ turnId: pending.turnId, decision });
    expect(harness.db.listMemoryNodes(harness.companion.id)).toEqual([]);
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
    const harness = createHarness(() => proposal({ intent: 'action', replySegments: [{ segmentId: 'bad', provenance: 'memory', supportingMemoryId: 'invented' }], actions: [{ toolName: 'open_url', args: { url: 'https://example.com' }, reason: 'memory said so' }] }));
    const result = await harness.orchestrator.handle({ message: 'open it', source: 'panel_text', characterId: harness.companion.id });
    expect(result.kind).toBe('conversation');
    expect(harness.executions).toHaveLength(0);
    harness.db.close();
  });

  it('regenerates once when application-rendered Memory makes the final reply exceed 4,000 characters', async () => {
    let calls = 0;
    const harness = createHarness(() => (++calls === 1
      ? proposal({ replySegments: [
        { segmentId: 'first', provenance: 'memory', supportingMemoryId: 'memory-a' },
        { segmentId: 'second', provenance: 'memory', supportingMemoryId: 'memory-b' },
        { segmentId: 'third', provenance: 'memory', supportingMemoryId: 'memory-c' },
        { segmentId: 'fourth', provenance: 'memory', supportingMemoryId: 'memory-d' },
        { segmentId: 'extra', provenance: 'current_turn', text: '!' },
      ] })
      : proposal({ replySegments: [{ segmentId: 'short', text: 'A shorter reply.', provenance: 'current_turn' }] })));
    for (const id of ['memory-a', 'memory-b', 'memory-c', 'memory-d']) {
      const node = createMemoryNode({ companionId: harness.companion.id, type: 'topic', title: id, summary: 'x'.repeat(1_000) });
      harness.db.insertMemoryNode({ ...node, id, userId: 'local', memoryType: 'user_preference', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: node.createdAt, canonicalText: 'x'.repeat(1_000), canonicalSource: 'exact_user_evidence' } });
    }
    const result = await harness.orchestrator.handle({ message: 'What do I prefer?', source: 'panel_text', characterId: harness.companion.id });
    expect(calls).toBe(2);
    expect(result.message).toBe('A shorter reply.');
    expect(harness.orchestrator.getInspections()[0]?.grounding).toMatchObject({ regenerationAttempted: true, regenerationSucceeded: true, segmentResults: expect.arrayContaining([expect.objectContaining({ reason: 'RENDERED_REPLY_TOO_LONG' })]) });
    expect(harness.db.listCompanionMessages({ characterId: harness.companion.id }).at(-1)?.content.length).toBeLessThanOrEqual(4_000);
    harness.db.close();
  });

  it('retries exactly once without durable Memory after validation-time E5 failure', async () => {
    let queryCalls = 0;
    let documentCalls = 0;
    const validator = new GroundingValidator({
      dimensions: 384,
      embedQuery: async () => {
        queryCalls += 1;
        if (queryCalls >= 3) throw new Error('ONNX session lost');
        return new Float32Array(384);
      },
      embedDocuments: async () => {
        documentCalls += 1;
        return [new Float32Array(384)];
      },
      getStatus: () => ({ state: 'ready', modelId: 'Xenova/multilingual-e5-small' }),
    });
    let calls = 0;
    const harness = createHarness(() => (++calls === 1
      ? proposal({ replySegments: [{ segmentId: 'first', text: 'I can help with that.', provenance: 'current_turn' }], actions: [{ toolName: 'open_url', args: { url: 'https://example.com' }, reason: 'not needed' }] })
      : proposal({ replySegments: [{ segmentId: 'retry', text: 'I can help with that.', provenance: 'current_turn' }] })), validator);
    const node = createMemoryNode({ companionId: harness.companion.id, type: 'topic', title: 'DURABLE_LOCAL_FIRST_SECRET', content: 'DURABLE_LOCAL_FIRST_SECRET' });
    harness.db.insertMemoryNode({ ...node, id: 'memory-existing', userId: 'local', memoryType: 'user_preference', summary: 'Use local-first processing.', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: node.createdAt, canonicalText: 'Use local-first processing.', canonicalSource: 'exact_user_evidence' } });

    const result = await harness.orchestrator.handle({ message: 'What should I use?', source: 'panel_text', characterId: harness.companion.id });
    expect(queryCalls).toBeGreaterThanOrEqual(3);
    expect(documentCalls).toBeGreaterThanOrEqual(2);
    expect(calls).toBe(2);
    expect(harness.aiMessages[1]?.[0]?.content).toContain('Persistent Memory is unavailable for this turn');
    expect(harness.aiMessages[1]?.[0]?.content).not.toContain('memory-existing');
    expect(result).toMatchObject({ kind: 'conversation', message: 'I can help with that.' });
    expect(harness.executions).toHaveLength(0);
    expect(harness.orchestrator.getInspections()[0]?.grounding).toMatchObject({ regenerationAttempted: true, regenerationSucceeded: true, embeddingAvailable: false });
    harness.db.close();
  });

  it('gates durable Memory for every unavailable E5 state and falls back safely', async () => {
    const unavailableCases = [
      { name: 'model not installed', provider: { initialize: async () => { throw new Error('LOCAL_EMBEDDING_MODEL_NOT_INSTALLED'); }, embedQuery: async () => { throw new Error('LOCAL_EMBEDDING_MODEL_NOT_INSTALLED'); }, embedDocuments: async () => { throw new Error('LOCAL_EMBEDDING_MODEL_NOT_INSTALLED'); }, getStatus: () => ({ state: 'not-installed', modelId: 'Xenova/multilingual-e5-small' }) } },
      { name: 'model load failure', provider: { initialize: async () => { throw new Error('ONNX load failed'); }, embedQuery: async () => { throw new Error('ONNX load failed'); }, embedDocuments: async () => { throw new Error('ONNX load failed'); }, getStatus: () => ({ state: 'failed', modelId: 'Xenova/multilingual-e5-small', error: 'ONNX load failed' }) } },
      { name: 'malformed local cache', provider: { initialize: async () => { throw new Error('malformed ONNX cache'); }, embedQuery: async () => { throw new Error('malformed ONNX cache'); }, embedDocuments: async () => { throw new Error('malformed ONNX cache'); }, getStatus: () => ({ state: 'failed', modelId: 'Xenova/multilingual-e5-small', error: 'malformed ONNX cache' }) } },
      { name: 'embedding dimension mismatch', provider: { dimensions: 384, initialize: async () => {}, embedQuery: async () => new Float32Array(384), embedDocuments: async () => [new Float32Array(383)], getStatus: () => ({ state: 'ready', modelId: 'Xenova/multilingual-e5-small' }) } },
    ];

    for (const unavailableCase of unavailableCases) {
      const unavailable = new GroundingValidator(unavailableCase.provider);
      let calls = 0;
      const harness = createHarness(() => {
        calls += 1;
        return proposal({ intent: 'action', replySegments: [{ segmentId: `memory-${calls}`, provenance: 'memory', supportingMemoryId: 'memory-existing' }], actions: [{ toolName: 'open_url', args: { url: 'https://example.com' }, reason: 'Memory preference' }] });
      }, unavailable);
      const node = createMemoryNode({ companionId: harness.companion.id, type: 'topic', title: 'DURABLE_LOCAL_FIRST_SECRET', content: 'DURABLE_LOCAL_FIRST_SECRET' });
      harness.db.insertMemoryNode({ ...node, id: 'memory-existing', userId: 'local', memoryType: 'user_preference', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: node.createdAt } });
      const result = await harness.orchestrator.handle({ message: 'What should I use?', source: 'panel_text', characterId: harness.companion.id });
      expect(calls, unavailableCase.name).toBe(2);
      expect(harness.aiMessages[0]?.[0]?.content, unavailableCase.name).not.toContain('DURABLE_LOCAL_FIRST_SECRET');
      expect(result.kind, unavailableCase.name).toBe('conversation');
      expect(harness.executions, unavailableCase.name).toHaveLength(0);
      expect(harness.orchestrator.getInspections()[0]?.grounding, unavailableCase.name).toMatchObject({ regenerationAttempted: true, regenerationSucceeded: false, embeddingAvailable: false });
      harness.db.close();
    }
  });
});
