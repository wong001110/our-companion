import type { DatabaseService } from '@our-companion/database';
import type { VectorIndex } from '@our-companion/memory-engine';
import type { EmbeddingProvider } from './localEmbeddingProvider';

export class EmbeddingJobRunner {
  constructor(private readonly db: DatabaseService, private readonly embeddings: EmbeddingProvider, private readonly vectors: VectorIndex) {}

  async runPending(limit = 4): Promise<{ completed: number; failed: number }> {
    let completed = 0;
    let failed = 0;
    for (const job of this.db.listPendingEmbeddingJobs(limit)) {
      if (!this.db.claimEmbeddingJob(job.id)) continue;
      try {
        if (job.operation === 'delete') {
          await this.vectors.remove(job.memoryId);
        } else {
          const memory = this.db.getMemoryNode(job.memoryId);
          if (!memory || memory.status !== 'active' || memory.isMarkedWrong) {
            await this.vectors.remove(job.memoryId);
          } else {
            const text = [memory.title, memory.summary, memory.content].filter(Boolean).join('\n');
            const [embedding] = await this.embeddings.embedDocuments([text]);
            await this.vectors.upsert({
              memoryId: memory.id,
              embedding,
              modelId: this.embeddings.modelId,
              modelVersion: this.embeddings.version,
              contentHash: this.db.getMemoryProcessingState(memory.id)?.contentHash,
            });
          }
        }
        this.db.finishEmbeddingJob(job.id);
        completed += 1;
      } catch (error) {
        this.db.finishEmbeddingJob(job.id, error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500));
        failed += 1;
      }
    }
    return { completed, failed };
  }
}
