import { describe, expect, it } from 'vitest';
import type { GroundedClaim, MemoryNode } from '@our-companion/shared';
import { GroundingValidator } from './GroundingValidator';

const embeddings = {
  embedQuery: async (text: string) => vector(text),
  embedDocuments: async (texts: string[]) => texts.map(vector),
};

function vector(text: string): Float32Array {
  // Deterministic fixture adapter: each translation below represents the same
  // boundary. Production validation always uses LocalMultilingualEmbeddingProvider.
  const gambling = /gambl|赌博|perjudian|ギャンブル/iu.test(text);
  return gambling ? new Float32Array([1, 0]) : new Float32Array([0, 1]);
}

function memory(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: 'memory-1', type: 'topic', title: 'Gambling boundary', content: 'Do not recommend gambling-related content.',
    importance: 0.8, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    userId: 'local', companionId: 'companion-1', memoryType: 'user_boundary', status: 'active', ...overrides,
  };
}

function claim(overrides: Partial<GroundedClaim> = {}): GroundedClaim {
  return { claimId: 'claim-1', text: 'Do not recommend gambling-related content.', type: 'user_boundary', supportingMemoryIds: ['memory-1'], ...overrides };
}

describe('GroundingValidator', () => {
  it.each([
    'Do not recommend gambling-related content.',
    '不要推荐赌博相关内容。',
    'Jangan cadangkan kandungan berkaitan perjudian.',
    'ギャンブル関連の内容をおすすめしないでください。',
    'Please jangan cadangkan 赌博 content.',
  ])('accepts a semantically supported multilingual boundary claim: %s', async (text) => {
    const result = await new GroundingValidator(embeddings).validate({ claims: [claim({ text })], selectedMemories: [memory()], selectedMemoryIds: ['memory-1'], userId: 'local', companionId: 'companion-1' });
    expect(result).toMatchObject({ passed: true, claims: [{ valid: true }] });
  });

  it('rejects selected-ID, scope, lifecycle, disclosure, type, and semantic failures deterministically', async () => {
    const validator = new GroundingValidator(embeddings);
    const cases: Array<[GroundedClaim, MemoryNode[], string[], string]> = [
      [claim({ supportingMemoryIds: ['invented'] }), [memory()], ['memory-1'], 'MEMORY_ID_NOT_SELECTED'],
      [claim(), [memory({ userId: 'another-user' })], ['memory-1'], 'MEMORY_SCOPE_MISMATCH'],
      [claim(), [memory({ status: 'archived' })], ['memory-1'], 'MEMORY_INACTIVE'],
      [claim(), [memory({ isMarkedWrong: true })], ['memory-1'], 'MEMORY_MARKED_WRONG'],
      [claim(), [memory({ metadata: { sensitivity: 'sensitive' } as MemoryNode['metadata'] })], ['memory-1'], 'MEMORY_NOT_DISCLOSABLE'],
      [claim({ type: 'user_preference' }), [memory()], ['memory-1'], 'MEMORY_TYPE_MISMATCH'],
      [claim({ text: 'The user prefers mountain hiking.' }), [memory()], ['memory-1'], 'MEMORY_SEMANTIC_SUPPORT_TOO_LOW'],
    ];
    for (const [item, memories, ids, reason] of cases) {
      const result = await validator.validate({ claims: [item], selectedMemories: memories, selectedMemoryIds: ids, userId: 'local', companionId: 'companion-1' });
      expect(result.claims[0]?.reason).toBe(reason);
    }
  });
});
