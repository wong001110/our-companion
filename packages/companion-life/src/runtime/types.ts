import type {
  CharacterRuntimeStateV2,
  CharacterRuntimeContext,
  PresenceMode,
  AttentionState,
} from '@our-companion/shared';

export type CLSState =
  | 'booting' | 'wake' | 'observe' | 'idle' | 'thinking'
  | 'working' | 'conversation' | 'returning' | 'notification' | 'sleep';

export interface CLSContext {
  state: CLSState;
  previousState?: CLSState;
  characterContext: CharacterRuntimeContext;
  presenceMode: PresenceMode;
  attention: AttentionState;
  lastTransitionAt: string;
  stateHistory: CLSState[];
}

export interface RuntimeCoordinatorDeps {
  loadCharacterContext(): CharacterRuntimeContext;
  saveCharacterContext(ctx: CharacterRuntimeContext): CharacterRuntimeContext;
  loadAttention(): AttentionState;
  saveAttention(state: AttentionState): AttentionState;
  emitEvent(type: string, payload?: Record<string, unknown>): void;
  now?(): string;
}

export interface StateTransitionRequest {
  target: CLSState;
  reason: string;
  priority: number;
  source: string;
}

export interface StateTransitionResult {
  allowed: boolean;
  previousState?: CLSState;
  newState: CLSState;
  reason: string;
}

export const CLS_STATE_PRIORITY: Record<CLSState, number> = {
  booting: 100,
  notification: 80,
  conversation: 70,
  returning: 60,
  working: 50,
  thinking: 40,
  observe: 30,
  idle: 20,
  wake: 15,
  sleep: 10,
};

export const VALID_CLS_TRANSITIONS: Record<CLSState, CLSState[]> = {
  booting: ['wake'],
  wake: ['observe', 'idle'],
  observe: ['thinking', 'working', 'conversation', 'idle', 'sleep'],
  idle: ['observe', 'thinking', 'working', 'conversation', 'sleep', 'notification'],
  thinking: ['speaking' as CLSState, 'working', 'idle', 'observe'],
  working: ['returning', 'thinking', 'idle', 'observe'],
  conversation: ['observe', 'idle', 'thinking'],
  returning: ['observe', 'idle', 'notification'],
  notification: ['observe', 'idle', 'conversation'],
  sleep: ['wake', 'observe'],
};
