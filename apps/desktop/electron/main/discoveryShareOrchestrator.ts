import type { CharacterRuntimeState, Discovery, DiscoveryReason, EmotionState, NormalizedDiscovery } from '@our-companion/shared';
import { DOMAIN_EVENT_TYPES } from '@our-companion/shared';
import { createEvent, globalEventBus, type EventBus } from '@our-companion/event-bus';

export interface DiscoveryAnnouncePayload {
  discoveryId: string;
  title: string;
  message: string;
  cardBody?: string;
  whyThisMatters?: string;
  recommendedAction?: 'view' | 'save' | 'ignore' | 'add_to_journey';
  tags?: string[];
  source?: string;
}

export interface DiscoveryShareOrchestratorDeps {
  getState: () => CharacterRuntimeState;
  saveState: (state: CharacterRuntimeState) => CharacterRuntimeState;
  generateReason: (discovery: NormalizedDiscovery) => Promise<DiscoveryReason>;
  markAnnounced: (id: string) => void;
  canAnnounce: () => boolean;
  shouldInterruptShare: () => boolean;
  eventBus?: EventBus;
}

const STEP_DELAY_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DiscoveryShareOrchestrator {
  private readonly queue: Discovery[] = [];
  private processing = false;
  private stopped = false;

  constructor(private readonly deps: DiscoveryShareOrchestratorDeps) {}

  enqueue(discoveries: Discovery[]): void {
    for (const discovery of discoveries) {
      if (!this.queue.some((item) => item.id === discovery.id)) {
        this.queue.push(discovery);
      }
    }
    void this.processQueue();
  }

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    (this.deps.eventBus ?? globalEventBus).emit(createEvent({ type, source: 'discovery-share-orchestrator', payload }));
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;

    try {
      while (!this.stopped && this.queue.length > 0) {
        if (!this.deps.canAnnounce()) {
          await delay(STEP_DELAY_MS);
          continue;
        }

        const discovery = this.queue.shift();
        if (!discovery) break;

        await this.announceDiscovery(discovery);
      }
    } finally {
      this.processing = false;
      if (!this.stopped && this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }

  private async announceDiscovery(discovery: Discovery): Promise<void> {
    while (!this.deps.canAnnounce() && !this.stopped) {
      await delay(STEP_DELAY_MS);
    }
    if (!this.deps.canAnnounce()) {
      this.queue.unshift(discovery);
      return;
    }

    this.emitEvent(DOMAIN_EVENT_TYPES.DiscoveryReadyToShare, {
      discoveryId: discovery.id,
      source: 'discovery-share-orchestrator'
    });

    const { advanceCharacter, applyEmotionEvent } = await import('@our-companion/character-engine');
    const context = { availableDiscoveries: [discovery as NormalizedDiscovery], userActive: false };
    let state = this.deps.getState();

    for (let step = 0; step < 4; step += 1) {
      if (this.stopped) {
        this.queue.unshift(discovery);
        return;
      }
      if (step > 0 && this.deps.shouldInterruptShare()) {
        this.queue.unshift(discovery);
        return;
      }

      state = advanceCharacter(state, context);
      if (step === 0) {
        state = {
          ...state,
          emotion: applyEmotionEvent(state.emotion, 'new_high_score_discovery')
        };
      }

      state = this.deps.saveState(state);
      this.emitEvent(DOMAIN_EVENT_TYPES.CharacterStateChanged, {
        characterId: state.characterId,
        coreState: state.coreState,
        intent: state.intent
      });

      if (state.coreState === 'talking') {
        const reason = await this.deps.generateReason(discovery);
        this.emitEvent(DOMAIN_EVENT_TYPES.AnnMessageQueued, {
          discoveryId: discovery.id,
          title: reason.card_title ?? discovery.title,
          message: reason.short_message,
          cardBody: reason.card_body ?? reason.why_this_matters,
          whyThisMatters: reason.why_this_matters,
          recommendedAction: reason.recommended_action,
          tags: reason.tags ?? discovery.tags ?? [],
          source: discovery.source
        });
      }

      if (step < 3) {
        await delay(STEP_DELAY_MS);
      }
    }

    const settled: CharacterRuntimeState = {
      ...state,
      intent: 'waiting',
      coreState: 'idle',
      updatedAt: new Date().toISOString()
    };
    const saved = this.deps.saveState(settled);
    this.emitEvent(DOMAIN_EVENT_TYPES.CharacterStateChanged, {
      characterId: saved.characterId,
      coreState: saved.coreState,
      intent: saved.intent
    });
    this.deps.markAnnounced(discovery.id);
  }
}
