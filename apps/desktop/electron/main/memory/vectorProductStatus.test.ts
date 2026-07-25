import { describe, expect, it } from 'vitest';
import { buildMemoryVectorProductStatus } from './vectorProductStatus';

const base = {
  embedding: { state: 'ready', modelId: 'Xenova/multilingual-e5-small', dimensions: 384, runtimeReady: true, manifestValid: true },
  vector: { available: true, dimensions: 384, indexedCount: 12 },
  eligibleCount: 12,
};

describe('buildMemoryVectorProductStatus', () => {
  it('reports ready only when runtime and vector index are ready', () => {
    const result = buildMemoryVectorProductStatus(base);
    expect(result.state).toBe('ready');
    expect(result.localOnly).toBe(true);
    expect(result.lexicalFallbackAvailable).toBe(true);
  });

  it('reports indexing while jobs remain', () => {
    const result = buildMemoryVectorProductStatus({ ...base, jobCounts: { pending: 3 } });
    expect(result.state).toBe('indexing');
    expect(result.pendingJobs).toBe(3);
  });

  it('reports optional not-installed state without disabling lexical fallback', () => {
    const result = buildMemoryVectorProductStatus({
      ...base,
      embedding: { ...base.embedding, state: 'not-installed', runtimeReady: false, manifestValid: false },
      vector: { ...base.vector, available: false, indexedCount: 0, reason: 'extension_unavailable' },
    });
    expect(result.state).toBe('not_installed');
    expect(result.lexicalFallbackAvailable).toBe(true);
  });

  it('reports degraded state when runtime exists but vector is unavailable', () => {
    const result = buildMemoryVectorProductStatus({
      ...base,
      vector: { ...base.vector, available: false, reason: 'maintenance' },
    });
    expect(result.state).toBe('degraded');
  });
});
