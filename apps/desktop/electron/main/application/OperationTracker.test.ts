import { describe, expect, it, vi } from 'vitest';
import { AppShuttingDownError, OperationTracker } from './OperationTracker';

describe('OperationTracker', () => {
  it('rejects new work after quiescing and drains active work', async () => {
    const tracker = new OperationTracker(); const token = tracker.begin('companion_turn');
    tracker.stopAccepting();
    expect(() => tracker.begin('research')).toThrow(AppShuttingDownError);
    expect(() => token.assertWritable()).toThrow('APP_SHUTTING_DOWN');
    token.finish();
    await expect(tracker.drain(1)).resolves.toEqual({ drained: true, active: 0 });
  });
  it('aborts active work and remains bounded when it ignores cancellation', async () => {
    const tracker = new OperationTracker(); const token = tracker.begin('vector_rebuild');
    tracker.abortAll();
    expect(token.isCancelled()).toBe(true);
    await expect(tracker.drain(1)).resolves.toMatchObject({ drained: false, active: 1 });
    token.finish();
    expect(tracker.activeCount()).toBe(0);
  });
  it('invalidates an old epoch before a late result can commit or publish', async () => {
    const tracker = new OperationTracker();
    const token = tracker.beginOperation('research');
    const epoch = token.epoch;
    tracker.beginQuiescing();
    expect(tracker.epoch).toBeGreaterThan(epoch);
    const mutation = vi.fn();
    await expect(tracker.commit(token, mutation)).rejects.toMatchObject({ code: 'APP_SHUTTING_DOWN', retryable: false });
    expect(mutation).not.toHaveBeenCalled();
    token.finish();
  });
  it('permits publication only after a successful lifecycle-validated mutation', async () => {
    const tracker = new OperationTracker(); const token = tracker.beginOperation('discovery');
    const order: string[] = [];
    await tracker.commit(token, () => { order.push('persisted'); });
    token.assertCanCommit(); order.push('published');
    expect(order).toEqual(['persisted', 'published']);
    token.finish();
  });
});
