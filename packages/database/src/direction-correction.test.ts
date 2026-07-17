import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseService } from './index';

function insertPriorAnn(db: DatabaseService): void {
  const raw = (db as unknown as { db: DatabaseSync }).db;
  raw.prepare(`INSERT INTO companions
    (id, name, personality_description, personality_json, asset_root, is_primary, is_builtin, created_at, updated_at)
    VALUES ('ann', 'Ann', 'A curious, warm desktop companion.', '{}', 'assets/companions/ann', 1, 1, ?, ?)`)
    .run(new Date().toISOString(), new Date().toISOString());
}

describe('direction correction — companion registry', () => {
  it('fresh database has no Companion and strict resolution never falls back', () => {
    const db = new DatabaseService({ path: ':memory:' });
    expect(db.listCompanions()).toEqual([]);
    expect(db.tryResolveActiveCompanionId()).toBeNull();
    expect(() => db.resolveActiveCompanionId()).toThrow('NO_ACTIVE_COMPANION');
    db.close();
  });

  it('getActiveCharacters reads from companions table not legacy characters', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const companion = db.createCompanion({
      name: 'Test', personalityDescription: 'A test Companion', personalityAnalysisId: 'db-fixture', assetRoot: 'companion://test/assets',
      personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    });
    db.setPrimaryCompanion(companion.id);
    const chars = db.getActiveCharacters();
    expect(chars).toHaveLength(1);
    expect(chars[0].id).toBe(companion.id);
    db.close();
  });

  it('removes only an untouched legacy built-in Ann and is idempotent', () => {
    const db = new DatabaseService({ path: ':memory:' });
    insertPriorAnn(db);
    const migrate = (db as unknown as { migratePriorBuiltinAnn(): void }).migratePriorBuiltinAnn.bind(db);
    migrate(); migrate();
    expect(db.getCompanion('ann')).toBeNull();
    db.close();
  });

  it('preserves a customized legacy Ann as a normal user Companion', () => {
    const db = new DatabaseService({ path: ':memory:' });
    insertPriorAnn(db);
    const raw = (db as unknown as { db: DatabaseSync }).db;
    raw.prepare("UPDATE companions SET name = 'Customized' WHERE id = 'ann'").run();
    (db as unknown as { migratePriorBuiltinAnn(): void }).migratePriorBuiltinAnn();
    expect(db.getCompanion('ann')).toEqual(expect.objectContaining({ name: 'Customized', isBuiltIn: false }));
    db.close();
  });

  it('preserves a personality-modified legacy Ann as a normal user Companion', () => {
    const db = new DatabaseService({ path: ':memory:' });
    insertPriorAnn(db);
    const raw = (db as unknown as { db: DatabaseSync }).db;
    raw.prepare("UPDATE companions SET personality_json = ? WHERE id = 'ann'").run(JSON.stringify({ curiosity: 80 }));
    (db as unknown as { migratePriorBuiltinAnn(): void }).migratePriorBuiltinAnn();
    expect(db.getCompanion('ann')).toEqual(expect.objectContaining({ isBuiltIn: false }));
    db.close();
  });

  it('preserves a data-bearing legacy Ann as a normal user Companion', () => {
    const db = new DatabaseService({ path: ':memory:' });
    insertPriorAnn(db);
    const now = new Date().toISOString();
    db.insertMemoryNode({
      id: 'legacy-memory', type: 'topic', title: 'Keep me', importance: 0.8,
      companionId: 'ann', userId: 'local', memoryType: 'conversation_episode', createdAt: now, updatedAt: now,
    });
    (db as unknown as { migratePriorBuiltinAnn(): void }).migratePriorBuiltinAnn();
    expect(db.getCompanion('ann')).toEqual(expect.objectContaining({ isBuiltIn: false }));
    expect(db.getMemoryNode('legacy-memory')).not.toBeNull();
    db.close();
  });

  it('preserves a legacy Ann with customized assets as a normal user Companion', () => {
    const db = new DatabaseService({ path: ':memory:', priorAnnHasCustomAssets: () => true });
    insertPriorAnn(db);
    (db as unknown as { migratePriorBuiltinAnn(): void }).migratePriorBuiltinAnn();
    expect(db.getCompanion('ann')).toEqual(expect.objectContaining({ isBuiltIn: false }));
    db.close();
  });

  it('preserves exploration-bearing and relationship-bearing legacy Ann data', () => {
    const db = new DatabaseService({ path: ':memory:' });
    insertPriorAnn(db);
    const now = new Date().toISOString();
    db.insertExplorationCycle({
      id: 'cycle_legacy',
      userId: 'local',
      companionId: 'ann',
      trigger: 'manual',
      state: 'planning',
      curiosityTargetIds: [],
      discoveryCandidateIds: [],
      insightIds: [],
      startedAt: now,
    });
    const relationship = db.getRelationship('local', 'ann');
    relationship.trust = 0.42;
    db.saveRelationship(relationship);
    (db as unknown as { migratePriorBuiltinAnn(): void }).migratePriorBuiltinAnn();
    expect(db.getCompanion('ann')).toEqual(expect.objectContaining({ isBuiltIn: false }));
    expect(db.getExplorationCycle('cycle_legacy')).toEqual(expect.objectContaining({ companionId: 'ann' }));
    expect(db.getRelationship('local', 'ann').trust).toBe(0.42);
    db.close();
  });

  it('preserves legacy Ann when migration ownership checks are uncertain', () => {
    const db = new DatabaseService({ path: ':memory:', priorAnnHasCustomAssets: () => { throw new Error('filesystem unavailable'); } });
    insertPriorAnn(db);
    (db as unknown as { migratePriorBuiltinAnn(): void }).migratePriorBuiltinAnn();
    expect(db.getCompanion('ann')).toEqual(expect.objectContaining({ isBuiltIn: false }));
    db.close();
  });

  it('invalid primary and last-Companion deletion cannot remove active ownership', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const companion = db.createCompanion({
      name: 'Only', personalityDescription: 'Test fixture', personalityAnalysisId: 'fixture', assetRoot: 'test',
      personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    });
    db.setPrimaryCompanion(companion.id);
    expect(() => db.setPrimaryCompanion('missing')).toThrow('Companion not found');
    expect(db.getPrimaryCompanion()?.id).toBe(companion.id);
    expect(() => db.deleteCompanion(companion.id)).toThrow('Create another Companion');
    expect(db.getPrimaryCompanion()?.id).toBe(companion.id);
    db.close();
  });

  it('persists user-companion relationship', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const rel = db.getRelationship('local', 'ann');
    expect(rel.trust).toBeGreaterThan(0);
    rel.trust = 0.25;
    db.saveRelationship(rel);
    expect(db.getRelationship('local', 'ann').trust).toBe(0.25);
    db.close();
  });

  it('scopes memory nodes by companion_id', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const now = new Date().toISOString();
    db.insertMemoryNode({
      id: 'm1',
      type: 'topic',
      title: 'Scoped memory',
      importance: 0.5,
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

  it('aggregates topic feedback separately from relationship state', () => {
    const db = new DatabaseService({ path: ':memory:' });
    db.recordTopicPreference('local', 'pixijs', false);
    db.recordTopicPreference('local', 'pixijs', true);
    expect(db.listTopicPreferences('local')).toEqual([expect.objectContaining({ topicKey: 'pixijs', interestScore: 0, positiveCount: 1, negativeCount: 1 })]);
    db.close();
  });
});
