import type { WebSearchResult } from '@our-companion/shared';
import type { ResearchAdapterMode, WebSearchProvider } from '../researchAdapters';
import { ResearchAdapterError } from '../researchAdapters';
import { DuckDuckGoHtmlAdapter } from './adapters/DuckDuckGoHtmlAdapter';
import { BrowserSearchWorker, type BrowserSearchWorkerDeps } from './BrowserSearchWorker';
import { buildBrowserSearchQuery } from './buildBrowserSearchQuery';
import { BrowserSearchCache } from './browserSearchCache';
import {
  getBrowserSearchDiagnostics,
  toSharedWebSearchDiagnostics,
  updateBrowserSearchDiagnostics,
} from './browserSearchDiagnostics';
import { toWebSearchResults } from './browserSearchExtraction';
import { BrowserSearchThrottle } from './browserSearchThrottle';
import { BROWSER_SEARCH_PROVIDER_ID, BrowserSearchError } from './browserSearchTypes';
import type { BrowserSearchEngineAdapter } from './BrowserSearchEngineAdapter';

export interface ElectronBrowserSearchProviderOptions {
  adapter?: BrowserSearchEngineAdapter;
  worker?: BrowserSearchWorker;
  workerDeps?: BrowserSearchWorkerDeps;
  isAppReady?: () => boolean;
  now?: () => Date;
  language?: string;
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function filterByRequiredDomains(
  results: WebSearchResult[],
  requiredDomains: string[],
): WebSearchResult[] {
  if (requiredDomains.length === 0) return results;
  return results.filter((result) =>
    requiredDomains.some((domain) => hostnameMatchesDomain(result.domain, domain))
  );
}

function filterByExcludedDomains(
  results: WebSearchResult[],
  excludedDomains: string[],
): WebSearchResult[] {
  if (excludedDomains.length === 0) return results;
  return results.filter((result) =>
    !excludedDomains.some((domain) => hostnameMatchesDomain(result.domain, domain))
  );
}

export class ElectronBrowserSearchProvider implements WebSearchProvider {
  readonly id = BROWSER_SEARCH_PROVIDER_ID;
  readonly mode: ResearchAdapterMode = 'live';
  private readonly adapter: BrowserSearchEngineAdapter;
  private readonly worker: BrowserSearchWorker;
  private readonly cache: BrowserSearchCache;
  private readonly throttle: BrowserSearchThrottle;
  private readonly now: () => Date;
  private readonly language: string;
  private readonly isAppReady: () => boolean;

  constructor(options: ElectronBrowserSearchProviderOptions = {}) {
    const now = options.now ?? (() => new Date());
    this.adapter = options.adapter ?? new DuckDuckGoHtmlAdapter();
    this.worker = options.worker ?? new BrowserSearchWorker({
      ...options.workerDeps,
      isAppReady: options.isAppReady ?? options.workerDeps?.isAppReady,
    });
    this.cache = new BrowserSearchCache(() => now().getTime());
    this.throttle = new BrowserSearchThrottle(() => now().getTime());
    this.now = now;
    this.language = options.language ?? 'en';
    this.isAppReady = options.isAppReady ?? (() => true);
    updateBrowserSearchDiagnostics({
      providerId: this.id,
      adapterId: this.adapter.id,
      availability: this.isAppReady() ? 'ready' : 'unavailable',
    });
  }

  getDiagnostics() {
    const state = getBrowserSearchDiagnostics();
    if (state.lastErrorCode === 'browser_search_challenge') {
      return toSharedWebSearchDiagnostics({ ...state, availability: 'challenge' });
    }
    if (this.throttle.isInCooldown()) {
      return toSharedWebSearchDiagnostics({
        ...state,
        availability: 'cooldown',
        cooldownUntil: new Date(this.throttle.getCooldownUntil()).toISOString(),
      });
    }
    return toSharedWebSearchDiagnostics(state);
  }

  async search(input: Parameters<WebSearchProvider['search']>[0]): Promise<WebSearchResult[]> {
    const attemptedAt = this.now().toISOString();
    const requiredDomains = input.requiredDomains ?? [];
    const excludedDomains = input.excludedDomains ?? [];

    updateBrowserSearchDiagnostics({
      providerId: this.id,
      adapterId: this.adapter.id,
      lastAttemptAt: attemptedAt,
      cacheHit: false,
    });
    if (!this.isAppReady()) {
      updateBrowserSearchDiagnostics({
        availability: 'unavailable',
        lastErrorCode: 'browser_search_unavailable',
      });
      throw new BrowserSearchError('browser_search_unavailable');
    }
    let release: (() => void) | undefined;
    try {
      release = await this.throttle.acquire();
      const finalQuery = buildBrowserSearchQuery(input);
      const cacheKey = BrowserSearchCache.buildKey({
        adapterId: this.adapter.id,
        adapterVersion: this.adapter.version,
        query: finalQuery,
        domainHints: input.domainHints,
        excludedDomains: input.excludedDomains,
        requiredDomains: input.requiredDomains,
        freshnessDays: input.freshnessDays,
        language: this.language,
      });
      const cached = this.cache.get(cacheKey);
      if (cached) {
        if (requiredDomains.length > 0 && cached.length === 0) {
          throw new BrowserSearchError('browser_search_no_results');
        }
        updateBrowserSearchDiagnostics({
          availability: 'ready',
          cacheHit: true,
          lastSuccessAt: attemptedAt,
          lastErrorCode: undefined,
        });
        return cached.slice(0, input.limit);
      }
      const searchUrl = this.adapter.buildSearchUrl({
        query: finalQuery,
        limit: input.limit,
        language: this.language,
        freshnessDays: input.freshnessDays,
      });
      const workerResult = await this.worker.execute({
        adapter: this.adapter,
        searchUrl,
        limit: input.limit,
      });
      const normalized = toWebSearchResults({
        query: input.query,
        providerId: this.id,
        results: workerResult.results,
      });
      const filtered = filterByRequiredDomains(
        filterByExcludedDomains(normalized, excludedDomains),
        requiredDomains,
      );
      if (requiredDomains.length > 0 && filtered.length === 0) {
        throw new BrowserSearchError('browser_search_no_results');
      }
      this.cache.set(cacheKey, filtered, BrowserSearchCache.ttlMs(input.freshnessDays));
      updateBrowserSearchDiagnostics({
        availability: 'ready',
        lastSuccessAt: this.now().toISOString(),
        lastErrorCode: undefined,
        cacheHit: false,
      });
      return filtered.slice(0, input.limit);
    } catch (error) {
      const code = error instanceof BrowserSearchError
        ? error.code
        : error instanceof ResearchAdapterError
          ? error.code
          : 'browser_search_unavailable';
      if (code === 'browser_search_challenge' || code === 'browser_search_rate_limited') {
        this.throttle.noteChallengeOrRateLimit();
      }
      updateBrowserSearchDiagnostics({
        availability: getAvailabilityForError(code),
        lastErrorCode: code,
        cooldownUntil: this.throttle.isInCooldown()
          ? new Date(this.throttle.getCooldownUntil()).toISOString()
          : undefined,
      });
      if (error instanceof BrowserSearchError) {
        throw new ResearchAdapterError(error.code, error.message);
      }
      throw error;
    } finally {
      release?.();
    }
  }
}

function getAvailabilityForError(code: string): 'ready' | 'cooldown' | 'challenge' | 'unavailable' {
  switch (code) {
    case 'browser_search_challenge':
      return 'challenge';
    case 'browser_search_rate_limited':
      return 'cooldown';
    case 'browser_search_no_results':
      return 'ready';
    default:
      return 'unavailable';
  }
}
