import { describe, expect, it } from 'vitest';
import { emptyMemoryDraft, memoryDraftFromNode } from './memoryDraft';

describe('memory drafts', () => {
  const node = { id: 'memory-1', type: 'topic' as const, title: 'Correct title', content: 'The saved content stays here.', summary: 'Short summary', importanceScore: 0.5, createdAt: '', updatedAt: '' };

  it('creates separate title, content, and summary fields when editing', () => {
    expect(memoryDraftFromNode(node)).toEqual({ title: 'Correct title', content: 'The saved content stays here.', summary: 'Short summary' });
  });

  it('starts a new memory with all draft fields empty', () => {
    expect(emptyMemoryDraft()).toEqual({ title: '', content: '', summary: '' });
  });
});
