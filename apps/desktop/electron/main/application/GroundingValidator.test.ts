import { describe, expect, it } from 'vitest';
import type { GroundedReplySegment, MemoryNode } from '@our-companion/shared';
import { GroundingValidator } from './GroundingValidator';

const embeddings = {
  dimensions: 384,
  embedQuery: async (text: string) => vector(text),
  embedDocuments: async (texts: string[]) => texts.map(vector),
  getStatus: () => ({ state: 'ready', modelId: 'Xenova/multilingual-e5-small' }),
};
function vector(text: string): Float32Array {
  const gambling = /gambl|赌博|perjudian|ギャンブル/iu.test(text);
  const hiking = /hiking|mountain/iu.test(text);
  const output = new Float32Array(384);
  output[gambling ? 0 : hiking ? 1 : 2] = 1;
  return output;
}
function memory(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return { id: 'memory-1', type: 'topic', title: 'Gambling boundary', content: 'Do not recommend gambling-related content.', importance: 0.8, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', userId: 'local', companionId: 'companion-1', memoryType: 'user_boundary', status: 'active', ...overrides };
}
function segment(overrides: Partial<GroundedReplySegment> = {}): GroundedReplySegment {
  return { segmentId: 'segment-1', provenance: 'memory', supportingMemoryId: 'memory-1', ...overrides } as GroundedReplySegment;
}
function validate(segments: GroundedReplySegment[], memories = [memory()], ids = ['memory-1']) {
  return new GroundingValidator(embeddings).validate({ segments, selectedMemories: memories, selectedMemoryIds: ids, userId: 'local', companionId: 'companion-1', currentUserMessage: 'Please suggest a movie.' });
}

describe('GroundingValidator', () => {
  it.each(['Do not recommend gambling-related content.', '不要推荐赌博相关内容。', 'Jangan cadangkan kandungan berkaitan perjudian.', 'ギャンブル関連の内容をおすすめしないでください。', 'Please jangan cadangkan 赌博 content.'])('accepts supported multilingual memory segments: %s', async (text) => {
    await expect(validate([segment({ text })])).resolves.toMatchObject({ passed: true, segments: [{ valid: true }] });
  });

  it('rejects deterministic scope, lifecycle, disclosure, eligibility, and rendering failures', async () => {
    const cases: Array<[GroundedReplySegment, MemoryNode[], string[], string]> = [
      [segment({ supportingMemoryId: 'invented' }), [memory()], ['memory-1'], 'MEMORY_ID_NOT_SELECTED'],
      [segment(), [memory({ userId: 'other' })], ['memory-1'], 'MEMORY_SCOPE_MISMATCH'],
      [segment(), [memory({ status: 'archived' })], ['memory-1'], 'MEMORY_INACTIVE'],
      [segment(), [memory({ isMarkedWrong: true })], ['memory-1'], 'MEMORY_MARKED_WRONG'],
      [segment(), [memory({ metadata: { sensitivity: 'sensitive' } as MemoryNode['metadata'] })], ['memory-1'], 'MEMORY_NOT_DISCLOSABLE'],
      [segment(), [memory({ memoryType: 'temporary_context' })], ['memory-1'], 'MEMORY_TYPE_MISMATCH'],
      [segment(), [memory({ memoryType: 'user_fact', summary: '', title: '', content: '' })], ['memory-1'], 'MEMORY_NOT_RENDERABLE'],
    ];
    for (const [item, memories, ids, reason] of cases) expect((await validate([item], memories, ids)).segments[0]?.reason).toBe(reason);
  });

  it('flags undeclared Memory use but leaves generic advice alone', async () => {
    await expect(validate([{ segmentId: 'undeclared', text: 'Do not recommend gambling-related content.', provenance: 'general_knowledge' }])).resolves.toMatchObject({ passed: false, segments: [expect.objectContaining({ reason: 'UNDECLARED_MEMORY_USAGE' })] });
    await expect(validate([{ segmentId: 'generic', text: 'Take a short break and drink water.', provenance: 'general_knowledge' }])).resolves.toMatchObject({ passed: true });
  });

  it('fails closed after an audit runtime failure with selected Memory, but preserves ordinary conversation', async () => {
    const unavailable = new GroundingValidator({ embedQuery: async () => { throw new Error('LOCAL_EMBEDDING_MODEL_NOT_INSTALLED'); }, embedDocuments: async () => { throw new Error('LOCAL_EMBEDDING_MODEL_NOT_INSTALLED'); }, getStatus: () => ({ state: 'not-installed', modelId: 'Xenova/multilingual-e5-small' }) });
    await expect(unavailable.validate({ segments: [segment(), { segmentId: 'ordinary-after-memory', text: 'Hello!', provenance: 'current_turn' }], selectedMemories: [memory()], selectedMemoryIds: ['memory-1'], userId: 'local', companionId: 'companion-1', currentUserMessage: 'hello' })).resolves.toMatchObject({ passed: false, embeddingAvailable: false, segments: expect.arrayContaining([expect.objectContaining({ reason: 'GROUNDING_EMBEDDING_UNAVAILABLE' })]) });
    await expect(unavailable.validate({ segments: [{ segmentId: 'ordinary', text: 'Hello!', provenance: 'current_turn' }], selectedMemories: [], selectedMemoryIds: [], userId: 'local', companionId: 'companion-1', currentUserMessage: 'hello' })).resolves.toMatchObject({ passed: true });
  });

  it.each(['query', 'document', 'dimension'] as const)('fails closed when %s validation fails after a successful preflight', async (failure) => {
    let queries = 0;
    let documents = 0;
    const provider = {
      dimensions: 384,
      embedQuery: async () => {
        queries += 1;
        if (failure === 'query' && queries >= 3) throw new Error('ONNX inference failed');
        return new Float32Array(failure === 'dimension' && queries >= 3 ? 383 : 384);
      },
      embedDocuments: async () => {
        documents += 1;
        if (failure === 'document' && documents >= 2) throw new Error('document embedding failed');
        return [new Float32Array(384)];
      },
      getStatus: () => ({ state: 'ready', modelId: 'Xenova/multilingual-e5-small' }),
    };
    const validator = new GroundingValidator(provider);
    await expect(validator.ensureAvailable()).resolves.toMatchObject({ available: true });
    const result = await validator.validate({
      segments: [segment(), { segmentId: 'ordinary', text: 'Hello!', provenance: 'current_turn' }],
      selectedMemories: [memory()], selectedMemoryIds: ['memory-1'], userId: 'local', companionId: 'companion-1', currentUserMessage: 'hello',
    });
    expect(result).toMatchObject({ passed: false, embeddingAvailable: false });
    expect(result.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ segmentId: 'ordinary', valid: false, reason: 'GROUNDING_EMBEDDING_UNAVAILABLE' }),
    ]));
  });
});
