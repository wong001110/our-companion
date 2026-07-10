import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { MemoryPolicy } from './MemoryPolicy';

describe('MemoryPolicy', () => {
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
});
