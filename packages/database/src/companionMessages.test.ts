import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';

describe('companion messages', () => {
  it('inserts and retrieves a message', () => {
    const db = new DatabaseService({ path: ':memory:' });

    const msg = db.insertCompanionMessage({
      role: 'user',
      content: 'Hello Ann',
      source: 'panel'
    });

    expect(msg.id).toBeTruthy();
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello Ann');
    expect(msg.source).toBe('panel');
    expect(msg.status).toBe('ok');
    expect(msg.characterId).toBe('ann');

    const list = db.listCompanionMessages();
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe('Hello Ann');

    db.close();
  });

  it('inserts pair and retrieves in chronological order', () => {
    const db = new DatabaseService({ path: ':memory:' });

    db.insertCompanionMessage({ role: 'user', content: 'First', source: 'voice' });
    db.insertCompanionMessage({ role: 'assistant', content: 'Reply', source: 'voice' });

    const list = db.listCompanionMessages();
    expect(list).toHaveLength(2);
    expect(list[0].role).toBe('user');
    expect(list[1].role).toBe('assistant');

    db.close();
  });

  it('filters by source', () => {
    const db = new DatabaseService({ path: ':memory:' });

    db.insertCompanionMessage({ role: 'user', content: 'Voice message', source: 'voice' });
    db.insertCompanionMessage({ role: 'user', content: 'Panel message', source: 'panel' });

    const voiceOnly = db.listCompanionMessages({ source: 'voice' });
    expect(voiceOnly).toHaveLength(1);
    expect(voiceOnly[0].content).toBe('Voice message');

    const all = db.listCompanionMessages({ source: 'all' });
    expect(all).toHaveLength(2);

    db.close();
  });

  it('filters by status', () => {
    const db = new DatabaseService({ path: ':memory:' });

    db.insertCompanionMessage({ role: 'user', content: 'OK msg', source: 'voice', status: 'ok' });
    db.insertCompanionMessage({ role: 'system', content: 'Error', source: 'voice', status: 'error' });

    const errors = db.listCompanionMessages({ status: 'error' });
    expect(errors).toHaveLength(1);
    expect(errors[0].content).toBe('Error');

    db.close();
  });

  it('filters by query text', () => {
    const db = new DatabaseService({ path: ':memory:' });

    db.insertCompanionMessage({ role: 'user', content: 'Tell me about PixiJS', source: 'panel' });
    db.insertCompanionMessage({ role: 'user', content: 'What is TypeScript?', source: 'panel' });

    const results = db.listCompanionMessages({ query: 'PixiJS' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('PixiJS');

    db.close();
  });

  it('prunes messages older than retention days', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const rawDb = (db as unknown as { db: InstanceType<typeof DatabaseSync> }).db;

    // Insert a fresh message
    db.insertCompanionMessage({ role: 'user', content: 'Fresh', source: 'panel' });

    // Manually insert an old message (9 days ago)
    const oldDate = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
    rawDb
      .prepare(
        `INSERT INTO companion_messages (id, character_id, role, content, source, status, created_at)
         VALUES ('old_msg', 'ann', 'user', 'Old message', 'panel', 'ok', ?)`
      )
      .run(oldDate);

    // Before prune: 2 rows
    expect(
      (rawDb.prepare('SELECT COUNT(*) as cnt FROM companion_messages').get() as { cnt: number }).cnt
    ).toBe(2);

    // Prune with 7 days retention removes the old one
    db.pruneCompanionMessages(7);

    const list = db.listCompanionMessages();
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe('Fresh');

    db.close();
  });

  it('respects retention override from app_settings', () => {
    const db = new DatabaseService({ path: ':memory:' });
    db.setAppSetting('companion.chatRetentionDays', 1);
    expect(db.getCompanionRetentionDays()).toBe(1);
    db.close();
  });

  it('returns default retention when no override set', () => {
    const db = new DatabaseService({ path: ':memory:' });
    expect(db.getCompanionRetentionDays()).toBe(7);
    db.close();
  });

  it('clears all messages', () => {
    const db = new DatabaseService({ path: ':memory:' });

    db.insertCompanionMessage({ role: 'user', content: 'A', source: 'panel' });
    db.insertCompanionMessage({ role: 'user', content: 'B', source: 'voice' });

    db.clearCompanionMessages();
    expect(db.listCompanionMessages()).toHaveLength(0);

    db.close();
  });

  it('listCompanionContext returns ok user/assistant messages in chronological order', () => {
    const db = new DatabaseService({ path: ':memory:' });

    db.insertCompanionMessage({ role: 'user', content: 'Q1', source: 'panel', status: 'ok' });
    db.insertCompanionMessage({ role: 'assistant', content: 'A1', source: 'panel', status: 'ok' });
    db.insertCompanionMessage({ role: 'system', content: 'err', source: 'voice', status: 'error' });

    const context = db.listCompanionContext('ann', 12);
    expect(context).toHaveLength(2);
    expect(context[0].content).toBe('Q1');
    expect(context[1].content).toBe('A1');

    db.close();
  });
});
