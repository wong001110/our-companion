import type { DatabaseService } from '@our-companion/database';
import type { VectorIndex } from '@our-companion/memory-engine';
import type { EmbeddingProvider } from './localEmbeddingProvider';

export interface EmbeddingQueueStatus {
  running: boolean; scheduled: boolean; processedInCurrentRun: number; pendingCount: number; processingCount: number; failedCount: number;
  lastRunAt?: string; lastError?: string;
}

/** Single-flight, main-process worker. It yields between small batches so chat stays responsive. */
export class EmbeddingJobRunner {
  private running = false;
  private scheduled = false;
  private stopped = false;
  private processedInCurrentRun = 0;
  private lastRunAt?: string;
  private lastError?: string;
  private drainPromise?: Promise<void>;
  constructor(private readonly db: DatabaseService, private readonly embeddings: EmbeddingProvider, private readonly vectors: VectorIndex, private readonly batchSize = 8, private readonly maxAttempts = 3) {}

  start(): void { this.stopped = false; this.scheduleDrain(); }
  scheduleDrain(): void {
    if (this.stopped || this.scheduled || this.running) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; void this.drain(); });
  }
  async stop(): Promise<void> { this.stopped = true; await this.drainPromise; }
  getStatus(): EmbeddingQueueStatus {
    const counts = this.db.getEmbeddingJobCounts();
    return { running: this.running, scheduled: this.scheduled, processedInCurrentRun: this.processedInCurrentRun, pendingCount: counts.pending ?? 0, processingCount: counts.processing ?? 0, failedCount: counts.failed ?? 0, lastRunAt: this.lastRunAt, lastError: this.lastError };
  }
  async drain(): Promise<void> {
    if (this.running) return this.drainPromise;
    this.drainPromise = this.drainInternal().finally(() => { this.drainPromise = undefined; });
    return this.drainPromise;
  }
  private async drainInternal(): Promise<void> {
    this.running = true; this.processedInCurrentRun = 0; this.lastError = undefined;
    try {
      while (!this.stopped) {
        const jobs = this.db.listPendingEmbeddingJobs(this.batchSize);
        if (!jobs.length) break;
        for (const job of jobs) {
          if (this.stopped) break;
          if (!this.db.claimEmbeddingJob(job.id)) continue;
          try {
            if (job.operation === 'delete') {
              await this.vectors.remove(job.memoryId);
            } else {
              const memory = this.db.getMemoryNode(job.memoryId);
              if (!memory || memory.status !== 'active' || memory.isMarkedWrong) await this.vectors.remove(job.memoryId);
              else {
                const [embedding] = await this.embeddings.embedDocuments([[memory.title, memory.summary, memory.content].filter(Boolean).join('\n')]);
                await this.vectors.upsert({ memoryId: memory.id, embedding, modelId: this.embeddings.modelId, modelVersion: this.embeddings.version, contentHash: this.db.getMemoryProcessingState(memory.id)?.contentHash, userId: memory.userId, companionId: memory.companionId, memoryType: memory.memoryType, memoryStatus: memory.status });
              }
            }
            this.db.finishEmbeddingJob(job.id); this.processedInCurrentRun += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
            this.lastError = message;
            if (message.startsWith('LOCAL_EMBEDDING_MODEL_NOT_INSTALLED')) this.db.blockEmbeddingJob(job.id, message);
            else if (/VECTOR_DIMENSION_MISMATCH|MISSING|ineligible/i.test(message) || job.attempts + 1 >= this.maxAttempts) this.db.finishEmbeddingJob(job.id, message);
            else { this.db.requeueEmbeddingJob(job.id, message); await new Promise((resolve) => setTimeout(resolve, 25 * (job.attempts + 1))); }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally { this.running = false; this.lastRunAt = new Date().toISOString(); }
  }
}
