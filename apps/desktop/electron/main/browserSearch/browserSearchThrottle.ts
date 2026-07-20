import {
  BROWSER_SEARCH_COOLDOWN_MS,
  BROWSER_SEARCH_HOURLY_BUDGET,
  BROWSER_SEARCH_MIN_INTERVAL_MS,
  BrowserSearchError,
} from './browserSearchTypes';

export class BrowserSearchThrottle {
  private active = false;
  private lastStartedAt = 0;
  private recentStarts: number[] = [];
  private cooldownUntil = 0;

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
    while (this.active) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (this.isInCooldown()) {
        throw new BrowserSearchError('browser_search_rate_limited');
      }
    }
    const elapsed = this.now() - this.lastStartedAt;
    if (elapsed < BROWSER_SEARCH_MIN_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, BROWSER_SEARCH_MIN_INTERVAL_MS - elapsed));
    }
    this.pruneHourlyBudget();
    if (this.recentStarts.length >= BROWSER_SEARCH_HOURLY_BUDGET) {
      throw new BrowserSearchError('browser_search_rate_limited');
    }
    this.active = true;
    this.lastStartedAt = this.now();
    this.recentStarts.push(this.lastStartedAt);
    return () => {
      this.active = false;
    };
  }

  private pruneHourlyBudget(): void {
    const cutoff = this.now() - 60 * 60_000;
    this.recentStarts = this.recentStarts.filter((value) => value >= cutoff);
  }
}
