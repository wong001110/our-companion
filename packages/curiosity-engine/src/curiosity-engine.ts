import type {
  CuriosityCandidate,
  CuriosityCandidateStatus,
  CuriosityQueueQuery,
  MemoryRecord,
  PatternV2,
  InsightV2,
} from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import {
  addToQueue,
  removeFromQueue,
  getTopCandidates,
  deduplicateQueue,
  expireStaleCandidates,
  filterByStatus,
  filterByMinPriority,
} from './queue-manager';
import {
  generateFromMemories,
  generateFromPatterns,
  generateFromInsights,
  generateDefaultCandidate,
} from './candidate-generator';
import { rankCandidates } from './curiosity-scoring';
import { MAX_CANDIDATES_IN_QUEUE } from './types';

export class CuriosityEngine {
  private queue: Map<string, CuriosityCandidate> = new Map();

  generateCandidates(input: {
    memories: MemoryRecord[];
    patterns: PatternV2[];
    insights: InsightV2[];
    userId: string;
  }): CuriosityCandidate[] {
    const candidates: CuriosityCandidate[] = [];

    candidates.push(...generateFromMemories(input.memories, input.userId));
    candidates.push(...generateFromPatterns(input.patterns, input.userId));
    candidates.push(...generateFromInsights(input.insights, input.userId));

    const ranked = rankCandidates(candidates);

    for (const candidate of ranked) {
      this.queue.set(candidate.id, candidate);
    }

    if (ranked.length === 0) {
      const defaultCandidate = generateDefaultCandidate(input.userId);
      this.queue.set(defaultCandidate.id, defaultCandidate);
      ranked.push(defaultCandidate);
    }

    return ranked;
  }

  rankCandidates(candidates: CuriosityCandidate[]): CuriosityCandidate[] {
    return rankCandidates(candidates);
  }

  dismissCandidate(id: string): void {
    const candidate = this.queue.get(id);
    if (!candidate) return;

    this.queue.set(id, {
      ...candidate,
      status: 'dismissed',
      updatedAt: nowIso(),
    });
  }

  completeCandidate(id: string): void {
    const candidate = this.queue.get(id);
    if (!candidate) return;

    this.queue.set(id, {
      ...candidate,
      status: 'completed',
      updatedAt: nowIso(),
    });
  }

  startExploring(id: string): void {
    const candidate = this.queue.get(id);
    if (!candidate) return;

    this.queue.set(id, {
      ...candidate,
      status: 'exploring',
      updatedAt: nowIso(),
    });
  }

  getCuriosityQueue(query?: CuriosityQueueQuery): CuriosityCandidate[] {
    let queue = Array.from(this.queue.values());

    queue = expireStaleCandidates(queue);
    queue = deduplicateQueue(queue);

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

  getTopCandidates(limit = 5): CuriosityCandidate[] {
    const queue = Array.from(this.queue.values());
    return getTopCandidates(queue, limit);
  }

  getCandidateById(id: string): CuriosityCandidate | undefined {
    return this.queue.get(id);
  }

  getAllCandidates(): CuriosityCandidate[] {
    return Array.from(this.queue.values());
  }
}
