import type { CharacterRuntimeState, Discovery, DiscoveryReason, NormalizedDiscovery } from '@our-companion/shared';
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
const CARD_RENDER_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DiscoveryShareOrchestrator {
  private pendingDiscovery: Discovery | undefined;
  private busy = false;
  private stopped = false;

  constructor(private readonly deps: DiscoveryShareOrchestratorDeps) {}

  isBusy(): boolean {
    return this.busy;
  }

  hasPending(): boolean {
    return this.pendingDiscovery !== undefined;
  }

  queue(discovery: Discovery): void {
    if (this.stopped) return;
    if (this.busy) return;
    if (this.pendingDiscovery?.id === discovery.id) return;
    this.pendingDiscovery = discovery;
    void this.processPending();
  }

  stop(): void {
    this.stopped = true;
    this.pendingDiscovery = undefined;
    this.busy = false;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    (this.deps.eventBus ?? globalEventBus).emit(createEvent({ type, source: 'discovery-share-orchestrator', payload }));
  }

  private async processPending(): Promise<void> {
    if (this.busy || this.stopped) return;
    const discovery = this.pendingDiscovery;
    if (!discovery) return;

    this.busy = true;
    this.pendingDiscovery = undefined;

    try {
      await this.announceDiscovery(discovery);
    } finally {
      this.busy = false;
    }
  }

  private async announceDiscovery(discovery: Discovery): Promise<void> {
    while (!this.deps.canAnnounce() && !this.stopped) {
      await delay(STEP_DELAY_MS);
    }
    if (!this.deps.canAnnounce()) return;

    this.emitEvent(DOMAIN_EVENT_TYPES.DiscoveryReadyToShare, {
      discoveryId: discovery.id,
      source: 'discovery-share-orchestrator'
    });

    const { advanceCharacter, applyEmotionEvent } = await import('@our-companion/character-engine');
    const context = { availableDiscoveries: [discovery as NormalizedDiscovery], userActive: false };
    let state = this.deps.getState();

    for (let step = 0; step < 4; step += 1) {
      if (this.stopped) return;
      if (step > 0 && this.deps.shouldInterruptShare()) return;

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
        await delay(CARD_RENDER_DELAY_MS);
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
