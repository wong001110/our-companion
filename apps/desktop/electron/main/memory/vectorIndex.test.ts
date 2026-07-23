import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { createMemoryNode, SqliteVecIndex } from '@our-companion/memory-engine';

describe('SqliteVecIndex in Electron', () => {
  it('loads the pinned extension and enforces authoritative user and companion scope', async () => {
    const db = new DatabaseService();
    const timestamp = '2026-07-23T00:00:00.000Z';
    for (const [id, companionId, userId] of [['owned', 'ann', 'local'], ['other-companion', 'other', 'local'], ['other-user', 'ann', 'other']] as const) {
      const node = createMemoryNode({ companionId, type: 'topic', title: id, summary: id });
      db.insertMemoryNode({
        ...node, id, companionId, userId, memoryType: 'user_fact', createdAt: timestamp, updatedAt: timestamp,
        metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: timestamp },
      });
    }
    const index = new SqliteVecIndex(db.getExtensionDatabase(), 3);
    await index.initialize();
    await index.upsert({ memoryId: 'owned', embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1, userId: 'local', companionId: 'ann', memoryType: 'user_fact' });
    await index.upsert({ memoryId: 'other-companion', embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1, userId: 'local', companionId: 'other', memoryType: 'user_fact' });
    await index.upsert({ memoryId: 'other-user', embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1, userId: 'other', companionId: 'ann', memoryType: 'user_fact' });
    const results = await index.search({ queryEmbedding: new Float32Array([1, 0, 0]), filter: { userId: 'local', companionId: 'ann' }, limit: 10 });
    expect(results.map((result) => result.memoryId)).toEqual(['owned']);
    expect((await index.healthCheck()).available).toBe(true);
    db.close();
  });

  it('applies type and status filters inside scoped sqlite-vec KNN', async () => {
    const db = new DatabaseService();
    const timestamp = '2026-07-23T00:00:00.000Z';
    const add = async (id: string, memoryType: 'user_fact' | 'goal', status: 'active' | 'archived', embedding: number[]) => {
      const node = createMemoryNode({ companionId: 'ann', type: 'topic', title: id, summary: id });
      db.insertMemoryNode({
        ...node, id, companionId: 'ann', userId: 'local', memoryType, status, createdAt: timestamp, updatedAt: timestamp,
        metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: timestamp },
      });
      await index.upsert({ memoryId: id, embedding: new Float32Array(embedding), modelId: 'test', modelVersion: 1, userId: 'local', companionId: 'ann', memoryType, memoryStatus: status });
    };
    const index = new SqliteVecIndex(db.getExtensionDatabase(), 3);
    await index.initialize();
    await add('fact', 'user_fact', 'active', [1, 0, 0]);
    await add('goal', 'goal', 'active', [0.99, 0.01, 0]);
    await add('archived', 'user_fact', 'archived', [0.98, 0.02, 0]);
    const facts = await index.search({ queryEmbedding: new Float32Array([1, 0, 0]), filter: { userId: 'local', companionId: 'ann', memoryTypes: ['user_fact'], statuses: ['active'] }, limit: 5 });
    expect(facts.map((result) => result.memoryId)).toEqual(['fact']);
    const archived = await index.search({ queryEmbedding: new Float32Array([1, 0, 0]), filter: { userId: 'local', companionId: 'ann', statuses: ['archived'] }, limit: 5 });
    expect(archived.map((result) => result.memoryId)).toEqual(['archived']);
    expect((await index.healthCheck()).filterableMetadataFields).toContain('memory_status');
    db.close();
  });

  it('replaces an existing vec0 row instead of mutating immutable partition keys', async () => {
    const db = new DatabaseService();
    const node = createMemoryNode({ companionId: 'ann', type: 'topic', title: 'updated memory' });
    db.insertMemoryNode({ ...node, id: 'replace-me', companionId: 'ann', userId: 'local', memoryType: 'user_fact', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: node.createdAt } });
    const index = new SqliteVecIndex(db.getExtensionDatabase(), 3);
    await index.upsert({ memoryId: 'replace-me', embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1, userId: 'local', companionId: 'ann', memoryType: 'user_fact', memoryStatus: 'active' });
    const first = db.getExtensionDatabase().prepare('SELECT vector_row_id FROM memory_embeddings WHERE memory_id = ?').get('replace-me') as { vector_row_id: number };
    await index.upsert({ memoryId: 'replace-me', embedding: new Float32Array([0, 1, 0]), modelId: 'test', modelVersion: 2, userId: 'local', companionId: 'ann', memoryType: 'goal', memoryStatus: 'active' });
    const second = db.getExtensionDatabase().prepare('SELECT vector_row_id FROM memory_embeddings WHERE memory_id = ?').get('replace-me') as { vector_row_id: number };
    expect(second.vector_row_id).not.toBe(first.vector_row_id);
    expect((db.getExtensionDatabase().prepare('SELECT COUNT(*) AS count FROM memory_vec_index WHERE memory_id = ?').get('replace-me') as { count: number }).count).toBe(1);
    expect((await index.search({ queryEmbedding: new Float32Array([0, 1, 0]), filter: { userId: 'local', companionId: 'ann', memoryTypes: ['goal'] }, limit: 3 })).map((result) => result.memoryId)).toEqual(['replace-me']);
    expect((await index.healthCheck()).orphanCount).toBe(0);
    db.close();
  });
});
