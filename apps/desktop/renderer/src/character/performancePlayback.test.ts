import { describe, expect, it, vi } from 'vitest';
import { startPerformancePlayback } from './performancePlayback';

class FakeScheduler {
  nextId = 1;
  tasks = new Map<number, { callback: () => void; delayMs: number }>();
  setTimeout = (callback: () => void, delayMs: number) => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, delayMs });
    return id;
  };
  clearTimeout = (id: number) => { this.tasks.delete(id); };
  runDelay(delayMs: number) {
    for (const [id, task] of [...this.tasks]) {
      if (task.delayMs === delayMs) {
        this.tasks.delete(id);
        task.callback();
      }
    }
  }
}

describe('performance playback', () => {
  it('uses cue startMs, ignores invalid keys, and releases its override after the final cue', () => {
    const scheduler = new FakeScheduler();
    const setAnimation = vi.fn();
    startPerformancePlayback({
      id: 'performance', name: 'test', behaviourType: 'test', interruptible: true,
      animationSequence: [
        { id: 'later', type: 'animation', startMs: 400, durationMs: 50, payload: 'Think' },
        { id: 'invalid', type: 'animation', startMs: 100, durationMs: 10, payload: 'not-an-animation' },
        { id: 'first', type: 'animation', startMs: 20, durationMs: 10, payload: { animationKey: 'Work_Focus' } },
      ]
    }, setAnimation, scheduler);

    scheduler.runDelay(20);
    expect(setAnimation).toHaveBeenLastCalledWith('Work_Focus');
    scheduler.runDelay(400);
    expect(setAnimation).toHaveBeenLastCalledWith('Think');
    scheduler.runDelay(450);
    expect(setAnimation).toHaveBeenLastCalledWith(undefined);
  });

  it('cancels every pending cue when a performance is interrupted or replaced', () => {
    const scheduler = new FakeScheduler();
    const setAnimation = vi.fn();
    const playback = startPerformancePlayback({
      id: 'performance', name: 'test', behaviourType: 'test', interruptible: true,
      animationSequence: [{ id: 'cue', type: 'animation', startMs: 100, payload: 'Think' }]
    }, setAnimation, scheduler);
    playback.cancel();
    scheduler.runDelay(100);
    expect(setAnimation).not.toHaveBeenCalled();
    expect(playback.timeoutIds).toEqual([]);
  });
});
