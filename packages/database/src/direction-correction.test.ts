import { describe, expect, it } from 'vitest';
import { DatabaseService } from './index';

describe('direction correction — companion registry', () => {
  it('resolveActiveCompanionId uses primary companion', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const id = db.resolveActiveCompanionId();
    expect(id).toBe('ann');
    db.close();
  });

  it('getActiveCharacters reads from companions table not legacy characters', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const chars = db.getActiveCharacters();
    expect(chars.length).toBeGreaterThan(0);
    expect(chars[0].id).toBe('ann');
    db.close();
  });

  it('persists user-companion relationship', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const rel = db.getRelationship('local', 'ann');
    expect(rel.trust).toBeGreaterThan(0);
    rel.trust = 25;
    db.saveRelationship(rel);
    expect(db.getRelationship('local', 'ann').trust).toBe(25);
    db.close();
  });

  it('scopes memory nodes by companion_id', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const now = new Date().toISOString();
    db.insertMemoryNode({
      id: 'm1',
      type: 'topic',
      title: 'Scoped memory',
      importanceScore: 0.5,
      companionId: 'ann',
      userId: 'local',
      memoryType: 'conversation_episode',
      createdAt: now,
      updatedAt: now,
    });
    const nodes = db.listMemoryNodes('ann');
    expect(nodes.some((n) => n.id === 'm1')).toBe(true);
    db.close();
  });
});
