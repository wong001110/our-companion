import type { CharacterRuntimeContext, PresenceMode, AttentionState } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import type {
  CLSContext,
  CLSState,
  RuntimeCoordinatorDeps,
  StateTransitionRequest,
  StateTransitionResult,
} from './types';
import { CLS_STATE_PRIORITY, VALID_CLS_TRANSITIONS } from './types';

export function createCLSContext(characterId: string): CLSContext {
  return {
    state: 'booting',
    characterContext: {
      characterId,
      state: 'booting',
      queuedBehaviours: [],
      cooldowns: [],
      errors: [],
    },
    presenceMode: 'quiet',
    attention: {
      userActive: false,
      appFocused: false,
      recentInteraction: false,
      doNotDisturb: false,
      estimatedInterruptCost: 0,
    },
    lastTransitionAt: nowIso(),
    stateHistory: ['booting'],
  };
}

export function canTransitionCLS(from: CLSState, to: CLSState): boolean {
  return VALID_CLS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function resolveTransition(
  current: CLSState,
  request: StateTransitionRequest
): StateTransitionResult {
  if (canTransitionCLS(current, request.target)) {
    return {
      allowed: true,
      previousState: current,
      newState: request.target,
      reason: request.reason,
    };
  }

  const currentPriority = CLS_STATE_PRIORITY[current] ?? 0;
  if (request.priority > currentPriority && canTransitionCLS(current, request.target)) {
    return {
      allowed: true,
      previousState: current,
      newState: request.target,
      reason: `Priority override: ${request.reason}`,
    };
  }

  return {
    allowed: false,
    newState: current,
    reason: `Transition from ${current} to ${request.target} not allowed: ${request.reason}`,
  };
}

export function mapCharacterStateToCLS(
  charState: CharacterRuntimeContext['state']
): CLSState {
  const mapping: Record<string, CLSState> = {
    booting: 'booting',
    idle: 'idle',
    observing: 'observe',
    thinking: 'thinking',
    listening: 'conversation',
    speaking: 'conversation',
    exploring: 'working',
    sharing: 'returning',
    performing: 'working',
    waiting: 'idle',
    sleeping: 'sleep',
    error: 'idle',
  };
  return mapping[charState] ?? 'idle';
}

export function mapCLSToPresenceMode(state: CLSState, attention: AttentionState): PresenceMode {
  if (attention.doNotDisturb) return 'do_not_disturb';
  if (state === 'sleep') return 'sleeping';
  if (state === 'working') return 'focused';
  if (state === 'returning') return 'ready_to_share';
  if (state === 'thinking') return 'curious';
  if (state === 'conversation') return 'available';
  if (state === 'observe') return 'observing';
  if (!attention.userActive) return 'quiet';
  return 'available';
}

export class RuntimeCoordinator {
  private clsContext: CLSContext;
  private readonly deps: RuntimeCoordinatorDeps;

  constructor(characterId: string, deps: RuntimeCoordinatorDeps) {
    this.deps = deps;
    this.clsContext = createCLSContext(characterId);
  }

  getContext(): CLSContext {
    return { ...this.clsContext };
  }

  getState(): CLSState {
    return this.clsContext.state;
  }

  transition(request: StateTransitionRequest): StateTransitionResult {
    const result = resolveTransition(this.clsContext.state, request);
    if (!result.allowed) return result;

    const previousState = this.clsContext.state;
    const now = this.deps.now?.() ?? nowIso();

    this.clsContext = {
      ...this.clsContext,
      state: result.newState,
      previousState,
      lastTransitionAt: now,
      stateHistory: [...this.clsContext.stateHistory.slice(-19), result.newState],
      presenceMode: mapCLSToPresenceMode(result.newState, this.clsContext.attention),
    };

    this.deps.emitEvent('CLSStateChanged', {
      previousState,
      newState: result.newState,
      reason: request.reason,
      source: request.source,
    });

    return result;
  }

  boot(): StateTransitionResult {
    const result = this.transition({
      target: 'wake',
      reason: 'Application started',
      priority: CLS_STATE_PRIORITY.booting,
      source: 'system',
    });
    if (result.allowed) {
      this.transition({
        target: 'observe',
        reason: 'Wake complete, entering observation',
        priority: CLS_STATE_PRIORITY.wake,
        source: 'system',
      });
    }
    return result;
  }

  goSleep(): StateTransitionResult {
    return this.transition({
      target: 'sleep',
      reason: 'User inactive or night time',
      priority: CLS_STATE_PRIORITY.sleep,
      source: 'system',
    });
  }

  wakeUp(): StateTransitionResult {
    return this.transition({
      target: 'wake',
      reason: 'User activity detected',
      priority: CLS_STATE_PRIORITY.wake,
      source: 'system',
    });
  }

  startConversation(): StateTransitionResult {
    return this.transition({
      target: 'conversation',
      reason: 'User initiated conversation',
      priority: CLS_STATE_PRIORITY.conversation,
      source: 'user',
    });
  }

  endConversation(): StateTransitionResult {
    return this.transition({
      target: 'observe',
      reason: 'Conversation ended',
      priority: CLS_STATE_PRIORITY.observe,
      source: 'conversation',
    });
  }

  startWorking(reason: string): StateTransitionResult {
    return this.transition({
      target: 'working',
      reason,
      priority: CLS_STATE_PRIORITY.working,
      source: 'system',
    });
  }

  completeWork(): StateTransitionResult {
    return this.transition({
      target: 'returning',
      reason: 'Background work completed',
      priority: CLS_STATE_PRIORITY.returning,
      source: 'system',
    });
  }

  showNotification(): StateTransitionResult {
    return this.transition({
      target: 'notification',
      reason: 'Notification ready to present',
      priority: CLS_STATE_PRIORITY.notification,
      source: 'notification',
    });
  }

  dismissNotification(): StateTransitionResult {
    return this.transition({
      target: 'observe',
      reason: 'Notification dismissed or expired',
      priority: CLS_STATE_PRIORITY.observe,
      source: 'notification',
    });
  }

  updateAttention(updates: Partial<AttentionState>): void {
    const current = this.clsContext.attention;
    this.clsContext = {
      ...this.clsContext,
      attention: { ...current, ...updates },
      presenceMode: mapCLSToPresenceMode(this.clsContext.state, { ...current, ...updates }),
    };
  }

  syncWithCharacter(): void {
    const charCtx = this.deps.loadCharacterContext();
    const clsState = mapCharacterStateToCLS(charCtx.state);
    if (clsState !== this.clsContext.state) {
      this.transition({
        target: clsState,
        reason: 'Synced from character runtime',
        priority: CLS_STATE_PRIORITY[clsState] - 1,
        source: 'character-sync',
      });
    }
    this.clsContext = {
      ...this.clsContext,
      characterContext: charCtx,
    };
  }
}
