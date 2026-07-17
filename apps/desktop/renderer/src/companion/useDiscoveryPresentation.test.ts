import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentationCandidate } from './PresentationCandidate';
import { DiscoveryQueueManager } from './DiscoveryQueueManager';
import {
  findDiscoveryCandidate,
  waitForDiscoveryCandidate,
} from './useDiscoveryPresentation';

function candidate(id: string): PresentationCandidate {
  return {
    id,
    title: `Discovery ${id}`,
    oneLineHook: `Hook ${id}`,
    whyYouMightCare: `Why ${id}`,
    shareMessage: `Share ${id}`,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Discovery Candidate wait API', () => {
  it('checks Candidate availability by Discovery id without presenting it', () => {
    const queue = new DiscoveryQueueManager();
    queue.enqueue(candidate('unrelated'));
    queue.enqueue(candidate('target'));

    expect(findDiscoveryCandidate(queue)).toMatchObject({ id: 'unrelated' });
    expect(findDiscoveryCandidate(queue, 'target')).toMatchObject({ id: 'target' });
    expect(findDiscoveryCandidate(queue, 'missing')).toBeNull();
    expect(queue.getCurrent()).toBeUndefined();
  });

  it('ignores unrelated Candidates and resolves only for the matching id', () => {
    vi.useFakeTimers();
    const queue = new DiscoveryQueueManager();
    const onAvailable = vi.fn();
    waitForDiscoveryCandidate(queue, 'target', onAvailable, vi.fn(), 100);

    queue.enqueue(candidate('unrelated'));
    expect(onAvailable).not.toHaveBeenCalled();
    expect(queue.getCurrent()).toBeUndefined();

    queue.enqueue(candidate('target'));
    expect(onAvailable).toHaveBeenCalledOnce();
    expect(onAvailable).toHaveBeenCalledWith(expect.objectContaining({ id: 'target' }));
    expect(queue.getCurrent()).toBeUndefined();
  });

  it('cancellation unsubscribes so a late Candidate is ignored', () => {
    vi.useFakeTimers();
    const queue = new DiscoveryQueueManager();
    const onAvailable = vi.fn();
    const onTimeout = vi.fn();
    const cancel = waitForDiscoveryCandidate(queue, 'target', onAvailable, onTimeout, 20);

    cancel();
    queue.enqueue(candidate('target'));
    vi.advanceTimersByTime(20);

    expect(onAvailable).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('times out once and ignores a payload arriving after timeout', () => {
    vi.useFakeTimers();
    const queue = new DiscoveryQueueManager();
    const onAvailable = vi.fn();
    const onTimeout = vi.fn();
    waitForDiscoveryCandidate(queue, 'target', onAvailable, onTimeout, 20);

    vi.advanceTimersByTime(20);
    queue.enqueue(candidate('target'));

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onAvailable).not.toHaveBeenCalled();
  });
});
