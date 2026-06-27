import { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay } from '@our-companion/discovery-engine';
import type { Discovery } from '@our-companion/shared';

export interface DiscoveryRefreshResult {
  discoveries: Discovery[];
  newlyInserted: Discovery[];
}

export interface DiscoveryAnnouncer {
  isBusy(): boolean;
  hasPending(): boolean;
  enqueue(discovery: Discovery): boolean;
}

export interface DiscoverySchedulerDeps {
  refresh: () => Promise<DiscoveryRefreshResult>;
  getDiscoveryScore: () => number;
  countSharedToday: () => number;
  getOldestUnannouncedShared: () => Promise<Discovery | null>;
  announcer: DiscoveryAnnouncer;
  runAutonomousCycle?: () => Promise<void>;
  countAutonomousCyclesToday?: () => number;
  canRunAutonomousCycle?: () => boolean;
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
      if (this.deps.announcer.isBusy() || this.deps.announcer.hasPending()) {
        return;
      }

      if (this.deps.countSharedToday() < DAILY_SHARE_CAP) {
        if (
          this.deps.runAutonomousCycle &&
          (this.deps.countAutonomousCyclesToday?.() ?? 1) < 1 &&
          (this.deps.canRunAutonomousCycle?.() ?? true)
        ) {
          await this.deps.runAutonomousCycle();
        }

        const result = await this.deps.refresh();
        const newestShared = result.newlyInserted.find((d) => d.status === 'shared');
        if (newestShared) {
          this.deps.announcer.enqueue(newestShared);
          return;
        }
      }

      const oldest = await this.deps.getOldestUnannouncedShared();
      if (oldest) {
        this.deps.announcer.enqueue(oldest);
      }
    } catch (error) {
      console.warn('[our-companion] Discovery scheduler tick failed.', error);
    } finally {
      this.firstRun = false;
      this.scheduleNext(this.nextDelay());
    }
  }
}
