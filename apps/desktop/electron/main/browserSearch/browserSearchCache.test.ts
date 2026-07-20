import { describe, expect, it } from 'vitest';
import { BrowserSearchCache } from './browserSearchCache';

describe('BrowserSearchCache', () => {
  const makeResult = (id: string) => ({
    id,
    query: 'test',
    title: `Result ${id}`,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    rank: 1,
    provider: 'test',
  });

  it('returns cached results on hit', () => {
    let now = 1000;
    const cache = new BrowserSearchCache(() => now);
    cache.set('key1', [makeResult('r1')], 60_000);
    const hit = cache.get('key1');
    expect(hit).toHaveLength(1);
    expect(hit![0]!.id).toBe('r1');
  });

  it('returns undefined for expired entries', () => {
    let now = 1000;
    const cache = new BrowserSearchCache(() => now);
    cache.set('key1', [makeResult('r1')], 60_000);
    now = 100_000;
    expect(cache.get('key1')).toBeUndefined();
  });

  it('returns undefined for missing keys', () => {
    const cache = new BrowserSearchCache();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('returns cloned results to prevent mutation', () => {
    const cache = new BrowserSearchCache();
    const results = [makeResult('r1')];
    cache.set('key1', results, 60_000);
    const cached = cache.get('key1')!;
    cached[0]!.title = 'mutated';
    expect(cache.get('key1')![0]!.title).toBe('Result r1');
  });

  describe('buildKey', () => {
    it('produces deterministic keys', () => {
      const key1 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        domainHints: ['a.com', 'b.com'],
        excludedDomains: ['c.com'],
        freshnessDays: 7,
        language: 'en',
      });
      const key2 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        domainHints: ['b.com', 'a.com'],
        excludedDomains: ['c.com'],
        freshnessDays: 7,
        language: 'en',
      });
      expect(key1).toBe(key2);
    });

    it('differentiates by adapter version', () => {
      const key1 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
      });
      const key2 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 2,
        query: 'test',
      });
      expect(key1).not.toBe(key2);
    });

    it('differentiates by freshness', () => {
      const key1 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        freshnessDays: 1,
      });
      const key2 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        freshnessDays: 7,
      });
      expect(key1).not.toBe(key2);
    });

    it('normalizes query case', () => {
      const key1 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'Test Query',
      });
      const key2 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test query',
      });
      expect(key1).toBe(key2);
    });
  });

  describe('ttlMs', () => {
    it('returns 30 minutes for freshness <= 1 day', () => {
      expect(BrowserSearchCache.ttlMs(1)).toBe(30 * 60_000);
      expect(BrowserSearchCache.ttlMs(0.5)).toBe(30 * 60_000);
    });

    it('returns 2 hours for freshness <= 7 days', () => {
      expect(BrowserSearchCache.ttlMs(7)).toBe(2 * 60 * 60_000);
      expect(BrowserSearchCache.ttlMs(3)).toBe(2 * 60 * 60_000);
    });

    it('returns 6 hours for no freshness or freshness > 7 days', () => {
      expect(BrowserSearchCache.ttlMs()).toBe(6 * 60 * 60_000);
      expect(BrowserSearchCache.ttlMs(30)).toBe(6 * 60 * 60_000);
    });
  });

  describe('requiredDomains isolation', () => {
    it('same query with GitHub requiredDomains and Open Web requiredDomains does not share results', () => {
      const cache = new BrowserSearchCache();
      const keyGithub = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        requiredDomains: ['github.com'],
      });
      const keyOpenWeb = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        requiredDomains: [],
      });
      expect(keyGithub).not.toBe(keyOpenWeb);

      cache.set(keyGithub, [makeResult('gh')], 60_000);
      cache.set(keyOpenWeb, [makeResult('ow')], 60_000);

      expect(cache.get(keyGithub)![0]!.id).toBe('gh');
      expect(cache.get(keyOpenWeb)![0]!.id).toBe('ow');
    });

    it('changing requiredDomains changes the Cache Key', () => {
      const key1 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        requiredDomains: ['github.com'],
      });
      const key2 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        requiredDomains: ['reddit.com'],
      });
      expect(key1).not.toBe(key2);
    });

    it('malformed required domains produce different cache keys', () => {
      const key1 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        requiredDomains: ['github.com', ''],
      });
      const key2 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        requiredDomains: ['github.com'],
      });
      expect(key1).not.toBe(key2);
    });

    it('subdomains continue to match their parent allowed domain', () => {
      const key1 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        requiredDomains: ['github.com'],
      });
      const key2 = BrowserSearchCache.buildKey({
        adapterId: 'ddg',
        adapterVersion: 1,
        query: 'test',
        requiredDomains: ['github.com'],
      });
      expect(key1).toBe(key2);
    });
  });
});
