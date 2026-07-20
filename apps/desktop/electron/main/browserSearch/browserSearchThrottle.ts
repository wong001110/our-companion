import {
  BROWSER_SEARCH_COOLDOWN_MS,
  BROWSER_SEARCH_HOURLY_BUDGET,
  BROWSER_SEARCH_MIN_INTERVAL_MS,
  BrowserSearchError,
} from './browserSearchTypes';

interface QueuedEntry {
  resolve: (release: () => void) => void;
  reject: (error: BrowserSearchError) => void;
}

export class BrowserSearchThrottle {
  private locked = false;
  private lastStartedAt = -1;
  private recentStarts: number[] = [];
  private cooldownUntil = 0;
  private queue: QueuedEntry[] = [];
  private draining = false;

  constructor(private readonly now: () => number = () => Date.now()) {}

  getCooldownUntil(): number {
    return this.cooldownUntil;
  }

  isInCooldown(): boolean {
    return this.now() < this.cooldownUntil;
  }

  noteChallengeOrRateLimit(): void {
    this.cooldownUntil = this.now() + BROWSER_SEARCH_COOLDOWN_MS;
  }

  async acquire(): Promise<() => void> {
    if (this.isInCooldown()) {
      throw new BrowserSearchError('browser_search_rate_limited');
    }

    return new Promise<() => void>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.scheduleDrain();
    });
  }

  private scheduleDrain(): void {
    if (this.draining || this.locked) return;
    this.draining = true;

    void this.drain().finally(() => {
      this.draining = false;

      if (!this.locked && this.queue.length > 0) {
        this.scheduleDrain();
      }
    });
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 && !this.locked) {
      if (this.isInCooldown()) {
        this.rejectAll('browser_search_rate_limited');
        return;
      }

      if (this.lastStartedAt >= 0) {
        const elapsed = this.now() - this.lastStartedAt;
        if (elapsed < BROWSER_SEARCH_MIN_INTERVAL_MS) {
          const delay = BROWSER_SEARCH_MIN_INTERVAL_MS - elapsed;
          await new Promise((r) => setTimeout(r, delay));
          if (this.isInCooldown()) {
            this.rejectAll('browser_search_rate_limited');
            return;
          }
        }
      }

      this.pruneHourlyBudget();
      if (this.recentStarts.length >= BROWSER_SEARCH_HOURLY_BUDGET) {
        this.rejectAll('browser_search_rate_limited');
        return;
      }

      const entry = this.queue.shift()!;
      this.locked = true;
      this.lastStartedAt = this.now();
      this.recentStarts.push(this.lastStartedAt);
      let released = false;
      entry.resolve(() => {
        if (released) return;
        released = true;
        this.locked = false;
        this.scheduleDrain();
      });
      return;
    }
  }

  private rejectAll(code: string): void {
    for (const entry of this.queue) {
      entry.reject(new BrowserSearchError(code as 'browser_search_rate_limited'));
    }
    this.queue = [];
  }

  private pruneHourlyBudget(): void {
    const cutoff = this.now() - 60 * 60_000;
    this.recentStarts = this.recentStarts.filter((value) => value >= cutoff);
  }
}
