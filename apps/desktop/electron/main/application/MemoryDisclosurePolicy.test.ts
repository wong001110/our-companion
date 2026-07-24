import { describe, expect, it } from 'vitest';
import { assembleCompanionReply, type MemoryNode, type TypedMemoryType } from '@our-companion/shared';
import { renderSafeMemoryText } from './MemoryDisclosurePolicy';

function memory(memoryType: TypedMemoryType, summary = 'A safe, user-facing summary.'): MemoryNode {
  return {
    id: 'internal-memory-id', type: 'topic', memoryType, title: 'Internal title', summary,
    content: 'RAW_PRIVATE_CONTENT_MUST_NEVER_RENDER', importance: 0.8,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    userId: 'local', companionId: 'companion-1', status: 'active',
  };
}

describe('renderSafeMemoryText', () => {
  it.each(['user_fact', 'user_preference', 'goal', 'shared_experience', 'relationship_memory'] as const)(
    'uses the canonical stored summary for %s without exposing raw content or IDs',
    (memoryType) => {
      const value = renderSafeMemoryText(memory(memoryType), 'Tell me more.');
      expect(value).toBe('A safe, user-facing summary.');
      expect(value).not.toContain('RAW_PRIVATE_CONTENT');
      expect(value).not.toContain('internal-memory-id');
    },
  );

  it('renders boundaries as a minimal constraint and never their private explanation', () => {
    const boundary = memory('user_boundary', 'Do not discuss gambling because of a private history.');
    boundary.metadata = {
      userBoundary: { action: 'do_not_discuss', target: 'gambling' },
    } as MemoryNode['metadata'];
    expect(renderSafeMemoryText(boundary, 'What should we discuss?')).toBe('User boundary: Do not discuss gambling.');
  });

  it('refuses non-disclosable or non-canonical Memories instead of falling back to raw fields', () => {
    const privateMemory = memory('user_fact');
    privateMemory.metadata = { sensitivity: 'private' } as MemoryNode['metadata'];
    expect(renderSafeMemoryText(privateMemory, 'hello')).toBeUndefined();
    expect(renderSafeMemoryText(memory('user_fact', ''), 'hello')).toBeUndefined();
  });

  it('assembles the exact application-rendered Memory fact rather than model-authored text', () => {
    const selected = memory('user_preference', 'Prefers local-first processing.');
    const reply = assembleCompanionReply([
      { segmentId: 'opening', provenance: 'current_turn', text: 'Noted: ' },
      { segmentId: 'fact', provenance: 'memory', supportingMemoryId: selected.id },
    ], () => renderSafeMemoryText(selected, 'What do I prefer?'));
    expect(reply).toBe('Noted: Prefers local-first processing.');
  });
});
