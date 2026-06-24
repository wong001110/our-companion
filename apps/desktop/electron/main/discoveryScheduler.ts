import { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay } from '@our-companion/character-engine';
import type { Discovery } from '@our-companion/shared';

export interface DiscoveryRefreshResult {
  discoveries: Discovery[];
  newlyInserted: Discovery[];
}

export interface DiscoveryShareQueue {
  enqueue(discoveries: Discovery[]): void;
}

export interface DiscoverySchedulerDeps {
  refresh: () => Promise<DiscoveryRefreshResult>;
  listUnannouncedShared: (limit?: number) => Discovery[];
  getDiscoveryScore: () => number;
  countSharedToday: () => number;
  shareOrchestrator: DiscoveryShareQueue;
}

const DAILY_SHARE_CAP = 10;

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
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private nextDelay(): number {
    return getDiscoveryFetchDelay(this.deps.getDiscoveryScore());
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    try {
      if (this.deps.countSharedToday() < DAILY_SHARE_CAP) {
        const result = await this.deps.refresh();
        const toAnnounce = result.newlyInserted.filter((discovery) => discovery.status === 'shared');
        if (toAnnounce.length > 0) {
          this.deps.shareOrchestrator.enqueue(toAnnounce);
        }
      }

      const backlog = this.deps.listUnannouncedShared(10);
      if (backlog.length > 0) {
        this.deps.shareOrchestrator.enqueue(backlog);
      }
    } catch (error) {
      console.warn('[our-companion] Discovery scheduler tick failed.', error);
    } finally {
      this.firstRun = false;
      this.scheduleNext(this.nextDelay());
    }
  }
}
