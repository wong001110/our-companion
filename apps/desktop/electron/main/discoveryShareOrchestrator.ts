import type {
  CommandAckStatus,
  CompanionCommand,
  Discovery,
  DiscoveryReason,
  NormalizedDiscovery
} from '@our-companion/shared';
import { DOMAIN_EVENT_TYPES, nowIso } from '@our-companion/shared';
import { createEvent, globalEventBus, type EventBus } from '@our-companion/event-bus';

export type DiscoveryShareStatus =
  | 'queued'
  | 'presenting'
  | 'announced'
  | 'deferred'
  | 'failed';

export interface QueuedDiscovery {
  command: CompanionCommand;
  discovery: Discovery;
  status: DiscoveryShareStatus;
  retryCount: number;
  enqueuedAt: string;
  presentedAt?: string;
  announcedAt?: string;
  interruptCount: number;
  error?: string;
}

export interface DiscoveryPerformanceGateway {
  begin(companionId: string): void;
  settle(companionId: string): void;
}

export interface DiscoveryShareOrchestratorDeps {
  performance: DiscoveryPerformanceGateway;
  generateReason: (discovery: NormalizedDiscovery) => Promise<DiscoveryReason>;
  markPresenting: (discoveryId: string, commandId: string) => void;
  markAnnounced: (discoveryId: string, commandId: string) => void;
  markDeferred: (discoveryId: string, reason: string) => void;
  canAnnounce: () => boolean;
  shouldInterruptShare: () => boolean;
  eventBus?: EventBus;
  now?: () => string;
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

/**
 * Executes an already-approved presentation command.
 *
 * Character state belongs to CompanionRuntime through `performance`; the
 * renderer command acknowledgement is the only authority that can announce a
 * Discovery.
 */
export class DiscoveryShareOrchestrator {
  private queue: QueuedDiscovery[] = [];
  private busy = false;
  private stopped = false;
  private processing = false;
  private lastTickAt: string | undefined;
  private lastSkipReason: string | undefined;
  private lastAnnouncedId: string | undefined;
  private simulateCanAnnounceDisabled = false;
  private simulateInterruptEnabled = false;
  private readonly now: () => string;

  constructor(private readonly deps: DiscoveryShareOrchestratorDeps) {
    this.now = deps.now ?? nowIso;
  }

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
    return {
      canAnnounceDisabled: this.simulateCanAnnounceDisabled,
      interruptEnabled: this.simulateInterruptEnabled
    };
  }

  private canAnnounceNow(): boolean {
    return !this.simulateCanAnnounceDisabled && this.deps.canAnnounce();
  }

  private shouldInterruptNow(): boolean {
    return this.simulateInterruptEnabled || this.deps.shouldInterruptShare();
  }

  isBusy(): boolean {
    return this.busy;
  }

  hasPending(): boolean {
    return this.queue.some((entry) =>
      entry.status === 'queued' || entry.status === 'presenting' || entry.status === 'deferred'
    );
  }

  getPendingDiscoveryId(): string | undefined {
    return this.queue.find((entry) => entry.status === 'presenting')?.discovery.id ??
      this.queue.find((entry) => entry.status === 'queued')?.discovery.id;
  }

  getQueueLength(): number {
    return this.queue.filter((entry) =>
      entry.status === 'queued' || entry.status === 'presenting' || entry.status === 'deferred'
    ).length;
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

  getNextRetryAt(): undefined {
    return undefined;
  }

  enqueue(command: CompanionCommand, discovery: Discovery): boolean {
    if (this.stopped) {
      this.lastSkipReason = 'stopped';
      return false;
    }
    if (
      command.discoveryId !== discovery.id ||
      (Boolean(discovery.companionId) && command.companionId !== discovery.companionId)
    ) {
      this.lastSkipReason = 'command_mismatch';
      return false;
    }
    if (discovery.status === 'announced' || discovery.announcedAt) {
      this.lastSkipReason = 'already_announced';
      return false;
    }

    const canonicalUrl = normalizeUrl(discovery.url);
    const normalizedTitle = normalizeTitle(discovery.title);
    const active = this.queue.filter((entry) =>
      entry.status === 'queued' || entry.status === 'presenting' || entry.status === 'deferred'
    );
    const duplicate = active.some((entry) => {
      if (entry.command.id === command.id || entry.discovery.id === discovery.id) return true;
      const queuedUrl = normalizeUrl(entry.discovery.url);
      if (canonicalUrl && queuedUrl && canonicalUrl === queuedUrl) return true;
      return normalizedTitle.length > 0 &&
        normalizeTitle(entry.discovery.title) === normalizedTitle &&
        entry.discovery.source === discovery.source;
    });
    if (duplicate) {
      this.lastSkipReason = 'duplicate';
      return false;
    }

    this.queue.push({
      command,
      discovery,
      status: 'queued',
      retryCount: 0,
      interruptCount: 0,
      enqueuedAt: this.now()
    });
    this.lastTickAt = this.now();
    this.lastSkipReason = undefined;
    void this.processQueue();
    return true;
  }

  acknowledge(commandId: string, status: CommandAckStatus, reason?: string): boolean {
    const entry = this.queue.find((candidate) => candidate.command.id === commandId);
    if (!entry) return false;

    if (status === 'started') {
      if (entry.status !== 'presenting') return false;
      this.deps.markPresenting(entry.discovery.id, entry.command.id);
      return true;
    }
    if (status === 'received') return true;
    if (entry.status !== 'presenting') return false;

    this.deps.performance.settle(entry.command.companionId);
    this.busy = false;

    if (status === 'completed') {
      entry.status = 'announced';
      entry.announcedAt = this.now();
      this.lastAnnouncedId = entry.discovery.id;
      this.deps.markAnnounced(entry.discovery.id, entry.command.id);
    } else {
      entry.status = status === 'failed' ? 'failed' : 'deferred';
      entry.interruptCount += 1;
      entry.retryCount += 1;
      entry.error = reason;
      this.lastSkipReason = reason ?? status;
      this.deps.markDeferred(entry.discovery.id, reason ?? status);
    }

    this.queue = this.queue.filter((candidate) => candidate.command.id !== commandId);
    void this.processQueue();
    return true;
  }

  stop(): void {
    const presenting = this.queue.find((entry) => entry.status === 'presenting');
    if (presenting) this.deps.performance.settle(presenting.command.companionId);
    this.stopped = true;
    this.queue = [];
    this.busy = false;
    this.processing = false;
    this.lastSkipReason = undefined;
  }

  clearQueue(): void {
    const presenting = this.queue.find((entry) => entry.status === 'presenting');
    if (presenting) this.deps.performance.settle(presenting.command.companionId);
    this.queue = [];
    this.busy = false;
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    (this.deps.eventBus ?? globalEventBus).emit(
      createEvent({ type, source: 'discovery-share-orchestrator', payload })
    );
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.stopped || this.busy) return;
    const entry = this.queue.find((candidate) => candidate.status === 'queued');
    if (!entry) return;
    this.processing = true;

    try {
      if (!this.canAnnounceNow()) {
        entry.status = 'deferred';
        entry.retryCount += 1;
        this.lastSkipReason = 'cannot_announce';
        this.deps.markDeferred(entry.discovery.id, 'cannot_announce');
        this.queue = this.queue.filter((candidate) => candidate.command.id !== entry.command.id);
        return;
      }
      if (this.shouldInterruptNow()) {
        entry.status = 'deferred';
        entry.interruptCount += 1;
        entry.retryCount += 1;
        this.lastSkipReason = 'interrupted_before_start';
        this.deps.markDeferred(entry.discovery.id, 'interrupted_before_start');
        this.queue = this.queue.filter((candidate) => candidate.command.id !== entry.command.id);
        return;
      }

      entry.status = 'presenting';
      entry.presentedAt = this.now();
      this.busy = true;
      this.deps.performance.begin(entry.command.companionId);

      this.emitEvent(DOMAIN_EVENT_TYPES.DiscoveryReadyToShare, {
        discoveryId: entry.discovery.id,
        commandId: entry.command.id,
        source: 'discovery-share-orchestrator'
      });

      const reason = await this.deps.generateReason(entry.discovery);
      if (this.shouldInterruptNow()) {
        this.acknowledge(entry.command.id, 'cancelled', 'interrupted_during_preparation');
        return;
      }
      this.emitEvent(DOMAIN_EVENT_TYPES.CompanionMessageQueued, {
        discoveryId: entry.discovery.id,
        commandId: entry.command.id,
        title: reason.card_title ?? entry.discovery.title,
        message: reason.short_message,
        cardBody: reason.card_body ?? reason.why_this_matters,
        whyThisMatters: reason.why_this_matters,
        recommendedAction: reason.recommended_action,
        tags: reason.tags ?? entry.discovery.tags ?? [],
        source: entry.discovery.source,
        sourceUrl: entry.discovery.url
      });
    } catch (error) {
      this.acknowledge(
        entry.command.id,
        'failed',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.processing = false;
    }
  }
}
