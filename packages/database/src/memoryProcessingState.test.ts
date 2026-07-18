import { describe, expect, it } from 'vitest';
import { DatabaseService } from './index';

describe('Memory processing state', () => {
  it('tracks dirty revisions, processing, no-op writes, and deletion tombstones', () => {
    const db = new DatabaseService();
    const memory = db.insertMemoryNode({
      id: 'memory-1',
      companionId: 'ann',
      type: 'topic',
      title: 'Local-first software',
      summary: 'Prefers local-first software',
      importance: 0.7,
      isPinned: false,
      isMarkedWrong: false,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
    expect(db.getMemoryProcessingState(memory.id)).toMatchObject({
      companionId: 'ann',
      revision: 1,
      processedRevision: 0,
    });
    expect(db.listDirtyMemoryProcessing('ann').map((state) => state.memoryId)).toEqual([memory.id]);

    db.markMemoriesProcessed([memory.id], '2026-07-18T00:00:00.000Z');
    expect(db.getMemoryProcessingState(memory.id)).toMatchObject({
      revision: 1,
      processedRevision: 1,
      processedAt: '2026-07-18T00:00:00.000Z',
    });

    db.updateMemoryNode({ ...memory, updatedAt: '2026-07-18T01:00:00.000Z' });
    expect(db.getMemoryProcessingState(memory.id)).toMatchObject({
      revision: 1,
      processedRevision: 1,
    });

    db.updateMemoryNode({
      ...memory,
      summary: 'Strongly prefers local-first software',
      updatedAt: '2026-07-18T02:00:00.000Z',
    });
    expect(db.getMemoryProcessingState(memory.id)).toMatchObject({
      revision: 2,
      processedRevision: 1,
    });

    db.deleteMemoryNode(memory.id);
    expect(db.getMemoryProcessingState(memory.id)).toMatchObject({
      revision: 3,
      processedRevision: 1,
    });
    expect(db.getMemoryProcessingState(memory.id)?.deletedAt).toBeTruthy();
    expect(db.listDirtyMemoryProcessing('ann')).toHaveLength(1);
    db.close();
  });
});
