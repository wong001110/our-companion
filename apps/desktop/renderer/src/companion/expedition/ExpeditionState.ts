import type { AnimationName } from '../../ui/CompanionCanvas';
import type { ExplorationState } from '@our-companion/shared';

export type ExpeditionPhase = 'idle' | 'preparing' | 'departing' | 'away' | 'returning' | 'reporting';
export type ExpeditionOutcome = 'success' | 'empty' | 'no_provider' | 'failure';

export const EXPLORATION_VISUAL_TIMING = {
  preparingMs: 1_500,
  departingAtMs: 1_500,
  awayAtMs: 3_000,
  minimumReturnAtMs: 8_000,
  returningMs: 1_500,
  reportingMs: 500,
  minimumTotalMs: 10_000,
} as const;

export interface ExpeditionState {
  phase: ExpeditionPhase;
  cycleId?: string;
  startedAtMs?: number;
  outcome?: ExpeditionOutcome;
}

export function createExpeditionState(): ExpeditionState {
  return { phase: 'idle' };
}

export function explorationStateToVisualPhase(state: ExplorationState): ExpeditionPhase {
  if (state === 'curious' || state === 'planning') return 'preparing';
  if (state === 'exploring' || state === 'collecting' || state === 'synthesizing') return 'away';
  if (state === 'returning') return 'returning';
  if (state === 'sharing' || state === 'reflecting') return 'reporting';
  return 'idle';
}

export function expeditionPhaseToAnimation(phase: ExpeditionPhase): AnimationName | undefined {
  switch (phase) {
    case 'preparing': return 'Expedition_Prepare';
    case 'departing': return 'Expedition_Leave';
    case 'returning': return 'Expedition_Return';
    case 'reporting': return 'Expedition_Present';
    default: return undefined;
  }
}

export function expeditionReportMessage(outcome: ExpeditionOutcome): string {
  switch (outcome) {
    case 'success': return 'I found something worth sharing.';
    case 'empty': return 'I could not find enough reliable information this time.';
    case 'no_provider': return 'No discovery provider is currently available.';
    case 'failure': return 'I ran into a problem, but I am back and ready to try again.';
  }
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface ExplorationVisualController {
  getState(): ExpeditionState;
  start(cycleId: string): boolean;
  complete(cycleId: string, outcome: ExpeditionOutcome): void;
  recover(): void;
  dispose(): void;
}

export function createExplorationVisualController(input: {
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  onChange: (state: ExpeditionState) => void;
}): ExplorationVisualController {
  const now = input.now ?? Date.now;
  const setTimer = input.setTimer ?? setTimeout;
  const clearTimer = input.clearTimer ?? clearTimeout;
  let state = createExpeditionState();
  const timers = new Set<TimerHandle>();

  const emit = (next: ExpeditionState) => {
    state = next;
    input.onChange(state);
  };
  const schedule = (callback: () => void, delayMs: number) => {
    const handle = setTimer(() => {
      timers.delete(handle);
      callback();
    }, Math.max(0, delayMs));
    timers.add(handle);
  };
  const clearAll = () => {
    for (const timer of timers) clearTimer(timer);
    timers.clear();
  };

  return {
    getState: () => state,
    start(cycleId) {
      if (state.phase !== 'idle') return state.cycleId === cycleId;
      clearAll();
      const startedAtMs = now();
      emit({ phase: 'preparing', cycleId, startedAtMs });
      schedule(() => emit({ ...state, phase: 'departing' }), EXPLORATION_VISUAL_TIMING.departingAtMs);
      schedule(() => emit({ ...state, phase: 'away' }), EXPLORATION_VISUAL_TIMING.awayAtMs);
      return true;
    },
    complete(cycleId, outcome) {
      if (state.phase === 'idle' || state.cycleId !== cycleId || state.outcome) return;
      state = { ...state, outcome };
      const elapsed = now() - (state.startedAtMs ?? now());
      schedule(() => {
        emit({ ...state, phase: 'returning' });
        schedule(() => {
          emit({ ...state, phase: 'reporting' });
          schedule(() => emit(createExpeditionState()), EXPLORATION_VISUAL_TIMING.reportingMs);
        }, EXPLORATION_VISUAL_TIMING.returningMs);
      }, Math.max(0, EXPLORATION_VISUAL_TIMING.minimumReturnAtMs - elapsed));
    },
    recover() {
      clearAll();
      emit(createExpeditionState());
    },
    dispose() {
      clearAll();
    },
  };
}
