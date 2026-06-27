import type {
  CharacterRuntimeState,
  Discovery,
  DiscoveryCandidate,
  DiscoveryReason,
  DiscoverySource,
  NormalizedDiscovery
} from '@our-companion/shared';
import { DOMAIN_EVENT_TYPES } from '@our-companion/shared';
import { createEvent, globalEventBus, type EventBus } from '@our-companion/event-bus';

export interface DiscoveryAnnouncePayload {
  discoveryId: string;
  title: string;
  message: string;
  phase?: 'card' | 'speech';
  cycleId?: string;
  insightId?: string;
  cardBody?: string;
  whyThisMatters?: string;
  recommendedAction?: 'view' | 'save' | 'ignore' | 'add_to_journey';
  tags?: string[];
  source?: string;
}

export interface DiscoveryShareQueueItemDebug {
  id: string;
  title: string;
  kind: 'discovery' | 'candidate';
  cycleId?: string;
  dedupeKey: string;
  status: 'queued' | 'surfacing' | 'announced';
}

export interface DiscoveryShareQueueDebugState {
  queueLength: number;
  processing: boolean;
  currentItemId?: string;
  lastCardAt?: string;
  lastSpeechAt?: string;
  items: DiscoveryShareQueueItemDebug[];
}

export interface DiscoveryShareOrchestratorDeps {
  getState: () => CharacterRuntimeState;
  saveState: (state: CharacterRuntimeState) => CharacterRuntimeState;
  generateReason: (discovery: NormalizedDiscovery) => Promise<DiscoveryReason>;
  markAnnounced: (id: string) => void;
  canAnnounce: () => boolean;
  shouldInterruptShare: () => boolean;
  eventBus?: EventBus;
  logFoundationEvent?: (type: string, payload: Record<string, unknown>) => void;
}

interface ShareQueueItem {
  id: string;
  discoveryId: string;
  normalized: NormalizedDiscovery;
  kind: 'discovery' | 'candidate';
  cycleId?: string;
  dedupeKey: string;
}

const STEP_DELAY_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function discoveryToQueueItem(discovery: Discovery): ShareQueueItem {
  const source = discovery.source;
  return {
    id: discovery.id,
    discoveryId: discovery.id,
    normalized: discovery as NormalizedDiscovery,
    kind: 'discovery',
    dedupeKey: discovery.url ?? `${discovery.title.toLowerCase()}::${source}`
  };
}

function candidateToQueueItem(candidate: DiscoveryCandidate, cycleId?: string): ShareQueueItem {
  const sourceLabel = candidate.sourceName ?? candidate.sourceType;
  const source = (['github', 'hackernews', 'reddit', 'youtube'].includes(sourceLabel)
    ? sourceLabel
    : 'hackernews') as DiscoverySource;
  return {
    id: candidate.id,
    discoveryId: candidate.id,
    normalized: {
      source,
      title: candidate.title,
      summary: candidate.summary,
      url: candidate.sourceUrl,
      tags: [],
      raw: {}
    },
    kind: 'candidate',
    cycleId,
    dedupeKey: candidate.sourceUrl?.toLowerCase() ?? `${candidate.title.toLowerCase()}::${sourceLabel}`
  };
}

export class DiscoveryShareOrchestrator {
  private readonly queue: ShareQueueItem[] = [];
  private processing = false;
  private stopped = false;
  private currentItemId?: string;
  private lastCardAt?: string;
  private lastSpeechAt?: string;
  private readonly announcedIds = new Set<string>();

  constructor(private readonly deps: DiscoveryShareOrchestratorDeps) {}

  enqueue(discoveries: Discovery[]): void {
    for (const discovery of discoveries) {
      const item = discoveryToQueueItem(discovery);
      if (!this.queue.some((queued) => queued.id === item.id)) {
        this.queue.push(item);
      }
    }
    this.logQueueState('enqueue_discovery');
    void this.processQueue();
  }

  enqueueCandidates(candidates: DiscoveryCandidate[], cycleId?: string): void {
    for (const candidate of candidates) {
      const item = candidateToQueueItem(candidate, cycleId);
      if (!this.queue.some((queued) => queued.id === item.id)) {
        this.queue.push(item);
      }
    }
    this.logQueueState('enqueue_candidates');
    void this.processQueue();
  }

  getQueueDebugState(): DiscoveryShareQueueDebugState {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      currentItemId: this.currentItemId,
      lastCardAt: this.lastCardAt,
      lastSpeechAt: this.lastSpeechAt,
      items: this.queue.map((item) => ({
        id: item.id,
        title: item.normalized.title,
        kind: item.kind,
        cycleId: item.cycleId,
        dedupeKey: item.dedupeKey,
        status: item.id === this.currentItemId ? 'surfacing' : 'queued'
      }))
    };
  }

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.currentItemId = undefined;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    (this.deps.eventBus ?? globalEventBus).emit(createEvent({ type, source: 'discovery-share-orchestrator', payload }));
  }

  private logQueueState(trigger: string): void {
    this.deps.logFoundationEvent?.('DiscoveryShareQueueUpdated', {
      trigger,
      ...this.getQueueDebugState()
    });
  }

  private emitAnnouncePayload(payload: DiscoveryAnnouncePayload): void {
    this.emitEvent(DOMAIN_EVENT_TYPES.AnnMessageQueued, { ...payload });
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

        const item = this.queue.shift();
        if (!item) break;

        await this.announceItem(item);
      }
    } finally {
      this.processing = false;
      this.currentItemId = undefined;
      this.logQueueState('queue_idle');
      if (!this.stopped && this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }

  private async announceItem(item: ShareQueueItem): Promise<void> {
    while (!this.deps.canAnnounce() && !this.stopped) {
      await delay(STEP_DELAY_MS);
    }
    if (!this.deps.canAnnounce()) {
      this.queue.unshift(item);
      return;
    }

    this.currentItemId = item.id;
    this.logQueueState('surface_start');

    this.emitEvent(DOMAIN_EVENT_TYPES.DiscoveryReadyToShare, {
      discoveryId: item.discoveryId,
      source: 'discovery-share-orchestrator'
    });

    const reason = await this.deps.generateReason(item.normalized);
    const cardPayload: DiscoveryAnnouncePayload = {
      discoveryId: item.discoveryId,
      title: reason.card_title ?? item.normalized.title,
      message: '',
      phase: 'card',
      cycleId: item.cycleId,
      cardBody: reason.card_body ?? reason.why_this_matters,
      whyThisMatters: reason.why_this_matters,
      recommendedAction: reason.recommended_action,
      tags: reason.tags ?? item.normalized.tags ?? [],
      source: item.normalized.source
    };

    this.lastCardAt = new Date().toISOString();
    this.emitAnnouncePayload(cardPayload);
    this.deps.logFoundationEvent?.('DiscoveryCardSurfaced', {
      discoveryId: item.discoveryId,
      cycleId: item.cycleId,
      surfacedAt: this.lastCardAt,
      title: cardPayload.title
    });

    const { advanceCharacter, applyEmotionEvent } = await import('@our-companion/character-engine');
    const discovery = item.normalized as Discovery;
    const context = { availableDiscoveries: [discovery], userActive: false };
    let state = this.deps.getState();

    for (let step = 0; step < 4; step += 1) {
      if (this.stopped) {
        this.queue.unshift(item);
        return;
      }
      if (step > 0 && this.deps.shouldInterruptShare()) {
        this.queue.unshift(item);
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
        this.lastSpeechAt = new Date().toISOString();
        this.emitAnnouncePayload({
          discoveryId: item.discoveryId,
          title: cardPayload.title,
          message: reason.short_message,
          phase: 'speech',
          cycleId: item.cycleId,
          cardBody: cardPayload.cardBody,
          whyThisMatters: reason.why_this_matters,
          recommendedAction: reason.recommended_action,
          tags: cardPayload.tags,
          source: item.normalized.source
        });
        this.deps.logFoundationEvent?.('DiscoverySpeechStarted', {
          discoveryId: item.discoveryId,
          cycleId: item.cycleId,
          speechAt: this.lastSpeechAt,
          shortMessage: reason.short_message
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

    if (item.kind === 'discovery') {
      this.deps.markAnnounced(item.discoveryId);
    }
    this.announcedIds.add(item.id);
    this.currentItemId = undefined;
    this.logQueueState('surface_complete');
  }
}
