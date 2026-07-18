import { describe, expect, it } from 'vitest';
import { DebugRuntimeClock, SystemRuntimeClock } from './index';

describe('RuntimeClock', () => {
  it('advances and resets debug domain time without changing global time', () => {
    let real = Date.parse('2026-07-18T00:00:00.000Z');
    const clock = new DebugRuntimeClock(() => real);
    expect(clock.now().toISOString()).toBe('2026-07-18T00:00:00.000Z');
    clock.advance(24 * 60 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-07-19T00:00:00.000Z');
    real += 1000;
    expect(clock.now().toISOString()).toBe('2026-07-19T00:00:01.000Z');
    clock.reset();
    expect(clock.nowMs()).toBe(real);
  });

  it('blocks debug mutations when disabled', () => {
    const clock = new DebugRuntimeClock(() => 0, false);
    expect(() => clock.advance(1)).toThrow('DEBUG_CLOCK_UNAVAILABLE');
    expect(() => clock.reset()).toThrow('DEBUG_CLOCK_UNAVAILABLE');
  });

  it('provides production wall-clock time', () => {
    expect(Math.abs(new SystemRuntimeClock().nowMs() - Date.now())).toBeLessThan(100);
  });
});
