import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { createMemoryNode } from '@our-companion/memory-engine';
import { SqliteMemoryContextProvider } from './MemoryContextProvider';

function insertMemory(
  db: DatabaseService,
  input: {
    id: string;
    memoryType: 'user_preference' | 'user_boundary' | 'goal' | 'user_fact';
    summary: string;
    pinned?: boolean;
    wrong?: boolean;
    expiresAt?: string;
    importance?: number;
    companionId?: string;
  },
) {
  const base = createMemoryNode({
    companionId: input.companionId ?? 'ann',
    type: input.memoryType === 'goal' ? 'outcome' : 'topic',
    title: input.summary,
    summary: input.summary,
  });
  return db.insertMemoryNode({
    ...base,
    id: input.id,
    companionId: input.companionId ?? 'ann',
    memoryType: input.memoryType,
    isPinned: input.pinned,
    isMarkedWrong: input.wrong,
    importance: input.importance ?? 0.7,
    metadata: {
      sourceType: 'user_explicit',
      confidence: 0.9,
      sensitivity: 'normal',
      scope: 'companion',
      createdAt: base.createdAt,
      expiresAt: input.expiresAt,
    },
  });
}

describe('SqliteMemoryContextProvider', () => {
  it('builds companion-scoped, bounded, categorized context and filters wrong/expired Memory', async () => {
    const db = new DatabaseService();
    insertMemory(db, { id: 'pinned', memoryType: 'user_fact', summary: 'Building Our Companion', pinned: true });
    insertMemory(db, { id: 'boundary', memoryType: 'user_boundary', summary: 'Do not recommend cloud-only software' });
    insertMemory(db, { id: 'preference', memoryType: 'user_preference', summary: 'Prefers local-first architecture' });
    insertMemory(db, { id: 'goal', memoryType: 'goal', summary: 'Ship the desktop MVP' });
    insertMemory(db, { id: 'relevant', memoryType: 'user_fact', summary: 'PixiJS animation architecture reference' });
    insertMemory(db, { id: 'wrong', memoryType: 'user_preference', summary: 'Prefers cloud software', wrong: true });
    insertMemory(db, {
      id: 'expired',
      memoryType: 'user_fact',
      summary: 'Temporary old context',
      expiresAt: '2026-07-17T00:00:00.000Z',
    });
    insertMemory(db, {
      id: 'other',
      memoryType: 'user_fact',
      summary: 'Other Companion secret',
      companionId: 'other',
    });

    const provider = new SqliteMemoryContextProvider(db, () => new Date('2026-07-18T00:00:00.000Z'));
    const context = await provider.buildContext({
      companionId: 'ann',
      message: 'How should PixiJS animation work?',
      maxItems: 5,
      maxCharacters: 1_000,
    });
    expect(context.pinned.map((item) => item.memoryId)).toEqual(['pinned']);
    expect(context.boundaries.map((item) => item.memoryId)).toEqual(['boundary']);
    expect(context.preferences.map((item) => item.memoryId)).toEqual(['preference']);
    expect(context.goals.map((item) => item.memoryId)).toEqual(['goal']);
    expect(context.relevant.map((item) => item.memoryId)).toContain('relevant');
    expect(context.selectedCount).toBeLessThanOrEqual(5);
    expect(JSON.stringify(context)).not.toContain('wrong');
    expect(JSON.stringify(context)).not.toContain('expired');

    const clamped = await provider.buildContext({
      companionId: 'ann',
      message: 'architecture',
      maxItems: 1_000,
      maxCharacters: 1_000_000,
    });
    expect(clamped.maxItems).toBe(20);
    expect(clamped.maxCharacters).toBe(6_000);
    db.close();
  });
});
