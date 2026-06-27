import { describe, expect, it, vi } from 'vitest';
import { DiscoveryQueueManager } from './DiscoveryQueueManager';
import type { DiscoveryAnnouncePayload } from '@our-companion/shared';

function payload(id: string): DiscoveryAnnouncePayload {
  return {
    discoveryId: id,
    title: `Discovery ${id}`,
    message: `I found ${id}`,
    cardBody: `Body for ${id}`,
    tags: ['test'],
    source: 'github'
  };
}

describe('DiscoveryQueueManager', () => {
  it('enqueues a candidate and returns true', () => {
    const manager = new DiscoveryQueueManager();
    expect(manager.enqueue(payload('d1'))).toBe(true);
    expect(manager.getStats().queued).toBe(1);
  });

  it('rejects duplicate id when already queued or presenting', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(payload('d1'));
    expect(manager.enqueue(payload('d1'))).toBe(false);
    expect(manager.getStats().queued).toBe(1);
  });

  it('presents next queued candidate', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(payload('d1'));
    manager.enqueue(payload('d2'));

    const presented = manager.presentNext();
    expect(presented?.id).toBe('d1');
    expect(manager.getCurrent()?.id).toBe('d1');
    expect(manager.getStats().queued).toBe(1);
    expect(manager.getStats().presenting).toBe(1);
  });

  it('does not change current when presentNext called while presenting', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(payload('d1'));
    manager.presentNext();

    const same = manager.presentNext();
    expect(same?.id).toBe('d1');
  });

  it('dismissCurrent marks current as dismissed', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(payload('d1'));
    manager.presentNext();

    manager.dismissCurrent();
    expect(manager.getCurrent()).toBeUndefined();
    expect(manager.getStats().dismissed).toBe(1);
  });

  it('saveCurrent marks current as saved', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(payload('d1'));
    manager.presentNext();

    manager.saveCurrent();
    expect(manager.getCurrent()).toBeUndefined();
    expect(manager.getStats().saved).toBe(1);
  });

  it('advanceAfterPresentation dismisses current and presents next', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(payload('d1'));
    manager.enqueue(payload('d2'));
    manager.presentNext();

    const next = manager.advanceAfterPresentation();
    expect(next?.id).toBe('d2');
    expect(manager.getStats().dismissed).toBe(1);
    expect(manager.getStats().presenting).toBe(1);
  });

  it('returns undefined from advanceAfterPresentation when queue empty', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(payload('d1'));
    manager.presentNext();

    const next = manager.advanceAfterPresentation();
    expect(next).toBeUndefined();
  });

  it('reset clears all candidates', () => {
    const manager = new DiscoveryQueueManager();
    manager.enqueue(payload('d1'));
    manager.enqueue(payload('d2'));
    manager.presentNext();

    manager.reset();
    expect(manager.getStats()).toEqual({ queued: 0, presenting: 0, dismissed: 0, saved: 0 });
  });

  it('notify listeners on state change', () => {
    const manager = new DiscoveryQueueManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.enqueue(payload('d1'));
    expect(listener).toHaveBeenCalledTimes(1);

    manager.presentNext();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops notifications', () => {
    const manager = new DiscoveryQueueManager();
    const listener = vi.fn();
    const unsub = manager.subscribe(listener);

    manager.enqueue(payload('d1'));
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    manager.enqueue(payload('d2'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
