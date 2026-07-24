import { describe, expect, it } from 'vitest';
import { OperationTracker } from './OperationTracker';

describe('OperationTracker', () => {
  it('rejects new work after quiescing and drains active work', async () => {
    const tracker = new OperationTracker(); const token = tracker.begin('companion_turn');
    tracker.stopAccepting();
    expect(() => tracker.begin('research')).toThrow('APP_QUIESCING');
    expect(() => token.assertWritable()).toThrow('APP_QUIESCING');
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
});
