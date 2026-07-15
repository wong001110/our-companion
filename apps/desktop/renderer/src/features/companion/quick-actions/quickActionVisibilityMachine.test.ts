import { describe, expect, it, vi } from 'vitest';
import { QuickActionVisibilityMachine, type QuickActionVisibilityState } from './quickActionVisibilityMachine';

describe('QuickActionVisibilityMachine', () => {
  it('uses the required hover delay and cancels the hide grace period when re-entering a bubble', () => {
    vi.useFakeTimers();
    const states: QuickActionVisibilityState[] = [];
    const machine = new QuickActionVisibilityMachine((state) => states.push(state), { showDelayMs: 220, hideGraceMs: 420 });

    machine.enterGroup();
    vi.advanceTimersByTime(219);
    expect(states).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(states.at(-1)).toEqual({ visible: true, pinned: false });

    machine.leaveGroup();
    vi.advanceTimersByTime(300);
    machine.enterGroup();
    vi.advanceTimersByTime(500);
    expect(states.at(-1)).toEqual({ visible: true, pinned: false });
    vi.useRealTimers();
  });

  it('pins on click and closes on the next click or Escape action', () => {
    vi.useFakeTimers();
    const states: QuickActionVisibilityState[] = [];
    const machine = new QuickActionVisibilityMachine((state) => states.push(state), { showDelayMs: 220, hideGraceMs: 420 });
    machine.togglePinned();
    expect(states.at(-1)).toEqual({ visible: true, pinned: true });
    machine.leaveGroup();
    vi.advanceTimersByTime(500);
    expect(states.at(-1)).toEqual({ visible: true, pinned: true });
    machine.close();
    expect(states.at(-1)).toEqual({ visible: false, pinned: false });
    vi.useRealTimers();
  });

  it('pins explicitly without toggling an already pinned group closed', () => {
    const states: QuickActionVisibilityState[] = [];
    const machine = new QuickActionVisibilityMachine((state) => states.push(state), { showDelayMs: 220, hideGraceMs: 420 });
    machine.pin();
    machine.pin();
    expect(states).toEqual([
      { visible: true, pinned: true },
      { visible: true, pinned: true },
    ]);
  });
});
