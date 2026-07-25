import type { MemoryVectorProductStatus } from '@our-companion/shared';

export interface MemoryVectorProductStatusInput {
  embedding: {
    state: string;
    modelId: string;
    dimensions: number;
    runtimeReady?: boolean;
    manifestValid?: boolean;
    offlineVerified?: boolean;
    error?: string;
  };
  vector: {
    available: boolean;
    dimensions: number;
    indexedCount: number;
    reason?: string;
  };
  jobCounts?: Readonly<Record<string, number>>;
  eligibleCount: number;
}

function count(input: Readonly<Record<string, number>> | undefined, ...keys: string[]): number {
  for (const key of keys) {
    const value = input?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  }
  return 0;
}

export function buildMemoryVectorProductStatus(
  input: MemoryVectorProductStatusInput,
): MemoryVectorProductStatus {
  const pendingJobs = count(input.jobCounts, 'pending', 'queued', 'waiting');
  const runningJobs = count(input.jobCounts, 'running', 'processing');
  const failedJobs = count(input.jobCounts, 'failed', 'blocked');
  const manifestValid = Boolean(input.embedding.manifestValid);
  const runtimeReady = Boolean(input.embedding.runtimeReady || input.embedding.state === 'ready');
  let state: MemoryVectorProductStatus['state'];
  if (input.embedding.state === 'installing') state = 'installing';
  else if (input.embedding.state === 'not-installed' || input.embedding.state === 'loading') state = 'not_installed';
  else if (input.embedding.state === 'error') state = 'error';
  else if (runtimeReady && input.vector.available && (pendingJobs > 0 || runningJobs > 0)) state = 'indexing';
  else if (runtimeReady && input.vector.available && failedJobs === 0) state = 'ready';
  else if (runtimeReady) state = 'degraded';
  else state = 'not_installed';

  const message = state === 'ready'
    ? 'Semantic Memory is ready.'
    : state === 'indexing'
      ? 'Semantic Memory is updating its local index.'
      : state === 'installing'
        ? 'The local embedding model is being installed.'
        : state === 'not_installed'
          ? 'Semantic Memory is optional and is not installed yet.'
          : state === 'degraded'
            ? 'Semantic Memory is partially available; lexical and structured retrieval remain active.'
            : 'Semantic Memory needs attention; lexical and structured retrieval remain active.';

  return {
    state,
    modelId: input.embedding.modelId,
    dimensions: input.embedding.dimensions || input.vector.dimensions,
    indexedCount: input.vector.indexedCount,
    eligibleCount: Math.max(0, Math.floor(input.eligibleCount)),
    pendingJobs,
    runningJobs,
    failedJobs,
    runtimeReady,
    manifestValid,
    offlineVerified: Boolean(input.embedding.offlineVerified),
    localOnly: true,
    lexicalFallbackAvailable: true,
    message,
    lastError: input.embedding.error ?? input.vector.reason,
  };
}
