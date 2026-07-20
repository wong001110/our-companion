import type { WebSearchResult } from '@our-companion/shared';

interface CacheEntry {
  expiresAt: number;
  results: WebSearchResult[];
}

export class BrowserSearchCache {
  private readonly entries = new Map<string, CacheEntry>();
  private lastCacheHit = false;

  constructor(private readonly now: () => number = () => Date.now()) {}

  consumeCacheHit(): boolean {
    const hit = this.lastCacheHit;
    this.lastCacheHit = false;
    return hit;
  }

  get(key: string): WebSearchResult[] | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.lastCacheHit = true;
    return entry.results.map((result) => ({ ...result }));
  }

  set(key: string, results: WebSearchResult[], ttlMs: number): void {
    this.entries.set(key, {
      expiresAt: this.now() + ttlMs,
      results: results.map((result) => ({ ...result })),
    });
  }

  static buildKey(input: {
    adapterId: string;
    adapterVersion: number;
    query: string;
    domainHints?: string[];
    excludedDomains?: string[];
    requiredDomains?: string[];
    freshnessDays?: number;
    language?: string;
  }): string {
    return JSON.stringify({
      adapterId: input.adapterId,
      adapterVersion: input.adapterVersion,
      query: input.query.trim().toLowerCase(),
      domainHints: [...(input.domainHints ?? [])].sort(),
      excludedDomains: [...(input.excludedDomains ?? [])].sort(),
      requiredDomains: [...(input.requiredDomains ?? [])].sort(),
      freshnessDays: input.freshnessDays ?? null,
      language: input.language ?? 'en',
    });
  }

  static ttlMs(freshnessDays?: number): number {
    if (!freshnessDays) return 6 * 60 * 60_000;
    if (freshnessDays <= 1) return 30 * 60_000;
    if (freshnessDays <= 7) return 2 * 60 * 60_000;
    return 6 * 60 * 60_000;
  }
}
