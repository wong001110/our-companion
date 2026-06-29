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

export type DiscoveryShareStatus = 'queued' | 'presenting' | 'announced' | 'interrupted' | 'deferred' | 'failed';

export interface QueuedDiscovery {
  discovery: Discovery;
  status: DiscoveryShareStatus;
  retryCount: number;
  enqueuedAt: string;
  presentedAt?: string;
  interruptedAt?: string;
  announcedAt?: string;
  retryAfterAt?: number;
  interruptCount: number;
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
const MAX_RETRY_COUNT = 3;

const COOLDOWN_MS = [0, 120_000, 300_000, 900_000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'ref' || key === 'fbclid' || key === 'gclid') {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    return parsed.toString().toLowerCase().replace(/\/+$/, '');
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

export class DiscoveryShareOrchestrator {
  private queue: QueuedDiscovery[] = [];
  private busy = false;
  private stopped = false;
  private processing = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private lastTickAt: string | undefined;
  private lastSkipReason: string | undefined;
  private lastAnnouncedId: string | undefined;
  private nextRetryAt: number | undefined;
  private simulateCanAnnounceDisabled = false;
  private simulateInterruptEnabled = false;

  constructor(private readonly deps: DiscoveryShareOrchestratorDeps) {}

  setSimulateCanAnnounceDisabled(disabled: boolean): void {
    this.simulateCanAnnounceDisabled = disabled;
  }

  setSimulateInterruptEnabled(enabled: boolean): void {
    this.simulateInterruptEnabled = enabled;
  }

  clearSimulation(): void {
    this.simulateCanAnnounceDisabled = false;
    this.simulateInterruptEnabled = false;
  }

  isSimulating(): { canAnnounceDisabled: boolean; interruptEnabled: boolean } {
    return { canAnnounceDisabled: this.simulateCanAnnounceDisabled, interruptEnabled: this.simulateInterruptEnabled };
  }

  private canAnnounceNow(): boolean {
    if (this.simulateCanAnnounceDisabled) return false;
    return this.deps.canAnnounce();
  }

  private shouldInterruptNow(): boolean {
    if (this.simulateInterruptEnabled) return true;
    return this.deps.shouldInterruptShare();
  }

  isBusy(): boolean {
    return this.busy;
  }

  hasPending(): boolean {
    return this.queue.some((q) => q.status === 'queued');
  }

  getPendingDiscoveryId(): string | undefined {
    const current = this.queue.find((q) => q.status === 'presenting');
    return current?.discovery.id ?? this.queue.find((q) => q.status === 'queued')?.discovery.id;
  }

  getQueueLength(): number {
    return this.queue.filter((q) => q.status === 'queued' || q.status === 'presenting' || q.status === 'deferred').length;
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

  isProcessing(): boolean {
    return this.processing;
  }

  getNextRetryAt(): number | undefined {
    return this.nextRetryAt;
  }

  enqueue(discovery: Discovery): boolean {
    if (this.stopped) { this.lastSkipReason = 'stopped'; return false; }

    const canonicalUrl = normalizeUrl(discovery.url);
    const normalizedTitle = normalizeTitle(discovery.title);
    const active = this.queue.filter((q) => q.status === 'queued' || q.status === 'presenting' || q.status === 'deferred');

    const isDuplicate = active.some((q) => {
      if (q.discovery.id === discovery.id) return true;
      const qUrl = normalizeUrl(q.discovery.url);
      if (canonicalUrl && qUrl && qUrl === canonicalUrl) return true;
      if (normalizedTitle && normalizeTitle(q.discovery.title) === normalizedTitle &&
        q.discovery.source === discovery.source) return true;
      return false;
    });

    if (isDuplicate) { this.lastSkipReason = 'duplicate'; return false; }
    if (this.lastAnnouncedId === discovery.id) { this.lastSkipReason = 'already_announced'; return false; }

    this.queue.push({
      discovery,
      status: 'queued',
      retryCount: 0,
      interruptCount: 0,
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
    this.processing = false;
    this.nextRetryAt = undefined;
    this.lastSkipReason = undefined;
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  clearQueue(): void {
    this.queue = [];
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    this.nextRetryAt = undefined;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    (this.deps.eventBus ?? globalEventBus).emit(createEvent({ type, source: 'discovery-share-orchestrator', payload }));
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;

    try {
      while (!this.stopped && this.queue.length > 0) {
        for (const q of this.queue) {
          if (q.status === 'deferred' && q.retryAfterAt && Date.now() >= q.retryAfterAt) {
            q.status = 'queued';
            q.retryAfterAt = undefined;
          }
        }

        this.queue = this.queue.filter((q) => q.status !== 'announced' && q.status !== 'failed' && q.status !== 'interrupted');

        const entry = this.queue.find((q) => q.status === 'queued');
        if (!entry) break;

        if (!this.canAnnounceNow()) {
          let retries = 0;
          while (!this.canAnnounceNow() && retries < MAX_CAN_ANNOUNCE_RETRIES && !this.stopped) {
            this.lastSkipReason = 'cannot_announce';
            await delay(CAN_ANNOUNCE_WAIT_MS);
            retries++;
          }
          if (!this.canAnnounceNow()) {
            this.lastSkipReason = 'cannot_announce_timeout';
            break;
          }
        }

        entry.status = 'presenting';
        entry.presentedAt = new Date().toISOString();
        this.busy = true;
        try {
          await this.announceDiscovery(entry);
        } finally {
          this.busy = false;
        }
      }
    } finally {
      this.processing = false;
      this.nextRetryAt = undefined;
    }
    this.scheduleRetryTimer();
  }

  private scheduleRetryTimer(): void {
    if (this.stopped) return;

    const deferredEntries = this.queue.filter((q) => q.status === 'deferred' && q.retryAfterAt);
    const nearest = deferredEntries.length > 0
      ? deferredEntries.reduce((min, q) => q.retryAfterAt! < min ? q.retryAfterAt! : min, Infinity)
      : undefined;
    this.nextRetryAt = Number.isFinite(nearest) ? nearest : undefined;

    if (this.nextRetryAt === undefined) {
      if (this.retryTimer !== undefined) {
        clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
      }
      return;
    }

    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    const waitMs = Math.max(0, this.nextRetryAt - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (!this.stopped) void this.processQueue();
    }, waitMs + 1000);
  }

  private async announceDiscovery(entry: QueuedDiscovery): Promise<void> {
    while (!this.canAnnounceNow() && !this.stopped) {
      await delay(STEP_DELAY_MS);
    }
    if (!this.canAnnounceNow()) {
      entry.status = 'interrupted';
      entry.interruptedAt = new Date().toISOString();
      entry.interruptCount++;
      entry.retryCount++;
      if (entry.retryCount < MAX_RETRY_COUNT) {
        const cooldown = COOLDOWN_MS[Math.min(entry.interruptCount, COOLDOWN_MS.length - 1)];
        entry.retryAfterAt = Date.now() + cooldown;
        entry.status = 'deferred';
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
        entry.status = 'failed';
        return;
      }
      if (step > 0 && this.shouldInterruptNow()) {
        entry.status = 'interrupted';
        entry.interruptedAt = new Date().toISOString();
        entry.interruptCount++;
        entry.retryCount++;
        if (entry.retryCount < MAX_RETRY_COUNT) {
          const cooldown = COOLDOWN_MS[Math.min(entry.interruptCount, COOLDOWN_MS.length - 1)];
          entry.retryAfterAt = Date.now() + cooldown;
          entry.status = 'deferred';
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
        this.emitEvent(DOMAIN_EVENT_TYPES.CompanionMessageQueued, {
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
