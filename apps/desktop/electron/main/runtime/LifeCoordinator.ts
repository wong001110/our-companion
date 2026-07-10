import type { CompanionLifeActivity, CompanionLifeState } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';

export interface LifeCoordinatorDeps {
  now?: () => number;
  random?: () => number;
}

const MIN_DURATION_MS: Record<CompanionLifeActivity, number> = {
  idle: 60_000,
  resting: 120_000,
  sleeping: 300_000,
  working: 180_000,
  listening_music: 120_000,
  thinking: 90_000,
  exploring: 180_000,
  returning: 60_000,
  waiting: 30_000,
  interacting: 0
};

const PREFERRED_DURATION_MS: Record<CompanionLifeActivity, number> = {
  idle: 180_000,
  resting: 300_000,
  sleeping: 600_000,
  working: 360_000,
  listening_music: 240_000,
  thinking: 180_000,
  exploring: 300_000,
  returning: 120_000,
  waiting: 60_000,
  interacting: 0
};

const DAYTIME: CompanionLifeActivity[] = ['idle', 'resting', 'thinking', 'listening_music'];
const NIGHTTIME: CompanionLifeActivity[] = ['idle', 'resting', 'sleeping', 'thinking'];

export class LifeCoordinator {
  private readonly states = new Map<string, CompanionLifeState>();
  private readonly lastMusicAt = new Map<string, number>();
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(deps: LifeCoordinatorDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
  }

  getState(companionId?: string): CompanionLifeState | null {
    return companionId ? this.states.get(companionId) ?? null : this.states.values().next().value ?? null;
  }

  initialize(companionId: string, activity: CompanionLifeActivity = 'idle', reason = 'startup'): CompanionLifeState {
    const state = this.createState(companionId, activity, reason);
    this.states.set(companionId, state);
    return state;
  }

  canTransition(companionId: string): boolean {
    const state = this.states.get(companionId);
    return !state || this.now() >= new Date(state.minimumEndAt).getTime();
  }

  selectNextActivity(companionId: string, input: {
    conversationActive: boolean;
    companionDragging: boolean;
    hasPendingAction: boolean;
    localHour: number;
  }): CompanionLifeActivity {
    if (input.conversationActive || input.companionDragging) {
      return 'interacting';
    }
    if (input.hasPendingAction) {
      return 'waiting';
    }

    const previous = this.states.get(companionId)?.activity;
    const allowSleep = input.localHour >= 23 || input.localHour < 6;
    const candidates = (allowSleep ? NIGHTTIME : DAYTIME).filter((a) => a !== previous);

    const pool = candidates.filter((a) => {
      if (a === 'listening_music' && this.now() - (this.lastMusicAt.get(companionId) ?? 0) < 600_000) return false;
      return true;
    });

    const chosen = pool[Math.floor(this.random() * pool.length)] ?? 'idle';
    if (chosen === 'listening_music') this.lastMusicAt.set(companionId, this.now());
    return chosen;
  }

  transition(companionId: string, activity: CompanionLifeActivity, reason: string): CompanionLifeState {
    const previous = this.states.get(companionId)?.activity;
    const state: CompanionLifeState = {
      ...this.createState(companionId, activity, reason),
      previousActivity: previous
    };
    this.states.set(companionId, state);
    return state;
  }

  interrupt(companionId: string, override: CompanionLifeActivity, reason: string): CompanionLifeState {
    const previous = this.states.get(companionId)?.activity;
    const state: CompanionLifeState = {
      ...this.createState(companionId, override, reason),
      previousActivity: previous,
      interruptibility: 'restricted'
    };
    this.states.set(companionId, state);
    return state;
  }

  restoreAfterOverride(companionId: string): CompanionLifeActivity {
    const state = this.states.get(companionId);
    if (!state) return 'idle';
    const prev = state.previousActivity;
    if (prev && prev !== 'interacting') {
      this.transition(companionId, prev, 'restore after override');
      return prev;
    }
    this.transition(companionId, 'idle', 'override expired');
    return 'idle';
  }

  private createState(companionId: string, activity: CompanionLifeActivity, reason: string): CompanionLifeState {
    const started = this.now();
    const minMs = MIN_DURATION_MS[activity] ?? 60_000;
    const prefMs = PREFERRED_DURATION_MS[activity] ?? 120_000;
    return {
      companionId,
      activity,
      startedAt: new Date(started).toISOString(),
      minimumEndAt: new Date(started + minMs).toISOString(),
      preferredEndAt: new Date(started + prefMs).toISOString(),
      interruptibility: activity === 'interacting' ? 'restricted' : activity === 'waiting' ? 'soft' : 'free',
      reason
    };
  }
}
