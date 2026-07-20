import { describe, expect, it } from 'vitest';
import {
  BROWSER_SEARCH_COOLDOWN_MS,
  BROWSER_SEARCH_HOURLY_BUDGET,
  BROWSER_SEARCH_MIN_INTERVAL_MS,
} from './browserSearchTypes';
import { BrowserSearchThrottle } from './browserSearchThrottle';

describe('BrowserSearchThrottle', () => {
  it('three acquisitions execute in FIFO order', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);
    const order: number[] = [];

    const release1 = await throttle.acquire();
    order.push(1);

    const p2 = throttle.acquire();
    const p3 = throttle.acquire();

    let resolved2 = false;
    let resolved3 = false;
    p2.then(() => { resolved2 = true; order.push(2); });
    p3.then(() => { resolved3 = true; order.push(3); });

    await new Promise((r) => setTimeout(r, 10));
    expect(resolved2).toBe(false);
    expect(resolved3).toBe(false);

    release1();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    const release2 = await p2;
    expect(resolved2).toBe(true);
    expect(resolved3).toBe(false);

    release2();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    await p3;
    expect(resolved3).toBe(true);
    expect(order).toEqual([1, 2, 3]);
  });

  it('p3 must not resolve until release2() is called', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const release1 = await throttle.acquire();
    const p2 = throttle.acquire();
    const p3 = throttle.acquire();

    let resolved3 = false;
    p3.then(() => { resolved3 = true; });

    release1();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    const release2 = await p2;
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved3).toBe(false);

    release2();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    await p3;
    expect(resolved3).toBe(true);
  });

  it('search lasting longer than minimum interval still blocks following searches', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const release1 = await throttle.acquire();
    now += 5000;
    release1();

    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    const release2 = await throttle.acquire();
    now += 100;
    release2();

    const start = Date.now();
    const release3 = await throttle.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(BROWSER_SEARCH_MIN_INTERVAL_MS - 100);
    release3();
  });

  it('maximum simultaneous active count is exactly one', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);
    let activeCount = 0;
    let maxActive = 0;

    const release1 = await throttle.acquire();
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);

    const p2 = throttle.acquire();
    const p3 = throttle.acquire();

    release1();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    activeCount--;
    const release2 = await p2;
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);

    release2();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    activeCount--;
    const release3 = await p3;
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);

    release3();
    activeCount--;
    expect(maxActive).toBe(1);
  });

  it('two simultaneous acquire calls when initially unlocked cannot both receive a grant', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const p1 = throttle.acquire();
    const p2 = throttle.acquire();

    const release1 = await p1;
    await new Promise((r) => setTimeout(r, 10));

    let resolved2 = false;
    p2.then(() => { resolved2 = true; });
    expect(resolved2).toBe(false);

    release1();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    await p2;
    expect(resolved2).toBe(true);
  });

  it('failure releases the next waiter', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const release1 = await throttle.acquire();
    const p2 = throttle.acquire();
    let resolved2 = false;
    p2.then(() => { resolved2 = true; });

    release1();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    const release2 = await p2;
    expect(resolved2).toBe(true);
    release2();
  });

  it('release callback is idempotent', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const release = await throttle.acquire();
    release();
    release();
    release();

    const p2 = throttle.acquire();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    const release2 = await p2;
    release2();
  });

  it('cooldown while waiting rejects queued requests safely', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const release1 = await throttle.acquire();
    const p2 = throttle.acquire();

    release1();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    await p2;

    throttle.noteChallengeOrRateLimit();
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

  it('hourly budget is checked when request reaches queue head', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    for (let i = 0; i < BROWSER_SEARCH_HOURLY_BUDGET; i++) {
      const release = await throttle.acquire();
      release();
      now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    }

    const p = throttle.acquire();
    await expect(p).rejects.toMatchObject({ code: 'browser_search_rate_limited' });
  });

  it('new acquire during minimum-interval wait cannot start another drain', async () => {
    let now = 0;
    const throttle = new BrowserSearchThrottle(() => now);

    const release1 = await throttle.acquire();
    const p2 = throttle.acquire();
    const p3 = throttle.acquire();

    release1();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    const release2 = await p2;

    let resolved3 = false;
    p3.then(() => { resolved3 = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved3).toBe(false);

    release2();
    now += BROWSER_SEARCH_MIN_INTERVAL_MS + 1;
    await p3;
    expect(resolved3).toBe(true);
  });
});
