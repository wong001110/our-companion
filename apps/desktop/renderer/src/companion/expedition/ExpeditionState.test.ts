import { describe, expect, it, vi } from 'vitest';
import {
  createExplorationVisualController,
  expeditionPhaseToAnimation,
  expeditionReportMessage,
} from './ExpeditionState';

describe('Exploration visual lifecycle', () => {
  it('always runs prepare, depart, away, return, report, and idle for at least ten seconds', () => {
    vi.useFakeTimers();
    const phases: string[] = [];
    const controller = createExplorationVisualController({
      now: () => Date.now(),
      onChange: (state) => phases.push(state.phase),
    });
    controller.start('cycle-1');
    controller.complete('cycle-1', 'empty');
    vi.advanceTimersByTime(10_000);
    expect(phases).toEqual(['preparing', 'departing', 'away', 'returning', 'reporting', 'idle']);
    vi.useRealTimers();
  });

  it('reuses the active cycle and ignores overlapping cycles', () => {
    vi.useFakeTimers();
    const controller = createExplorationVisualController({ onChange: () => undefined });
    expect(controller.start('cycle-1')).toBe(true);
    expect(controller.start('cycle-1')).toBe(true);
    expect(controller.start('cycle-2')).toBe(false);
    controller.recover();
    expect(controller.getState().phase).toBe('idle');
    vi.useRealTimers();
  });

  it('maps manifest animations and all terminal messages', () => {
    expect(expeditionPhaseToAnimation('preparing')).toBe('Expedition_Prepare');
    expect(expeditionPhaseToAnimation('departing')).toBe('Expedition_Leave');
    expect(expeditionPhaseToAnimation('returning')).toBe('Expedition_Return');
    expect(expeditionPhaseToAnimation('reporting')).toBe('Expedition_Present');
    expect(expeditionReportMessage('no_provider')).toContain('No discovery provider');
    expect(expeditionReportMessage('failure')).toContain('back');
  });
});
