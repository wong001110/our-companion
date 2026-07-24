import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { MemoryPolicy } from './MemoryPolicy';

describe('MemoryPolicy', () => {
  it('stores exact evidence as canonical text and keeps a contradictory model summary non-authoritative', () => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    const outcomes = policy.captureTurn({
      userId: 'local', companionId: 'ann', userMessage: 'I do not like gambling.', assistantReply: 'Understood.',
      candidates: [{ type: 'user_preference', summary: 'The user likes gambling.', evidence: 'I do not like gambling.', confidence: 1 }],
    });
    const outcome = outcomes.find((item) => item.candidate.summary === 'The user likes gambling.')!;
    expect(outcome).toMatchObject({ outcome: 'created' });
    expect(db.getMemoryNode(outcome.memoryId!, 'ann')?.metadata).toMatchObject({
      canonicalText: 'I do not like gambling.', canonicalSource: 'exact_user_evidence',
      unverifiedInterpretation: 'The user likes gambling.',
    });
    db.close();
  });

  it('rejects evidence that is not a verbatim user-message substring', () => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    const outcomes = policy.captureTurn({
      userId: 'local', companionId: 'ann', userMessage: 'I prefer tea.', assistantReply: 'Understood.',
      candidates: [{ type: 'goal', summary: 'The user has a goal.', evidence: 'I prefer tea!', confidence: 1 }],
    });
    expect(outcomes).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'discarded', reason: 'evidence_not_grounded_in_user_message' })]));
    db.close();
  });
  it('long message does not automatically become memory', () => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    const before = db.listMemoryNodes('ann').length;
    policy.processTurn({
      userId: 'local',
      companionId: 'ann',
      userMessage: 'This is a fairly long message that says nothing memorable at all really.',
      assistantReply: 'Okay.'
    });
    expect(db.listMemoryNodes('ann').length).toBe(before);
    db.close();
  });

  it('explicit preference can become memory', () => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    policy.processTurn({
      userId: 'local',
      companionId: 'ann',
      userMessage: 'I prefer dark mode for coding.',
      assistantReply: 'Got it.'
    });
    const nodes = db.listMemoryNodes('ann');
    expect(nodes.some((n) => n.memoryType === 'user_preference')).toBe(true);
    db.close();
  });

  it('API key is rejected', () => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    const before = db.listMemoryNodes('ann').length;
    policy.processTurn({
      userId: 'local',
      companionId: 'ann',
      userMessage: 'my api_key=sk-abcdefghijklmnopqrstuvwxyz1234567890',
      assistantReply: 'I will not store that.'
    });
    expect(db.listMemoryNodes('ann').length).toBe(before);
    db.close();
  });

  it('do not remember is rejected', () => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    const before = db.listMemoryNodes('ann').length;
    policy.processTurn({
      userId: 'local',
      companionId: 'ann',
      userMessage: 'do not remember this please',
      assistantReply: 'Okay.'
    });
    expect(db.listMemoryNodes('ann').length).toBe(before);
    db.close();
  });

  it('does not invalidate an unrelated fact for an uncertain correction', () => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    policy.processTurn({ userId: 'local', companionId: 'ann', userMessage: 'I prefer turn-based games.', assistantReply: 'Got it.' });
    const existing = db.listMemoryNodes('ann')[0];
    const candidate = policy.processTurn({ userId: 'local', companionId: 'ann', userMessage: 'Actually, I prefer tea instead of coffee.', assistantReply: 'Thanks for clarifying.' });
    expect(candidate).toBeNull();
    expect(db.getMemoryNode(existing.id)?.isMarkedWrong).toBe(false);
    expect(db.listMemoryNodes('ann')).toHaveLength(1);
    db.close();
  });

  it('discards ambiguous corrections instead of silently retaining them', () => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    const candidate = policy.processTurn({ userId: 'local', companionId: 'ann', userMessage: 'Actually, that is not true.', assistantReply: 'Thanks.' });
    expect(candidate).toBeNull();
    expect(db.listMemoryNodes('ann')).toHaveLength(0);
    db.close();
  });

  it.each([
    ['我比较喜欢 local-first 软件。', 'user_preference'],
    ['不要再提加班。', 'user_boundary'],
    ['我的目标是完成 Our Companion MVP。', 'goal'],
    ['记住我住在吉隆坡。', 'user_fact'],
  ])('captures grounded Chinese Memory: %s', (userMessage, memoryType) => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db, { now: () => Date.parse('2026-07-18T00:00:00.000Z') });
    const outcomes = policy.captureTurn({
      userId: 'local',
      companionId: 'ann',
      userMessage,
      assistantReply: '好的。',
    });
    expect(outcomes[0]).toMatchObject({ outcome: 'created' });
    expect(db.listMemoryNodes('ann')[0]).toMatchObject({ memoryType });
    db.close();
  });

  it('deduplicates normalized observations, retains the ID, and supports Undo', () => {
    const db = new DatabaseService();
    let now = Date.parse('2026-07-18T00:00:00.000Z');
    const policy = new MemoryPolicy(db, { now: () => now });
    const first = policy.captureTurn({
      userId: 'local',
      companionId: 'ann',
      userMessage: 'I prefer local-first software.',
      assistantReply: 'Got it.',
    })[0];
    const memoryId = first.memoryId!;
    const createdAt = db.getMemoryNode(memoryId, 'ann')!.createdAt;
    now += 1_000;
    const duplicate = policy.captureTurn({
      userId: 'local',
      companionId: 'ann',
      userMessage: 'I prefer   LOCAL-FIRST software!',
      assistantReply: 'Got it.',
    })[0];
    expect(duplicate.outcome).toBe('observed');
    expect(duplicate.memoryId).toBe(memoryId);
    expect(db.listMemoryNodes('ann')).toHaveLength(1);
    expect(db.getMemoryNode(memoryId, 'ann')).toMatchObject({ createdAt, observationCount: 2 });
    expect(policy.undo(duplicate.mutation!.undoToken, 'ann')).toEqual({ undone: true, memoryId });
    expect(db.getMemoryNode(memoryId, 'ann')).toMatchObject({ observationCount: 1, createdAt });
    expect(policy.undo(first.mutation!.undoToken, 'ann')).toEqual({ undone: true, memoryId });
    expect(db.listMemoryNodes('ann')).toEqual([]);
    db.close();
  });

  it.each([
    '不要记住：我喜欢蓝色。',
    '我的 token=secret-value',
    '只是测试，我喜欢蓝色。',
    '今天先暂时记住我喜欢蓝色。',
  ])('rejects unsafe or temporary Chinese/credential input: %s', (userMessage) => {
    const db = new DatabaseService();
    const policy = new MemoryPolicy(db);
    expect(policy.captureTurn({
      userId: 'local',
      companionId: 'ann',
      userMessage,
      assistantReply: 'Okay.',
    })).toEqual([]);
    expect(db.listMemoryNodes('ann')).toEqual([]);
    db.close();
  });
});
