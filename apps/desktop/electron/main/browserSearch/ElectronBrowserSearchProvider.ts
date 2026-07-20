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
import {
  BROWSER_SEARCH_PROVIDER_ID,
  BrowserSearchError,
  type BrowserSearchErrorCode,
} from './browserSearchTypes';
import type { BrowserSearchEngineAdapter } from './BrowserSearchEngineAdapter';

export interface ElectronBrowserSearchProviderOptions {
  adapter?: BrowserSearchEngineAdapter;
  worker?: BrowserSearchWorker;
  workerDeps?: BrowserSearchWorkerDeps;
  isAppReady?: () => boolean;
  now?: () => Date;
  language?: string;
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
    this.adapter = options.adapter ?? new DuckDuckGoHtmlAdapter();
    this.worker = options.worker ?? new BrowserSearchWorker({
      ...options.workerDeps,
      isAppReady: options.isAppReady ?? options.workerDeps?.isAppReady,
    });
    this.cache = new BrowserSearchCache(() => (options.now ?? (() => new Date()))().getTime());
    this.throttle = new BrowserSearchThrottle(() => (options.now ?? (() => new Date()))().getTime());
    this.now = options.now ?? (() => new Date());
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
        freshnessDays: input.freshnessDays,
        language: this.language,
      });
      const cached = this.cache.get(cacheKey);
      if (cached) {
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
      }).slice(0, input.limit);
      this.cache.set(cacheKey, normalized, BrowserSearchCache.ttlMs(input.freshnessDays));
      updateBrowserSearchDiagnostics({
        availability: 'ready',
        lastSuccessAt: this.now().toISOString(),
        lastErrorCode: undefined,
        cacheHit: false,
      });
      return normalized;
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
        availability: code === 'browser_search_challenge'
          ? 'challenge'
          : code === 'browser_search_rate_limited'
            ? 'cooldown'
            : 'unavailable',
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

export function mapBrowserSearchAvailabilityMessage(code?: string): string {
  const mapping: Record<BrowserSearchErrorCode, string> = {
    browser_search_timeout: 'Local web search timed out.',
    browser_search_navigation_failed: 'Local web search could not load the search page.',
    browser_search_http_blocked: 'Local web search blocked an unsafe response.',
    browser_search_challenge: 'Search page requested human verification.',
    browser_search_parse_failed: 'Local web search could not read results.',
    browser_search_no_results: 'Local web search returned no results.',
    browser_search_destroyed: 'Local web search worker was destroyed.',
    browser_search_rate_limited: 'Local web search is temporarily rate-limited.',
    browser_search_unavailable: 'Local web search is unavailable.',
  };
  return mapping[code as BrowserSearchErrorCode] ?? 'Local web search is unavailable.';
}
