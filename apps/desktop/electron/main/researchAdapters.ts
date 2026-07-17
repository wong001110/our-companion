import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';
import { load } from 'cheerio';
import type { EngineProviderMode, WebPageEvidence, WebSearchResult } from '@our-companion/shared';
import { createId } from '@our-companion/shared';

export type ResearchAdapterMode = Extract<EngineProviderMode, 'live' | 'fixture' | 'unavailable'>;

export interface WebSearchProvider {
  id: string;
  mode: ResearchAdapterMode;
  search(input: {
    query: string;
    limit: number;
    freshnessDays?: number;
    domainHints?: string[];
    excludedDomains?: string[];
  }): Promise<WebSearchResult[]>;
}

export interface WebPageFetcher {
  id: string;
  mode: ResearchAdapterMode;
  fetchPage(input: {
    searchResult: WebSearchResult;
    userId: string;
    companionId: string;
    cycleId: string;
    researchIntentId: string;
    researchPlanId: string;
    sourceType: WebPageEvidence['sourceType'];
  }): Promise<WebPageEvidence>;
}

export class ResearchAdapterError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = 'ResearchAdapterError';
  }
}

export class UnavailableWebSearchProvider implements WebSearchProvider {
  readonly mode = 'unavailable' as const;
  constructor(readonly id = 'brave-search') {}
  async search(): Promise<WebSearchResult[]> { return []; }
}

export class FixtureWebSearchProvider implements WebSearchProvider {
  readonly mode = 'fixture' as const;
  constructor(readonly results: WebSearchResult[], readonly id = 'fixture-search') {}
  async search(input: Parameters<WebSearchProvider['search']>[0]): Promise<WebSearchResult[]> {
    const excluded = new Set((input.excludedDomains ?? []).map((domain) => domain.toLowerCase()));
    return this.results
      .filter((result) => !excluded.has(result.domain.toLowerCase()))
      .filter((result) => result.query === input.query || result.query === '*')
      .slice(0, input.limit)
      .map((result, index) => ({ ...result, query: input.query, rank: index + 1 }));
  }
}

function braveFreshness(days?: number): string | undefined {
  if (!days) return undefined;
  if (days <= 1) return 'pd';
  if (days <= 7) return 'pw';
  if (days <= 31) return 'pm';
  if (days <= 365) return 'py';
  return undefined;
}

function cleanDomain(domain: string): string | undefined {
  const value = domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? '';
  return /^[a-z0-9.-]+$/i.test(value) ? value : undefined;
}

/** Vendor-specific mapping is isolated here; callers see only WebSearchProvider. */
export class BraveWebSearchProvider implements WebSearchProvider {
  readonly id = 'brave-search';
  readonly mode: ResearchAdapterMode;
  private readonly apiKey?: string;
  private readonly request: typeof fetch;

  constructor(input: { apiKey?: string; fetch?: typeof fetch } = {}) {
    this.apiKey = input.apiKey?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim();
    this.mode = this.apiKey ? 'live' : 'unavailable';
    this.request = input.fetch ?? globalThis.fetch;
  }

  async search(input: Parameters<WebSearchProvider['search']>[0]): Promise<WebSearchResult[]> {
    if (!this.apiKey) return [];
    const hints = (input.domainHints ?? []).map(cleanDomain).filter((value): value is string => Boolean(value));
    const excluded = (input.excludedDomains ?? []).map(cleanDomain).filter((value): value is string => Boolean(value));
    const operatorQuery = [
      input.query.trim(),
      ...hints.map((domain) => `site:${domain}`),
      ...excluded.map((domain) => `-site:${domain}`)
    ].filter(Boolean).join(' ');
    const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
    endpoint.searchParams.set('q', operatorQuery);
    endpoint.searchParams.set('count', String(Math.min(Math.max(1, input.limit), 20)));
    endpoint.searchParams.set('safesearch', 'strict');
    const freshness = braveFreshness(input.freshnessDays);
    if (freshness) endpoint.searchParams.set('freshness', freshness);
    let response: Response;
    try {
      response = await this.request(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
        redirect: 'error',
        credentials: 'omit'
      });
    } catch (error) {
      throw new ResearchAdapterError('timeout', error instanceof Error ? error.message : 'Search request failed');
    }
    if (response.status === 429) throw new ResearchAdapterError('rate_limited');
    if (response.status === 401 || response.status === 403) throw new ResearchAdapterError('authentication_error');
    if (!response.ok) throw new ResearchAdapterError('provider_error', `Brave Search returned ${response.status}`);
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new ResearchAdapterError('invalid_provider_response'); }
    const rows = (payload as { web?: { results?: unknown } }).web?.results;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row, index) => {
      if (!row || typeof row !== 'object') return [];
      const item = row as Record<string, unknown>;
      const url = typeof item.url === 'string' ? item.url : undefined;
      const title = typeof item.title === 'string' ? item.title.trim() : undefined;
      if (!url || !title) return [];
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return [];
        const domain = parsed.hostname.toLowerCase();
        if (excluded.some((excludedDomain) => domain === excludedDomain || domain.endsWith(`.${excludedDomain}`))) return [];
        return [{
          id: createId('search_result'), query: input.query, title, url, domain,
          snippet: typeof item.description === 'string' ? item.description : undefined,
          publishedAt: typeof item.page_age === 'string' ? item.page_age : undefined,
          rank: index + 1, provider: this.id
        }];
      } catch { return []; }
    });
  }
}

export interface SafeWebPageFetcherOptions {
  fetch?: typeof fetch;
  lookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  now?: () => Date;
  maxRedirects?: number;
  maxResponseBytes?: number;
  maxExtractedCharacters?: number;
  timeoutMs?: number;
}

const SUPPORTED_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);

function ipv4Number(address: string): number | undefined {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function ipv4In(address: string, base: string, prefix: number): boolean {
  const value = ipv4Number(address);
  const network = ipv4Number(base);
  if (value === undefined || network === undefined) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

export function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(normalized) === 4) {
    const privateRanges: Array<[string, number]> = [
      ['127.0.0.0', 8], ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4]
    ];
    return privateRanges.some(([base, prefix]) => ipv4In(normalized, base, prefix));
  }
  const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (ipv4Mapped) return isBlockedAddress(ipv4Mapped);
  if (net.isIP(normalized) === 6) {
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized);
  }
  return false;
}

export function assertSafeResearchUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new ResearchAdapterError('invalid_url'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ResearchAdapterError('blocked_protocol');
  if (url.username || url.password) throw new ResearchAdapterError('blocked_credentials_in_url');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isBlockedAddress(hostname)) {
    throw new ResearchAdapterError('blocked_private_address');
  }
  return url;
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new ResearchAdapterError('response_too_large');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new ResearchAdapterError('response_too_large');
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractReadablePage(html: string, fallbackUrl: URL, limit: number): {
  title: string; canonicalUrl: string; extractedText: string; excerpt: string; publishedAt?: string;
} {
  const $ = load(html);
  $('script, style, noscript, nav, header, footer, aside, form, iframe, svg, canvas').remove();
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body').first();
  const extractedText = normalizeText(root.text()).slice(0, limit);
  const title = normalizeText($('meta[property="og:title"]').attr('content') ?? $('title').text()) || fallbackUrl.hostname;
  const canonicalHref = $('link[rel="canonical"]').attr('href');
  let canonicalUrl = fallbackUrl.toString();
  if (canonicalHref) {
    try { canonicalUrl = new URL(canonicalHref, fallbackUrl).toString(); } catch { /* keep final URL */ }
  }
  const publishedAt = $('meta[property="article:published_time"]').attr('content') ?? $('time').first().attr('datetime');
  return { title, canonicalUrl, extractedText, excerpt: extractedText.slice(0, 700), publishedAt };
}

/** Read-only, cookie-free, redirect-checked public-page transport. */
export class SafeWebPageFetcher implements WebPageFetcher {
  readonly id = 'safe-web-page-fetcher';
  readonly mode = 'live' as const;
  private readonly request: typeof fetch;
  private readonly resolve: NonNullable<SafeWebPageFetcherOptions['lookup']>;
  private readonly now: () => Date;
  private readonly maxRedirects: number;
  private readonly maxResponseBytes: number;
  private readonly maxExtractedCharacters: number;
  private readonly timeoutMs: number;

  constructor(options: SafeWebPageFetcherOptions = {}) {
    this.request = options.fetch ?? globalThis.fetch;
    this.resolve = options.lookup ?? (async (hostname) => (await dnsLookup(hostname, { all: true })).map(({ address }) => ({ address })));
    this.now = options.now ?? (() => new Date());
    this.maxRedirects = options.maxRedirects ?? 3;
    this.maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
    this.maxExtractedCharacters = options.maxExtractedCharacters ?? 50_000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async fetchPage(input: Parameters<WebPageFetcher['fetchPage']>[0]): Promise<WebPageEvidence> {
    let target = assertSafeResearchUrl(input.searchResult.url);
    for (let redirects = 0; redirects <= this.maxRedirects; redirects += 1) {
      const addresses = await this.resolve(target.hostname).catch(() => { throw new ResearchAdapterError('dns_resolution_failed'); });
      if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) throw new ResearchAdapterError('blocked_private_address');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.request(target, {
          method: 'GET',
          redirect: 'manual',
          credentials: 'omit',
          signal: controller.signal,
          headers: { Accept: 'text/html, application/xhtml+xml, text/plain;q=0.9' }
        });
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') throw new ResearchAdapterError('timeout');
        throw new ResearchAdapterError('fetch_failed', error instanceof Error ? error.message : 'Page fetch failed');
      } finally { clearTimeout(timer); }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new ResearchAdapterError('redirect_missing_location');
        if (redirects >= this.maxRedirects) throw new ResearchAdapterError('redirect_limit_exceeded');
        target = assertSafeResearchUrl(new URL(location, target).toString());
        continue;
      }
      if (!response.ok) throw new ResearchAdapterError('http_error', `HTTP ${response.status}`);
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
      if (!contentType || !SUPPORTED_CONTENT_TYPES.has(contentType)) throw new ResearchAdapterError('unsupported_content_type');
      const body = await readBoundedBody(response, this.maxResponseBytes);
      const extracted = contentType === 'text/plain'
        ? { title: input.searchResult.title, canonicalUrl: target.toString(), extractedText: normalizeText(body).slice(0, this.maxExtractedCharacters), excerpt: normalizeText(body).slice(0, 700) }
        : extractReadablePage(body, target, this.maxExtractedCharacters);
      if (!extracted.extractedText) throw new ResearchAdapterError('empty_page_content');
      const canonical = assertSafeResearchUrl(extracted.canonicalUrl);
      const canonicalAddresses = await this.resolve(canonical.hostname).catch(() => { throw new ResearchAdapterError('dns_resolution_failed'); });
      if (canonicalAddresses.length === 0 || canonicalAddresses.some(({ address }) => isBlockedAddress(address))) throw new ResearchAdapterError('blocked_private_address');
      return {
        id: createId('page_evidence'), userId: input.userId, companionId: input.companionId, cycleId: input.cycleId,
        researchIntentId: input.researchIntentId, researchPlanId: input.researchPlanId,
        searchResultId: input.searchResult.id, query: input.searchResult.query, provider: input.searchResult.provider,
        url: target.toString(), canonicalUrl: canonical.toString(), domain: canonical.hostname.toLowerCase(),
        title: extracted.title, extractedText: extracted.extractedText, excerpt: extracted.excerpt,
        contentHash: createHash('sha256').update(extracted.extractedText).digest('hex'), contentType,
        fetchedAt: this.now().toISOString(), publishedAt: extracted.publishedAt, sourceType: input.sourceType
      };
    }
    throw new ResearchAdapterError('redirect_limit_exceeded');
  }
}

export class UnavailableWebPageFetcher implements WebPageFetcher {
  readonly mode = 'unavailable' as const;
  constructor(readonly id = 'safe-web-page-fetcher') {}
  async fetchPage(): Promise<WebPageEvidence> { throw new ResearchAdapterError('unavailable'); }
}
