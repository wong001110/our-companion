import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { createMemoryNode, SqliteVecIndex } from '@our-companion/memory-engine';

describe('memory/vector deletion lifecycle', () => {
  it('removes completed vectors, jobs, FTS and edges before deleting the authoritative memory', async () => {
    const db = new DatabaseService();
    const index = new SqliteVecIndex(db.getExtensionDatabase(), 3);
    await index.initialize();
    db.setVectorDeletionHandler((id) => index.removeForDeletion(id));
    const base = createMemoryNode({ companionId: 'ann', type: 'topic', title: 'Delete me', summary: 'Delete me' });
    const memory = db.insertMemoryNode({ ...base, id: 'delete-me', userId: 'local', memoryType: 'user_fact', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: base.createdAt } });
    const second = db.insertMemoryNode({ ...createMemoryNode({ companionId: 'ann', type: 'topic', title: 'other' }), id: 'other', userId: 'local', memoryType: 'user_fact', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: base.createdAt } });
    db.insertMemoryEdge({ id: 'edge', fromNodeId: memory.id, toNodeId: second.id, relationType: 'related_to', confidence: 1, createdAt: base.createdAt });
    await index.upsert({ memoryId: memory.id, embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1, userId: 'local', companionId: 'ann', memoryType: 'user_fact' });
    db.deleteMemoryNode(memory.id);
    const raw = db.getExtensionDatabase();
    expect(db.getMemoryNode(memory.id)).toBeUndefined();
    expect(raw.prepare('SELECT * FROM memory_embeddings WHERE memory_id = ?').all(memory.id)).toEqual([]);
    expect(raw.prepare('SELECT * FROM embedding_jobs WHERE memory_id = ?').all(memory.id)).toEqual([]);
    expect(raw.prepare('SELECT * FROM memory_fts WHERE memory_id = ?').all(memory.id)).toEqual([]);
    expect(db.listMemoryEdges('ann')).toEqual([]);
    expect((await index.healthCheck()).indexedCount).toBe(0);
    db.close();
  });

  it('can remove twice and re-upsert after a stale mapping', async () => {
    const db = new DatabaseService();
    const index = new SqliteVecIndex(db.getExtensionDatabase(), 3);
    await index.initialize();
    const base = createMemoryNode({ companionId: 'ann', type: 'topic', title: 'Re-index', summary: 'Re-index' });
    db.insertMemoryNode({ ...base, id: 'reindex', userId: 'local', memoryType: 'user_fact', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: base.createdAt } });
    const input = { memoryId: 'reindex', embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1, userId: 'local', companionId: 'ann', memoryType: 'user_fact' };
    await index.upsert(input); await index.remove('reindex'); await index.remove('reindex');
    expect((await index.healthCheck()).indexedCount).toBe(0);
    await index.upsert(input);
    expect((await index.search({ queryEmbedding: new Float32Array([1, 0, 0]), filter: { userId: 'local', companionId: 'ann' }, limit: 1 })).map((x) => x.memoryId)).toEqual(['reindex']);
    db.close();
  });
});
