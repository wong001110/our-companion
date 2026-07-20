import {
  BROWSER_SEARCH_COOLDOWN_MS,
  BROWSER_SEARCH_HOURLY_BUDGET,
  BROWSER_SEARCH_MIN_INTERVAL_MS,
  BrowserSearchError,
} from './browserSearchTypes';

interface QueuedEntry {
  id: number;
  resolve: (release: () => void) => void;
  reject: (error: BrowserSearchError) => void;
}

export class BrowserSearchThrottle {
  private active = false;
  private lastStartedAt = 0;
  private recentStarts: number[] = [];
  private cooldownUntil = 0;
  private queue: QueuedEntry[] = [];
  private nextId = 0;

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

    if (!this.active) {
      if (this.recentStarts.length > 0) {
        const elapsed = this.now() - this.lastStartedAt;
        if (elapsed < BROWSER_SEARCH_MIN_INTERVAL_MS) {
          const delay = BROWSER_SEARCH_MIN_INTERVAL_MS - elapsed;
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (this.isInCooldown()) {
            throw new BrowserSearchError('browser_search_rate_limited');
          }
        }
      }
      this.pruneHourlyBudget();
      if (this.recentStarts.length >= BROWSER_SEARCH_HOURLY_BUDGET) {
        throw new BrowserSearchError('browser_search_rate_limited');
      }
      return this.grant();
    }

    return new Promise<() => void>((resolve, reject) => {
      const id = this.nextId++;
      this.queue.push({ id, resolve, reject });
    });
  }

  private grant(): () => void {
    this.active = true;
    this.lastStartedAt = this.now();
    this.recentStarts.push(this.lastStartedAt);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = false;
      this.processQueue();
    };
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      if (this.isInCooldown()) {
        for (const entry of this.queue) {
          entry.reject(new BrowserSearchError('browser_search_rate_limited'));
        }
        this.queue = [];
        return;
      }

      const elapsed = this.now() - this.lastStartedAt;
      if (elapsed < BROWSER_SEARCH_MIN_INTERVAL_MS) {
        const delay = BROWSER_SEARCH_MIN_INTERVAL_MS - elapsed;
        const entry = this.queue.shift()!;
        setTimeout(() => {
          this.processEntry(entry);
        }, delay);
        return;
      }

      this.pruneHourlyBudget();
      if (this.recentStarts.length >= BROWSER_SEARCH_HOURLY_BUDGET) {
        for (const entry of this.queue) {
          entry.reject(new BrowserSearchError('browser_search_rate_limited'));
        }
        this.queue = [];
        return;
      }

      const entry = this.queue.shift()!;
      entry.resolve(this.grant());
      return;
    }
  }

  private processEntry(entry: QueuedEntry): void {
    if (this.isInCooldown()) {
      entry.reject(new BrowserSearchError('browser_search_rate_limited'));
      this.processQueue();
      return;
    }

    this.pruneHourlyBudget();
    if (this.recentStarts.length >= BROWSER_SEARCH_HOURLY_BUDGET) {
      entry.reject(new BrowserSearchError('browser_search_rate_limited'));
      this.processQueue();
      return;
    }

    entry.resolve(this.grant());
    this.processQueue();
  }

  private pruneHourlyBudget(): void {
    const cutoff = this.now() - 60 * 60_000;
    this.recentStarts = this.recentStarts.filter((value) => value >= cutoff);
  }
}
