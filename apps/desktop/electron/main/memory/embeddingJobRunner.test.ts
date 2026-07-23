import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { createMemoryNode, type VectorIndex } from '@our-companion/memory-engine';
import { EmbeddingJobRunner } from './embeddingJobRunner';

describe('EmbeddingJobRunner', () => {
  it('wakes for new jobs and drains more than one batch with a single-flight worker', async () => {
    const db = new DatabaseService();
    const indexed: string[] = [];
    const vectors: VectorIndex = {
      initialize: async () => undefined,
      upsert: async (input) => { indexed.push(input.memoryId); },
      remove: async () => undefined,
      removeForDeletion: () => undefined,
      search: async () => [], rebuild: async () => undefined,
      repairDerivedState: async () => ({ vectorOnlyDeleted: 0, mappingOnlyMarkedStale: 0, invalidMappingsMarkedStale: 0 }),
      healthCheck: async () => ({ available: true, dimensions: 384, indexedCount: indexed.length, validIndexedCount: indexed.length, actualVectorCount: indexed.length, activeAuthoritativeMemoryCount: indexed.length, eligibleAuthoritativeMemoryCount: indexed.length, readyMappingCount: indexed.length, staleMappingCount: 0, deletedMappingCount: 0, mappingWithoutVectorCount: 0, vectorWithoutMappingCount: 0, schemaVersion: 3, filterableMetadataFields: [], orphanCount: 0, distanceMetric: 'cosine' }),
    };
    const provider = { modelId: 'test', version: 1, dimensions: 384, initialize: async () => undefined, dispose: async () => undefined, embedQuery: async () => new Float32Array(384), embedDocuments: async (texts: string[]) => texts.map(() => new Float32Array(384)) };
    const runner = new EmbeddingJobRunner(db, provider, vectors, 3);
    db.setEmbeddingJobNotifier(() => runner.scheduleDrain());
    runner.start();
    for (let index = 0; index < 11; index += 1) {
      const node = createMemoryNode({ companionId: 'ann', type: 'topic', title: `memory ${index}` });
      db.insertMemoryNode({ ...node, id: `memory-${index}`, userId: 'local', memoryType: 'user_fact', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: node.createdAt } });
    }
    await runner.drain();
    expect(indexed).toHaveLength(11);
    expect(runner.getStatus().pendingCount).toBe(0);
    db.close();
  });

  it('snapshots revisions and supersedes pending work without mutating a claimed job', () => {
    const db = new DatabaseService();
    const node = createMemoryNode({ companionId: 'ann', type: 'topic', title: 'first', content: 'first content' });
    db.insertMemoryNode({ ...node, id: 'revision-memory', userId: 'local', memoryType: 'user_fact', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: node.createdAt } });
    const first = db.listPendingEmbeddingJobs();
    expect(first).toHaveLength(1);
    db.updateMemoryNode({ ...node, id: 'revision-memory', userId: 'local', memoryType: 'user_fact', title: 'second', content: 'second content', updatedAt: '2026-07-23T00:00:01.000Z', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: node.createdAt } });
    const latest = db.listPendingEmbeddingJobs();
    expect(latest).toHaveLength(1);
    expect(latest[0].sourceRevision).toBeGreaterThan(first[0].sourceRevision);
    expect(latest[0].sourceContentHash).not.toBe(first[0].sourceContentHash);
    expect(db.getEmbeddingJobCounts().superseded).toBe(1);
    db.close();
  });
});
