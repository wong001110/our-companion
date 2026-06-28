export type ExpeditionPhase = 'idle' | 'preparing' | 'leaving' | 'away' | 'returning' | 'presenting';
export type ExpeditionReason = 'discovery' | 'assigned' | 'visiting';

export interface ExpeditionState {
  phase: ExpeditionPhase;
  reason: ExpeditionReason;
  startedAt?: string;
  result?: unknown;
}

export function createExpeditionState(): ExpeditionState {
  return { phase: 'idle', reason: 'discovery' };
}

export function startExpedition(state: ExpeditionState, reason: ExpeditionReason): ExpeditionState {
  return {
    phase: 'preparing',
    reason,
    startedAt: new Date().toISOString()
  };
}

export function advanceExpedition(state: ExpeditionState): ExpeditionState {
  switch (state.phase) {
    case 'preparing':
      return { ...state, phase: 'leaving' };
    case 'leaving':
      return { ...state, phase: 'away' };
    case 'away':
      return { ...state, phase: 'returning' };
    case 'returning':
      return { ...state, phase: 'presenting' };
    case 'presenting':
      return { ...state, phase: 'idle' };
    default:
      return state;
  }
}

export function returnFromExpedition(state: ExpeditionState, result?: unknown): ExpeditionState {
  return { ...state, phase: 'returning', result };
}

export function expeditionPhaseToAnimation(phase: ExpeditionPhase): string {
  switch (phase) {
    case 'preparing': return 'task_start';
    case 'leaving': return 'walk';
    case 'away': return 'walk';
    case 'returning': return 'return';
    case 'presenting': return 'discovery';
    default: return 'idle_laptop';
  }
}
