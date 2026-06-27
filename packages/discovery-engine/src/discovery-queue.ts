import type { DiscoveryJob, DiscoveryJobStatus } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import { MAX_QUEUE_SIZE } from './types';

export function addToQueue(queue: DiscoveryJob[], job: DiscoveryJob): DiscoveryJob[] {
  const existing = queue.find((j) => j.id === job.id);
  if (existing) {
    return queue.map((j) => j.id === job.id ? job : j);
  }

  const newQueue = [...queue, job];
  return newQueue
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_QUEUE_SIZE);
}

export function removeFromQueue(queue: DiscoveryJob[], id: string): DiscoveryJob[] {
  return queue.filter((j) => j.id !== id);
}

export function getNextJob(queue: DiscoveryJob[]): DiscoveryJob | undefined {
  return queue
    .filter((j) => j.status === 'pending' || j.status === 'planning')
    .sort((a, b) => b.priority - a.priority)[0];
}

export function retryJob(job: DiscoveryJob): DiscoveryJob {
  if (job.retryCount >= job.maxRetries) {
    return {
      ...job,
      status: 'failed',
      updatedAt: nowIso(),
    };
  }

  return {
    ...job,
    status: 'pending',
    retryCount: job.retryCount + 1,
    updatedAt: nowIso(),
  };
}

export function cancelJob(job: DiscoveryJob): DiscoveryJob {
  return {
    ...job,
    status: 'cancelled',
    finishedAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function filterByStatus(queue: DiscoveryJob[], statuses: DiscoveryJobStatus[]): DiscoveryJob[] {
  return queue.filter((j) => statuses.includes(j.status));
}

export function filterByMinPriority(queue: DiscoveryJob[], minPriority: number): DiscoveryJob[] {
  return queue.filter((j) => j.priority >= minPriority);
}
