import type { CuriosityCandidate, CuriosityCandidateStatus } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import { MAX_CANDIDATES_IN_QUEUE, CANDIDATE_EXPIRY_DAYS } from './types';

export function addToQueue(queue: CuriosityCandidate[], candidate: CuriosityCandidate): CuriosityCandidate[] {
  const existing = queue.find((c) => c.id === candidate.id);
  if (existing) {
    return queue.map((c) => c.id === candidate.id ? candidate : c);
  }

  const newQueue = [...queue, candidate];
  return newQueue
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_CANDIDATES_IN_QUEUE);
}

export function removeFromQueue(queue: CuriosityCandidate[], id: string): CuriosityCandidate[] {
  return queue.filter((c) => c.id !== id);
}

export function getTopCandidates(queue: CuriosityCandidate[], limit = 5): CuriosityCandidate[] {
  return queue
    .filter((c) => c.status === 'pending' || c.status === 'queued')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export function deduplicateQueue(queue: CuriosityCandidate[]): CuriosityCandidate[] {
  const seen = new Map<string, CuriosityCandidate>();

  for (const candidate of queue) {
    const key = candidate.title.toLowerCase().replace(/[^\w\s]/g, '');
    const existing = seen.get(key);

    if (!existing || candidate.priority > existing.priority) {
      seen.set(key, candidate);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.priority - a.priority);
}

export function expireStaleCandidates(queue: CuriosityCandidate[]): CuriosityCandidate[] {
  const now = new Date();
  const expiryMs = CANDIDATE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  return queue.map((candidate) => {
    if (candidate.status === 'completed' || candidate.status === 'dismissed') {
      return candidate;
    }

    const createdAt = new Date(candidate.createdAt);
    if (now.getTime() - createdAt.getTime() > expiryMs) {
      return {
        ...candidate,
        status: 'expired' as CuriosityCandidateStatus,
        updatedAt: nowIso(),
      };
    }

    return candidate;
  });
}

export function filterByStatus(queue: CuriosityCandidate[], statuses: CuriosityCandidateStatus[]): CuriosityCandidate[] {
  return queue.filter((c) => statuses.includes(c.status));
}

export function filterByMinPriority(queue: CuriosityCandidate[], minPriority: number): CuriosityCandidate[] {
  return queue.filter((c) => c.priority >= minPriority);
}
