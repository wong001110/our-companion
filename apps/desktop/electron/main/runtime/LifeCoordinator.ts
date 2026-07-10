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

const SELECTABLE: CompanionLifeActivity[] = ['idle', 'resting', 'thinking', 'listening_music'];

export class LifeCoordinator {
  private state: CompanionLifeState | null = null;
  private lastMusicAt = 0;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(deps: LifeCoordinatorDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
  }

  getState(): CompanionLifeState | null {
    return this.state;
  }

  initialize(companionId: string, activity: CompanionLifeActivity = 'idle', reason = 'startup'): CompanionLifeState {
    this.state = this.createState(companionId, activity, reason);
    return this.state;
  }

  canTransition(companionId: string): boolean {
    if (!this.state || this.state.companionId !== companionId) return true;
    return this.now() >= new Date(this.state.minimumEndAt).getTime();
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

    const previous = this.state?.activity;
    const candidates = SELECTABLE.filter((a) => a !== previous);

    const hour = input.localHour;
    const allowSleep = hour >= 23 || hour < 6;
    const pool = candidates.filter((a) => {
      if (a === 'sleeping' && !allowSleep) return false;
      if (a === 'listening_music' && this.now() - this.lastMusicAt < 600_000) return false;
      return true;
    });

    const chosen = pool[Math.floor(this.random() * pool.length)] ?? 'idle';
    if (chosen === 'listening_music') this.lastMusicAt = this.now();
    return chosen;
  }

  transition(companionId: string, activity: CompanionLifeActivity, reason: string): CompanionLifeState {
    const previous = this.state?.activity;
    this.state = {
      ...this.createState(companionId, activity, reason),
      previousActivity: previous
    };
    return this.state;
  }

  interrupt(companionId: string, override: CompanionLifeActivity, reason: string): CompanionLifeState {
    const previous = this.state?.companionId === companionId ? this.state.activity : undefined;
    this.state = {
      ...this.createState(companionId, override, reason),
      previousActivity: previous,
      interruptibility: 'restricted'
    };
    return this.state;
  }

  restoreAfterOverride(companionId: string): CompanionLifeActivity {
    if (!this.state || this.state.companionId !== companionId) return 'idle';
    const prev = this.state.previousActivity;
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
