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
    await index.upsert({ memoryId: 'owned', embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1 });
    await index.upsert({ memoryId: 'other-companion', embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1 });
    await index.upsert({ memoryId: 'other-user', embedding: new Float32Array([1, 0, 0]), modelId: 'test', modelVersion: 1 });
    const results = await index.search({ queryEmbedding: new Float32Array([1, 0, 0]), filter: { userId: 'local', companionId: 'ann' }, limit: 10 });
    expect(results.map((result) => result.memoryId)).toEqual(['owned']);
    expect((await index.healthCheck()).available).toBe(true);
    db.close();
  });
});
