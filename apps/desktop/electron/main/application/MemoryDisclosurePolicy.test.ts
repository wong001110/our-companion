import { describe, expect, it } from 'vitest';
import type { MemoryNode, TypedMemoryType } from '@our-companion/shared';
import { renderMemoryPromptConstraint, renderUserFacingMemoryText, resolveCanonicalMemoryRepresentation } from './MemoryDisclosurePolicy';

function memory(memoryType: TypedMemoryType, canonical = 'I prefer quiet cafes.'): MemoryNode {
  return {
    id: 'internal-memory-id', type: 'topic', memoryType, title: 'RAW_TITLE', summary: 'UNVERIFIED_MODEL_SUMMARY',
    content: 'RAW_PRIVATE_CONTENT', importance: 0.8, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', userId: 'local', companionId: 'companion-1', status: 'active',
    metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity: 'normal', scope: 'companion', createdAt: '2026-01-01T00:00:00.000Z', canonicalText: canonical, canonicalSource: memoryType === 'relationship_memory' ? 'user_confirmed' : 'exact_user_evidence' },
  };
}

describe('canonical Memory rendering', () => {
  it.each(['user_fact', 'user_preference', 'goal', 'shared_experience', 'relationship_memory'] as const)('renders canonical evidence, not model summary, for %s', (type) => {
    const value = renderUserFacingMemoryText(memory(type));
    expect(value).toBe('You previously said: “I prefer quiet cafes.”');
    expect(value).not.toContain('UNVERIFIED_MODEL_SUMMARY');
    expect(value).not.toContain('RAW_PRIVATE_CONTENT');
    expect(value).not.toContain('internal-memory-id');
  });

  it('keeps boundary targets in the prompt constraint but out of normal displayed text', () => {
    const boundary = memory('user_boundary');
    boundary.metadata = { ...boundary.metadata!, canonicalSource: 'deterministic_boundary', userBoundary: { action: 'do_not_mention', target: 'medical history' } };
    expect(renderMemoryPromptConstraint(boundary)).toContain('medical history');
    expect(renderUserFacingMemoryText(boundary)).toBe('I’ll respect that boundary.');
    expect(renderUserFacingMemoryText(boundary)).not.toContain('medical history');
  });

  it('rejects private, sensitive, missing-canonical, and unconfirmed relationship records', () => {
    const privateMemory = memory('user_fact');
    privateMemory.metadata = { ...privateMemory.metadata!, sensitivity: 'private' };
    expect(renderUserFacingMemoryText(privateMemory)).toBeUndefined();
    const missing = memory('user_fact');
    delete missing.metadata!.canonicalText;
    delete missing.metadata!.canonicalSource;
    expect(renderUserFacingMemoryText(missing)).toBeUndefined();
    const relationship = memory('relationship_memory');
    relationship.metadata = { ...relationship.metadata!, canonicalSource: 'exact_user_evidence' };
    expect(renderUserFacingMemoryText(relationship)).toBeUndefined();
  });

  it('lazily recognizes only legacy content proven within retained evidence', () => {
    const legacy = memory('user_fact');
    delete legacy.metadata!.canonicalText;
    delete legacy.metadata!.canonicalSource;
    legacy.content = 'I prefer tea.';
    legacy.metadata!.userEvidence = 'Earlier I said: I prefer tea.';
    expect(resolveCanonicalMemoryRepresentation(legacy)).toEqual({ canonicalText: 'I prefer tea.', canonicalSource: 'exact_user_evidence' });
    legacy.metadata!.userEvidence = 'unrelated';
    expect(resolveCanonicalMemoryRepresentation(legacy)).toBeUndefined();
  });
});
