import type {
  CuriosityCandidate,
  DiscoveryJob,
  DiscoveryJobStatus,
  DiscoveryQueueQuery,
  DiscoveryResult,
  ExplorationPlanV2,
  DiscoveryEvidence,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import {
  addToQueue,
  removeFromQueue,
  getNextJob,
  retryJob,
  cancelJob,
  filterByStatus,
  filterByMinPriority,
} from './discovery-queue';
import { createExplorationPlan } from './discovery-planner';
import { createEvidence } from './discovery-evidence';
import { generateDiscoveryResult } from './discovery-result';
import { MAX_RETRIES } from './types';

export class DiscoveryEngine {
  private queue: Map<string, DiscoveryJob> = new Map();
  private results: Map<string, DiscoveryResult> = new Map();
  private plans: Map<string, ExplorationPlanV2> = new Map();

  createDiscoveryJob(curiosityId: string, priority: number, topics: string[] = []): DiscoveryJob {
    const timestamp = nowIso();
    const job: DiscoveryJob = {
      id: createId('discovery_job'),
      sourceCuriosityId: curiosityId,
      status: 'pending',
      priority,
      strategy: 'default',
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      evidence: [],
      confidence: 0,
      relatedTopics: topics,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.queue.set(job.id, job);
    return job;
  }

  planDiscovery(jobId: string, curiosityTarget: CuriosityCandidate): ExplorationPlanV2 | undefined {
    const job = this.queue.get(jobId);
    if (!job) return undefined;

    const plan = createExplorationPlan(curiosityTarget, {
      userInterests: [],
      recentMemoryTags: [],
    });

    this.plans.set(jobId, plan);

    this.queue.set(jobId, {
      ...job,
      status: 'planning',
      strategy: plan.objective,
      updatedAt: nowIso(),
    });

    return plan;
  }

  executeDiscovery(jobId: string): DiscoveryJob | undefined {
    const job = this.queue.get(jobId);
    if (!job) return undefined;

    const evidence: DiscoveryEvidence[] = [
      createEvidence({
        title: 'Sample finding',
        source: 'exploration',
        snippet: 'This is a sample discovery result.',
        relevance: 0.7,
        confidence: 0.6,
      }),
    ];

    const updatedJob: DiscoveryJob = {
      ...job,
      status: 'running',
      startedAt: job.startedAt ?? nowIso(),
      evidence,
      updatedAt: nowIso(),
    };

    this.queue.set(jobId, updatedJob);
    return updatedJob;
  }

  completeDiscovery(jobId: string): DiscoveryResult | undefined {
    const job = this.queue.get(jobId);
    if (!job) return undefined;

    const result = generateDiscoveryResult(job, job.evidence);

    const completedJob: DiscoveryJob = {
      ...job,
      status: 'completed',
      finishedAt: nowIso(),
      summary: result.summary,
      confidence: result.confidence,
      updatedAt: nowIso(),
    };

    this.queue.set(jobId, completedJob);
    this.results.set(jobId, result);

    return result;
  }

  cancelDiscovery(jobId: string): void {
    const job = this.queue.get(jobId);
    if (!job) return;

    this.queue.set(jobId, cancelJob(job));
  }

  retryDiscovery(jobId: string): DiscoveryJob | undefined {
    const job = this.queue.get(jobId);
    if (!job) return undefined;

    const retried = retryJob(job);
    this.queue.set(jobId, retried);
    return retried;
  }

  getDiscoveryQueue(query?: DiscoveryQueueQuery): DiscoveryJob[] {
    let queue = Array.from(this.queue.values());

    if (query?.statuses && query.statuses.length > 0) {
      queue = filterByStatus(queue, query.statuses);
    }

    if (query?.minPriority !== undefined) {
      queue = filterByMinPriority(queue, query.minPriority);
    }

    queue.sort((a, b) => b.priority - a.priority);

    if (query?.limit) {
      queue = queue.slice(0, query.limit);
    }

    return queue;
  }

  getDiscoveryResult(jobId: string): DiscoveryResult | undefined {
    return this.results.get(jobId);
  }

  getNextJob(): DiscoveryJob | undefined {
    const queue = Array.from(this.queue.values());
    return getNextJob(queue);
  }
}
