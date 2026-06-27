import { describe, expect, it, vi } from 'vitest';
import { DiscoveryQueueManager } from './DiscoveryQueueManager';
import type { PresentationCandidate } from './PresentationCandidate';

function candidate(id: string): PresentationCandidate {
  return {
    id,
    title: `Discovery ${id}`,
    oneLineHook: `Hook for ${id}`,
    whyYouMightCare: `Why ${id} matters`,
    shareMessage: `I found ${id}`,
    sourceName: 'github',
    tags: ['test']
  };
}

describe('DiscoveryQueueManager', () => {
  it('enqueues a candidate and returns true', () => {
    const manager = new DiscoveryQueueManager();
    expect(manager.enqueue(candidate('d1'))).toBe(true);
    expect(manager.getStats().queued).toBe(1);
  });

  it('rejects duplicate id when already queued or presenting', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    expect(manager.enqueue(candidate('d1'))).toBe(false);
    expect(manager.getStats().queued).toBe(1);
  });

  it('allows same id after dismiss', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    manager.presentNext();
    manager.dismissCurrent();
    expect(manager.enqueue(candidate('d1'))).toBe(true);
  });

  it('rejects duplicate URL', () => {
    const manager = new DiscoveryQueueManager();
    const c1 = { ...candidate('d1'), sourceUrl: 'https://example.com/article' };
    const c2 = { ...candidate('d2'), sourceUrl: 'https://example.com/article' };
    manager.enqueue(c1);
    expect(manager.enqueue(c2)).toBe(false);
  });

  it('rejects duplicate title (normalized)', () => {
    const manager = new DiscoveryQueueManager();
    const c1 = { ...candidate('d1'), title: ' PixiJS Desktop Pet Guide ' };
    const c2 = { ...candidate('d2'), title: 'pixijs desktop pet guide!' };
    manager.enqueue(c1);
    expect(manager.enqueue(c2)).toBe(false);
  });

  it('allows different URLs and titles', () => {
    const manager = new DiscoveryQueueManager();
    const c1 = { ...candidate('d1'), sourceUrl: 'https://a.com', title: 'Alpha' };
    const c2 = { ...candidate('d2'), sourceUrl: 'https://b.com', title: 'Beta' };
    manager.enqueue(c1);
    expect(manager.enqueue(c2)).toBe(true);
  });

  it('presents next queued candidate', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    manager.enqueue(candidate('d2'));

    const presented = manager.presentNext();
    expect(presented?.candidate.id).toBe('d1');
    expect(manager.getCurrent()?.candidate.id).toBe('d1');
    expect(manager.getStats().queued).toBe(1);
    expect(manager.getStats().presenting).toBe(1);
  });

  it('does not change current when presentNext called while presenting', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    manager.presentNext();

    const same = manager.presentNext();
    expect(same?.candidate.id).toBe('d1');
  });

  it('dismissCurrent marks current as dismissed', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    manager.presentNext();

    manager.dismissCurrent();
    expect(manager.getCurrent()).toBeUndefined();
    expect(manager.getStats().dismissed).toBe(1);
  });

  it('saveCurrent marks current as saved', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    manager.presentNext();

    manager.saveCurrent();
    expect(manager.getCurrent()).toBeUndefined();
    expect(manager.getStats().saved).toBe(1);
  });

  it('advanceAfterPresentation dismisses current and presents next', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    manager.enqueue(candidate('d2'));
    manager.presentNext();

    const next = manager.advanceAfterPresentation();
    expect(next?.candidate.id).toBe('d2');
    expect(manager.getStats().dismissed).toBe(1);
    expect(manager.getStats().presenting).toBe(1);
  });

  it('returns undefined from advanceAfterPresentation when queue empty', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    manager.presentNext();

    const next = manager.advanceAfterPresentation();
    expect(next).toBeUndefined();
  });

  it('reset clears all candidates', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(candidate('d1'));
    manager.enqueue(candidate('d2'));
    manager.presentNext();

    manager.reset();
    expect(manager.getStats()).toEqual({ queued: 0, presenting: 0, dismissed: 0, saved: 0 });
  });

  it('notify listeners on state change', () => {
    const manager = new DiscoveryQueueManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.enqueue(candidate('d1'));
    expect(listener).toHaveBeenCalledTimes(1);

    manager.presentNext();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops notifications', () => {
    const manager = new DiscoveryQueueManager();
    const listener = vi.fn();
    const unsub = manager.subscribe(listener);

    manager.enqueue(candidate('d1'));
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    manager.enqueue(candidate('d2'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
