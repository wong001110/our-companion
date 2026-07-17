import { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay } from '@our-companion/discovery-engine';
import type { Discovery } from '@our-companion/shared';

export interface DiscoveryRefreshResult {
  discoveries: Discovery[];
  newlyInserted: Discovery[];
}

export interface DiscoveryPresentationGateway {
  isBusy(): boolean;
  hasPending(): boolean;
  requestPresentation(discovery: Discovery): void;
}

export interface DiscoverySchedulerDeps {
  refresh: () => Promise<DiscoveryRefreshResult>;
  getDiscoveryScore: () => number;
  countAnnouncedToday: () => number;
  getOldestQueuedDiscovery: () => Promise<Discovery | null>;
  presentationGateway: DiscoveryPresentationGateway;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

const DAILY_SHARE_CAP = 10;

export interface DiscoverySchedulerTickResult {
  status: 'completed' | 'empty' | 'skipped' | 'failed';
  presentedDiscoveryId?: string;
  reason?: string;
  error?: string;
}

export class DiscoveryScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstRun = true;
  private stopped = false;

  constructor(private readonly deps: DiscoverySchedulerDeps) {}

  start(): void {
    this.stopped = false;
    this.scheduleNext(this.firstRun ? DISCOVERY_STARTUP_DELAY_MS : this.nextDelay());
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) {
      (this.deps.clearTimer ?? clearTimeout)(this.timer);
      this.timer = undefined;
    }
  }

  private nextDelay(): number {
    return getDiscoveryFetchDelay(this.deps.getDiscoveryScore());
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer !== undefined) {
      (this.deps.clearTimer ?? clearTimeout)(this.timer);
    }
    this.timer = (this.deps.setTimer ?? setTimeout)(() => {
      this.timer = undefined;
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    try {
      await this.runOnce();
    } finally {
      this.firstRun = false;
      this.scheduleNext(this.nextDelay());
    }
  }

  async runOnce(): Promise<DiscoverySchedulerTickResult> {
    if (this.stopped) return { status: 'skipped', reason: 'stopped' };
    if (this.deps.presentationGateway.isBusy() || this.deps.presentationGateway.hasPending()) {
      return { status: 'skipped', reason: 'presentation_busy' };
    }

    try {
      if (this.deps.countAnnouncedToday() < DAILY_SHARE_CAP) {
        const result = await this.deps.refresh();
        const newestEligible = result.newlyInserted.find((discovery) => discovery.status === 'eligible');
        if (newestEligible) {
          this.deps.presentationGateway.requestPresentation(newestEligible);
          return { status: 'completed', presentedDiscoveryId: newestEligible.id };
        }
        if (result.newlyInserted.length === 0) {
          return { status: 'empty', reason: 'no_valid_discoveries' };
        }
      }

      const oldest = await this.deps.getOldestQueuedDiscovery();
      if (oldest) {
        this.deps.presentationGateway.requestPresentation(oldest);
        return { status: 'completed', presentedDiscoveryId: oldest.id };
      }
      return { status: 'empty', reason: 'no_queued_discoveries' };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
