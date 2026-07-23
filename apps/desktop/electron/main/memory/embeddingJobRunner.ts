import type { DatabaseService } from '@our-companion/database';
import type { VectorIndex } from '@our-companion/memory-engine';
import type { EmbeddingProvider } from './localEmbeddingProvider';

export interface EmbeddingQueueStatus {
  running: boolean; scheduled: boolean; drainRequested: boolean; paused: boolean; processedInCurrentRun: number; pendingCount: number; processingCount: number; failedCount: number;
  lastRunAt?: string; lastError?: string;
}
export type WorkerLifecycleState = 'running' | 'stopping' | 'stopped' | 'detached';

/** Single-flight, main-process worker. It yields between small batches so chat stays responsive. */
export class EmbeddingJobRunner {
  private running = false;
  private scheduled = false;
  private drainRequested = false;
  private paused = false;
  private writesAllowed = true;
  private stopped = false;
  private lifecycle: WorkerLifecycleState = 'stopped';
  private processedInCurrentRun = 0;
  private lastRunAt?: string;
  private lastError?: string;
  private drainPromise?: Promise<void>;
  constructor(private readonly db: DatabaseService, private readonly embeddings: EmbeddingProvider, private readonly vectors: VectorIndex, private readonly batchSize = 8, private readonly maxAttempts = 3) {}

  start(): void { this.stopped = false; this.writesAllowed = true; this.lifecycle = 'running'; this.scheduleDrain(); }
  scheduleDrain(): void {
    if (this.stopped) return;
    this.drainRequested = true;
    if (this.paused || this.scheduled || this.running) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; void this.drain(); });
  }
  async stop(): Promise<void> { this.stopped = true; this.lifecycle = 'stopping'; await this.drainPromise; if (this.writesAllowed) this.lifecycle = 'stopped'; }
  /** Used after a bounded shutdown timeout so late inference cannot touch SQLite. */
  preventFurtherWrites(): void { this.stopped = true; this.writesAllowed = false; this.lifecycle = 'detached'; }
  async pauseAndWait(): Promise<void> { this.paused = true; await this.drainPromise; }
  resume(): void { this.paused = false; this.scheduleDrain(); }
  getStatus(): EmbeddingQueueStatus {
    const counts = this.db.getEmbeddingJobCounts();
    return { running: this.running, scheduled: this.scheduled, drainRequested: this.drainRequested, paused: this.paused, processedInCurrentRun: this.processedInCurrentRun, pendingCount: counts.pending ?? 0, processingCount: counts.processing ?? 0, failedCount: counts.failed ?? 0, lastRunAt: this.lastRunAt, lastError: this.lastError };
  }
  async drain(): Promise<void> {
    if (this.running) return this.drainPromise;
    this.drainPromise = this.drainInternal().finally(() => { this.drainPromise = undefined; });
    return this.drainPromise;
  }
  private async drainInternal(): Promise<void> {
    this.running = true; this.processedInCurrentRun = 0; this.lastError = undefined;
    try {
      while (this.writesAllowed && !this.stopped && !this.paused) {
        const jobs = this.db.listPendingEmbeddingJobs(this.batchSize);
        if (!jobs.length) { this.drainRequested = false; break; }
        this.drainRequested = false;
        for (const job of jobs) {
          if (!this.writesAllowed || this.stopped || this.paused) break;
          if (!this.db.claimEmbeddingJob(job.id)) continue;
          try {
            if (!this.writesAllowed) return;
            if (!this.db.isEmbeddingJobCurrent(job.memoryId, job.sourceRevision, job.sourceContentHash)) {
              this.db.supersedeEmbeddingJob(job.id);
              continue;
            }
            if (job.operation === 'delete') {
              await this.vectors.remove(job.memoryId);
            } else {
              const memory = this.db.getMemoryNode(job.memoryId);
              if (!memory || memory.status !== 'active' || memory.isMarkedWrong) await this.vectors.remove(job.memoryId);
              else {
                const [embedding] = await this.embeddings.embedDocuments([[memory.title, memory.summary, memory.content].filter(Boolean).join('\n')]);
                // Inference is asynchronous.  Recheck the immutable source
                // snapshot before committing; vector upsert repeats this check
                // inside its SQLite transaction to close the delete/update race.
                if (!this.writesAllowed) return;
                if (!this.db.isEmbeddingJobCurrent(job.memoryId, job.sourceRevision, job.sourceContentHash)) {
                  this.db.supersedeEmbeddingJob(job.id);
                  continue;
                }
                await this.vectors.upsert({ memoryId: memory.id, embedding, modelId: this.embeddings.modelId, modelVersion: this.embeddings.version, contentHash: job.sourceContentHash, sourceRevision: job.sourceRevision, userId: memory.userId, companionId: memory.companionId, memoryType: memory.memoryType, memoryStatus: memory.status });
              }
            }
            if (!this.writesAllowed) return;
            this.db.finishEmbeddingJob(job.id); this.processedInCurrentRun += 1;
          } catch (error) {
            if (!this.writesAllowed) return;
            const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
            this.lastError = message;
            if (message.startsWith('MEMORY_REVISION_STALE')) {
              this.db.supersedeEmbeddingJob(job.id);
              this.db.ensureLatestEmbeddingJob(job.memoryId);
            } else if (message.startsWith('LOCAL_EMBEDDING_MODEL_NOT_INSTALLED')) this.db.blockEmbeddingJob(job.id, message);
            else if (/VECTOR_DIMENSION_MISMATCH|MISSING|ineligible/i.test(message) || job.attempts + 1 >= this.maxAttempts) this.db.finishEmbeddingJob(job.id, message);
            else { this.db.requeueEmbeddingJob(job.id, message); await new Promise((resolve) => setTimeout(resolve, 25 * (job.attempts + 1))); }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      this.running = false; this.lastRunAt = new Date().toISOString();
      if (this.lifecycle === 'stopping' && this.writesAllowed) this.lifecycle = 'stopped';
      // A request arriving after the last empty poll is remembered rather than
      // discarded while this cycle was still marked running.
      if (!this.stopped && !this.paused && this.drainRequested) this.scheduleDrain();
    }
  }
}
