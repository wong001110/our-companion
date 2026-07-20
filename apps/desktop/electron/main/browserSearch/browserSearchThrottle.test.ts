import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_SEARCH_COOLDOWN_MS,
  BROWSER_SEARCH_HOURLY_BUDGET,
  BROWSER_SEARCH_MIN_INTERVAL_MS,
  BrowserSearchError,
} from './browserSearchTypes';
import { BrowserSearchThrottle } from './browserSearchThrottle';

describe('BrowserSearchThrottle', () => {
  it('runs only one search at a time', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const release1 = await throttle.acquire();
    const p2 = throttle.acquire();
    let resolved = false;
    p2.then(() => { resolved = true; });

    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    release1();
    await p2;
    expect(resolved).toBe(true);
  });

  it('enforces minimum interval between searches', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const release1 = await throttle.acquire();
    release1();

    now = 500;
    const start = Date.now();
    const release2 = await throttle.acquire();
    release2();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(BROWSER_SEARCH_MIN_INTERVAL_MS - 500);
  });

  it('enforces hourly budget', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    for (let i = 0; i < BROWSER_SEARCH_HOURLY_BUDGET; i++) {
      const release = await throttle.acquire();
      release();
      now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    }

    await expect(throttle.acquire()).rejects.toMatchObject({ code: 'browser_search_rate_limited' });
  });

  it('activates cooldown on challenge or rate limit', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    throttle.noteChallengeOrRateLimit();
    expect(throttle.isInCooldown()).toBe(true);
    await expect(throttle.acquire()).rejects.toMatchObject({ code: 'browser_search_rate_limited' });

    now = BROWSER_SEARCH_COOLDOWN_MS + 1;
    expect(throttle.isInCooldown()).toBe(false);
    const release = await throttle.acquire();
    release();
  });

  it('reports cooldown expiry time', () => {
    let now = 1000;
    const throttle = new BrowserSearchThrottle(() => now);
    throttle.noteChallengeOrRateLimit();
    expect(throttle.getCooldownUntil()).toBe(1000 + BROWSER_SEARCH_COOLDOWN_MS);
  });

  it('rejects acquisition during cooldown', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);
    throttle.noteChallengeOrRateLimit();

    await expect(throttle.acquire()).rejects.toMatchObject({ code: 'browser_search_rate_limited' });
  });
});
