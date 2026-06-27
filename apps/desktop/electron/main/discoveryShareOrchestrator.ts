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
  sourceUrl?: string;
}

export type DiscoveryShareStatus = 'queued' | 'presenting' | 'interrupted' | 'announced';

export interface QueuedDiscovery {
  discovery: Discovery;
  status: DiscoveryShareStatus;
  retryCount: number;
  enqueuedAt: string;
  presentedAt?: string;
  interruptedAt?: string;
  announcedAt?: string;
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
const CAN_ANNOUNCE_WAIT_MS = 2000;
const MAX_CAN_ANNOUNCE_RETRIES = 5;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DiscoveryShareOrchestrator {
  private queue: QueuedDiscovery[] = [];
  private busy = false;
  private stopped = false;
  private lastTickAt: string | undefined;
  private lastSkipReason: string | undefined;
  private lastAnnouncedId: string | undefined;

  constructor(private readonly deps: DiscoveryShareOrchestratorDeps) {}

  isBusy(): boolean {
    return this.busy;
  }

  hasPending(): boolean {
    return this.queue.length > 0;
  }

  getPendingDiscoveryId(): string | undefined {
    const current = this.queue.find((q) => q.status === 'presenting');
    return current?.discovery.id ?? this.queue[0]?.discovery.id;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getQueue(): QueuedDiscovery[] {
    return [...this.queue];
  }

  getLastTickAt(): string | undefined {
    return this.lastTickAt;
  }

  getLastSkipReason(): string | undefined {
    return this.lastSkipReason;
  }

  getLastAnnouncedId(): string | undefined {
    return this.lastAnnouncedId;
  }

  enqueue(discovery: Discovery): boolean {
    if (this.stopped) { this.lastSkipReason = 'stopped'; return false; }
    const isActive = this.queue.some((q) => q.discovery.id === discovery.id && q.status !== 'interrupted') ||
      this.lastAnnouncedId === discovery.id;
    if (isActive) { this.lastSkipReason = 'duplicate'; return false; }
    this.queue.push({
      discovery,
      status: 'queued',
      retryCount: 0,
      enqueuedAt: new Date().toISOString()
    });
    this.lastTickAt = new Date().toISOString();
    this.lastSkipReason = undefined;
    void this.processQueue();
    return true;
  }

  stop(): void {
    this.stopped = true;
    this.queue = [];
    this.busy = false;
  }

  clearQueue(): void {
    this.queue = [];
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    (this.deps.eventBus ?? globalEventBus).emit(createEvent({ type, source: 'discovery-share-orchestrator', payload }));
  }

  private async processQueue(): Promise<void> {
    if (this.busy || this.stopped) return;

    while (!this.stopped && this.queue.length > 0) {
      if (!this.deps.canAnnounce()) {
        let retries = 0;
        while (!this.deps.canAnnounce() && retries < MAX_CAN_ANNOUNCE_RETRIES && !this.stopped) {
          this.lastSkipReason = 'cannot_announce';
          await delay(CAN_ANNOUNCE_WAIT_MS);
          retries++;
        }
        if (!this.deps.canAnnounce()) {
          this.lastSkipReason = 'cannot_announce_timeout';
          break;
        }
      }

      const entry = this.queue.shift()!;
      entry.status = 'presenting';
      entry.presentedAt = new Date().toISOString();
      this.busy = true;
      try {
        await this.announceDiscovery(entry);
      } finally {
        this.busy = false;
      }
    }
  }

  private async announceDiscovery(entry: QueuedDiscovery): Promise<void> {
    while (!this.deps.canAnnounce() && !this.stopped) {
      await delay(STEP_DELAY_MS);
    }
    if (!this.deps.canAnnounce()) {
      entry.status = 'interrupted';
      entry.interruptedAt = new Date().toISOString();
      entry.retryCount++;
      if (entry.retryCount < 3) {
        this.queue.unshift(entry);
      }
      return;
    }

    this.emitEvent(DOMAIN_EVENT_TYPES.DiscoveryReadyToShare, {
      discoveryId: entry.discovery.id,
      source: 'discovery-share-orchestrator'
    });

    const { advanceCharacter, applyEmotionEvent } = await import('@our-companion/character-engine');
    const context = { availableDiscoveries: [entry.discovery as NormalizedDiscovery], userActive: false };
    let state = this.deps.getState();

    for (let step = 0; step < 4; step += 1) {
      if (this.stopped) {
        entry.status = 'interrupted';
        entry.interruptedAt = new Date().toISOString();
        return;
      }
      if (step > 0 && this.deps.shouldInterruptShare()) {
        entry.status = 'interrupted';
        entry.interruptedAt = new Date().toISOString();
        entry.retryCount++;
        if (entry.retryCount < 3) {
          this.queue.unshift(entry);
        }
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

      if (step === 0) {
        const reason = await this.deps.generateReason(entry.discovery);
        this.emitEvent(DOMAIN_EVENT_TYPES.AnnMessageQueued, {
          discoveryId: entry.discovery.id,
          title: reason.card_title ?? entry.discovery.title,
          message: reason.short_message,
          cardBody: reason.card_body ?? reason.why_this_matters,
          whyThisMatters: reason.why_this_matters,
          recommendedAction: reason.recommended_action,
          tags: reason.tags ?? entry.discovery.tags ?? [],
          source: entry.discovery.source,
          sourceUrl: entry.discovery.url
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
    entry.status = 'announced';
    entry.announcedAt = new Date().toISOString();
    this.lastAnnouncedId = entry.discovery.id;
    this.deps.markAnnounced(entry.discovery.id);
  }
}
