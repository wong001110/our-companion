import { describe, expect, it } from 'vitest';
import { EMBEDDING_TEXT_POLICY, LocalMultilingualEmbeddingProvider } from './localEmbeddingProvider';

describe('LocalMultilingualEmbeddingProvider', () => {
  it('reports an unavailable missing local cache without downloading a model', async () => {
    const provider = new LocalMultilingualEmbeddingProvider('.our-companion-test-missing-e5-cache');

    await expect(provider.initialize()).rejects.toThrow('LOCAL_EMBEDDING_MODEL_NOT_INSTALLED');
    expect(provider.getStatus()).toMatchObject({
      state: 'not-installed',
      modelId: 'Xenova/multilingual-e5-small',
      dimensions: 384,
    });
    expect(EMBEDDING_TEXT_POLICY).toEqual({
      maxTokens: 512,
      queryPrefix: 'query: ',
      documentPrefix: 'passage: ',
      pooling: 'mean',
      normalize: true,
    });
  });
});
