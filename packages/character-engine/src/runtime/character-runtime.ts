import type {
  CharacterRuntimeState,
  CharacterRuntimeStateV2,
  CharacterRuntimeContext,
  BehaviourRequest,
  BehaviourExecution,
  EmotionState,
  InterruptReason,
  InterruptResult,
  BehaviourSubmissionResult,
  InitializeRuntimeInput,
  NormalizedDiscovery,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

const VALID_TRANSITIONS: Record<CharacterRuntimeStateV2, CharacterRuntimeStateV2[]> = {
  booting: ['idle'],
  idle: ['observing', 'thinking', 'listening', 'speaking', 'exploring', 'sleeping', 'error'],
  observing: ['thinking', 'idle', 'error'],
  thinking: ['speaking', 'idle', 'exploring', 'error'],
  listening: ['thinking', 'speaking', 'idle', 'error'],
  speaking: ['idle', 'thinking', 'error'],
  exploring: ['sharing', 'thinking', 'idle', 'error'],
  sharing: ['idle', 'thinking', 'error'],
  performing: ['idle', 'thinking', 'error'],
  waiting: ['idle', 'error'],
  sleeping: ['idle', 'error'],
  error: ['idle'],
};

export const neutralEmotionState: EmotionState = {
  neutral: 70,
  curious: 35,
  happy: 20,
  excited: 0,
  shy: 45,
  confused: 0,
  focused: 50,
  tired: 10,
  proud: 0,
  concerned: 0,
};

export function createRuntimeContext(input: InitializeRuntimeInput): CharacterRuntimeContext {
  return {
    characterId: input.characterId,
    state: 'idle',
    queuedBehaviours: [],
    currentEmotion: input.initialEmotion ?? { ...neutralEmotionState },
    cooldowns: [],
    errors: [],
  };
}

export function canTransition(from: CharacterRuntimeStateV2, to: CharacterRuntimeStateV2): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionRuntimeState(current: CharacterRuntimeStateV2, target: CharacterRuntimeStateV2): CharacterRuntimeStateV2 {
  if (canTransition(current, target)) {
    return target;
  }
  return current;
}

export function submitBehaviour(
  context: CharacterRuntimeContext,
  request: BehaviourRequest
): BehaviourSubmissionResult {
  const existing = context.queuedBehaviours.find((b) => b.type === request.type);
  if (existing) {
    return {
      id: request.id,
      accepted: false,
      reason: 'Duplicate behaviour type in queue',
    };
  }

  return {
    id: request.id,
    accepted: true,
    queuePosition: context.queuedBehaviours.length,
  };
}

export function startBehaviour(
  context: CharacterRuntimeContext,
  request: BehaviourRequest
): { context: CharacterRuntimeContext; execution: BehaviourExecution } {
  const execution: BehaviourExecution = {
    id: createId('behaviour'),
    request,
    startedAt: nowIso(),
    status: 'running',
  };

  const nextState = mapBehaviourToState(request.type);

  return {
    context: {
      ...context,
      state: canTransition(context.state, nextState) ? nextState : context.state,
      currentBehaviour: execution,
      queuedBehaviours: context.queuedBehaviours.filter((b) => b.id !== request.id),
    },
    execution,
  };
}

export function completeBehaviour(context: CharacterRuntimeContext): CharacterRuntimeContext {
  if (!context.currentBehaviour) {
    return context;
  }

  return {
    ...context,
    state: 'idle',
    currentBehaviour: {
      ...context.currentBehaviour,
      status: 'completed',
      completedAt: nowIso(),
    },
  };
}

export function interruptBehaviour(
  context: CharacterRuntimeContext,
  reason: InterruptReason
): { context: CharacterRuntimeContext; result: InterruptResult } {
  if (!context.currentBehaviour) {
    return {
      context,
      result: {
        interrupted: false,
        reason: 'No active behaviour to interrupt',
      },
    };
  }

  if (!context.currentBehaviour.request.interruptible) {
    return {
      context,
      result: {
        interrupted: false,
        previousBehaviour: context.currentBehaviour.request.type,
        reason: 'Current behaviour is not interruptible',
      },
    };
  }

  return {
    context: {
      ...context,
      state: 'idle',
      currentBehaviour: {
        ...context.currentBehaviour,
        status: 'cancelled',
        completedAt: nowIso(),
      },
      lastInterruptAt: nowIso(),
    },
    result: {
      interrupted: true,
      previousBehaviour: context.currentBehaviour.request.type,
      reason,
    },
  };
}

function mapBehaviourToState(type: string): CharacterRuntimeStateV2 {
  const stateMap: Record<string, CharacterRuntimeStateV2> = {
    idle: 'idle',
    think: 'thinking',
    listen: 'listening',
    speak: 'speaking',
    share_discovery: 'sharing',
    ask_question: 'speaking',
    react: 'performing',
    perform_action: 'performing',
    celebrate: 'performing',
    sleep: 'sleeping',
    error_recovery: 'idle',
  };
  return stateMap[type] ?? 'idle';
}

export interface CharacterRuntimeDeps {
  loadState(): CharacterRuntimeState;
  saveState(state: CharacterRuntimeState): CharacterRuntimeState;
  advanceCharacter(state: CharacterRuntimeState, context: Record<string, unknown>): CharacterRuntimeState;
  applyEmotionEvent(emotion: EmotionState, event: string): EmotionState;
  emitEvent?(type: string, payload?: Record<string, unknown>): void;
}

export interface CharacterDiscoveryReadyInput {
  discovery: NormalizedDiscovery;
  userActive?: boolean;
}

export interface CharacterFeedbackInput {
  feedbackType: 'user_accepts_discovery' | 'user_rejects_discovery' | 'expertise_topic_match';
}

export interface CharacterUserCommandInput {
  event: string;
}

export interface CharacterSettleInput {
  intent?: CharacterRuntimeState['intent'];
  coreState?: CharacterRuntimeState['coreState'];
}

export class CharacterRuntime {
  constructor(private readonly deps: CharacterRuntimeDeps) {}

  getState(): CharacterRuntimeState {
    return this.deps.loadState();
  }

  handleDiscoveryReady(input: CharacterDiscoveryReadyInput): CharacterRuntimeState {
    const state = this.deps.loadState();
    const context = { availableDiscoveries: [input.discovery], userActive: input.userActive ?? false };
    const next = this.deps.advanceCharacter(state, context);
    return this.deps.saveState(next);
  }

  handleUserFeedback(input: CharacterFeedbackInput): CharacterRuntimeState {
    const state = this.deps.loadState();
    const next = {
      ...state,
      emotion: this.deps.applyEmotionEvent(state.emotion, input.feedbackType)
    };
    return this.deps.saveState(next);
  }

  handleUserCommand(input: CharacterUserCommandInput): CharacterRuntimeState {
    const state = this.deps.loadState();
    const next = this.deps.advanceCharacter(state, {
      userCommand: input.event,
      userActive: true
    });
    return this.deps.saveState(next);
  }

  settle(input?: CharacterSettleInput): CharacterRuntimeState {
    const state = this.deps.loadState();
    const settled = {
      ...state,
      intent: input?.intent ?? 'waiting',
      coreState: input?.coreState ?? 'idle',
      updatedAt: nowIso()
    };
    return this.deps.saveState(settled);
  }
}
