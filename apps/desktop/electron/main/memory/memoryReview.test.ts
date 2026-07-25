import { describe, expect, it } from 'vitest';
import type { MemoryNode, MemoryReviewItem } from '@our-companion/shared';
import { applyMemoryReviewUpdate, filterMemoryReviewItems, toMemoryReviewItem } from './memoryReview';

const AT = '2026-07-25T00:00:00.000Z';

function memory(id: string, title: string): MemoryNode {
  return {
    id,
    type: 'topic',
    title,
    summary: title,
    importance: 0.8,
    memoryType: 'goal',
    status: 'active',
    confidence: 0.9,
    metadata: {
      sourceType: 'user_explicit',
      confidence: 0.9,
      sensitivity: 'normal',
      scope: 'companion',
      createdAt: AT,
      canonicalText: title,
      canonicalSource: 'exact_user_evidence',
    },
    createdAt: AT,
    updatedAt: AT,
  };
}

describe('memory review helpers', () => {
  it('maps provenance without exposing canonical text', () => {
    const item = toMemoryReviewItem(memory('m1', 'Ship the local-first memory milestone'));
    expect(item.reviewState).toBe('unreviewed');
    expect(item.sourceType).toBe('user_explicit');
    expect(item.canonicalSource).toBe('exact_user_evidence');
    expect(item).not.toHaveProperty('canonicalText');
  });

  it('pauses disputed memory without changing its content', () => {
    const original = memory('m1', 'Ship the local-first memory milestone');
    const updated = applyMemoryReviewUpdate(original, { id: original.id, state: 'user_disputed', note: 'This is no longer correct.' }, '2026-07-25T01:00:00.000Z');
    expect(updated.status).toBe('review_pending');
    expect(updated.title).toBe(original.title);
    expect(updated.metadata?.reviewState).toBe('user_disputed');
  });

  it('restores confirmed memory to active use', () => {
    const paused = applyMemoryReviewUpdate(memory('m1', 'Keep the local-first design'), { id: 'm1', state: 'needs_confirmation' }, '2026-07-25T01:00:00.000Z');
    const confirmed = applyMemoryReviewUpdate(paused, { id: 'm1', state: 'confirmed' }, '2026-07-25T02:00:00.000Z');
    expect(confirmed.status).toBe('active');
    expect(confirmed.metadata?.lastConfirmedAt).toBe('2026-07-25T02:00:00.000Z');
  });

  it('filters and sorts review items deterministically', () => {
    const items: MemoryReviewItem[] = [
      { ...toMemoryReviewItem(memory('b', 'Unrelated')), isPinned: false },
      { ...toMemoryReviewItem(memory('a', 'Vector memory quality')), isPinned: true },
    ];
    expect(filterMemoryReviewItems(items, { search: 'vector' }).map((item) => item.id)).toEqual(['a']);
  });
});
