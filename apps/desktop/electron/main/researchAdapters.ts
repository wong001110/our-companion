import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';
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
    requiredDomains?: string[];
  }): Promise<WebSearchResult[]>;
}

export interface WebSearchProviderDiagnostics {
  providerId: string;
  adapterId?: string;
  availability: 'ready' | 'cooldown' | 'challenge' | 'unavailable';
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastErrorCode?: string;
  cooldownUntil?: string;
  cacheHit?: boolean;
}

export interface WebSearchProviderWithDiagnostics extends WebSearchProvider {
  getDiagnostics?(): WebSearchProviderDiagnostics;
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

const FIXTURE_PAGES: Record<string, { title: string; content: string; domain: string }> = {
  'https://fixture.our-companion.dev/desktop-ai-companion': {
    title: 'Desktop AI companion patterns',
    domain: 'fixture.our-companion.dev',
    content: 'A desktop AI companion can combine local-first memory, explicit permissions, observable cognition, and lightweight sprite animation.',
  },
  'https://fixture.our-companion.dev/local-first-memory': {
    title: 'Local-first memory architecture',
    domain: 'fixture.our-companion.dev',
    content: 'Local-first memory keeps private records on device, uses deterministic identities, and makes derived cognition inspectable.',
  },
  'https://fixture.our-companion.dev/sprite-animation': {
    title: 'Sprite animation lifecycle',
    domain: 'fixture.our-companion.dev',
    content: 'A visible expedition lifecycle prepares, departs, stays away, returns, reports a result, and always recovers to idle.',
  },
};

export function createDeterministicFixtureSearchProvider(): FixtureWebSearchProvider {
  return new FixtureWebSearchProvider(Object.entries(FIXTURE_PAGES).map(([url, page], index) => ({
    id: `fixture-search-result-${index + 1}`,
    query: '*',
    title: page.title,
    url,
    domain: page.domain,
    snippet: page.content,
    rank: index + 1,
    provider: 'fixture-search',
  })));
}

export class FixtureWebPageFetcher implements WebPageFetcher {
  readonly id = 'fixture-page-fetcher';
  readonly mode = 'fixture' as const;
  constructor(private readonly now: () => Date = () => new Date()) {}

  async fetchPage(input: Parameters<WebPageFetcher['fetchPage']>[0]): Promise<WebPageEvidence> {
    const page = FIXTURE_PAGES[input.searchResult.url];
    if (!page) throw new ResearchAdapterError('fixture_page_not_found');
    return {
      id: `fixture-evidence-${input.searchResult.id}`,
      userId: input.userId,
      companionId: input.companionId,
      cycleId: input.cycleId,
      researchIntentId: input.researchIntentId,
      researchPlanId: input.researchPlanId,
      searchResultId: input.searchResult.id,
      query: input.searchResult.query,
      provider: 'fixture-page-fetcher',
      url: input.searchResult.url,
      canonicalUrl: input.searchResult.url,
      domain: page.domain,
      title: page.title,
      extractedText: page.content,
      excerpt: page.content,
      contentHash: createHash('sha256').update(page.content).digest('hex'),
      contentType: 'text/plain',
      fetchedAt: this.now().toISOString(),
      sourceType: input.sourceType,
    };
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

// Pin Brave's dated compatibility contract as well as the `/v1` URL path.
const BRAVE_API_VERSION = '2023-01-01';

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
  private readonly timeoutMs: number;

  constructor(input: { apiKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {}) {
    this.apiKey = input.apiKey?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim();
    this.mode = this.apiKey ? 'live' : 'unavailable';
    this.request = input.fetch ?? globalThis.fetch;
    this.timeoutMs = input.timeoutMs ?? 10_000;
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.request(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json', 'Api-Version': BRAVE_API_VERSION, 'X-Subscription-Token': this.apiKey },
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal
      });
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') throw new ResearchAdapterError('timeout');
      // Transport errors are deliberately not exposed: a dependency may include request headers in its message.
      throw new ResearchAdapterError('provider_request_failed');
    } finally { clearTimeout(timer); }
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
  /** A production transport receives the already validated, DNS-pinned address. */
  request?: (url: URL, init: RequestInit, address: string) => Promise<Response>;
  lookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  now?: () => Date;
  maxRedirects?: number;
  maxResponseBytes?: number;
  maxExtractedCharacters?: number;
  timeoutMs?: number;
}

const FEED_CONTENT_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
]);
const SUPPORTED_CONTENT_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  ...FEED_CONTENT_TYPES,
]);

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

function ipv6Words(address: string): number[] | undefined {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  if (!value.includes(':')) return undefined;
  const halves = value.split('::');
  if (halves.length > 2) return undefined;
  const parseSide = (side: string): number[] | undefined => {
    if (!side) return [];
    const parts = side.split(':');
    const words: number[] = [];
    for (const part of parts) {
      if (part.includes('.')) {
        const ipv4 = ipv4Number(part);
        if (ipv4 === undefined) return undefined;
        words.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(part)) return undefined;
        words.push(Number.parseInt(part, 16));
      }
    }
    return words;
  };
  const left = parseSide(halves[0] ?? '');
  const right = parseSide(halves[1] ?? '');
  if (!left || !right) return undefined;
  if (halves.length === 1) return left.length === 8 ? left : undefined;
  const zeros = 8 - left.length - right.length;
  return zeros < 1 ? undefined : [...left, ...Array.from({ length: zeros }, () => 0), ...right];
}

function embeddedIpv4Address(address: string): string | undefined {
  const words = ipv6Words(address);
  if (!words) return undefined;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (!compatible && !mapped) return undefined;
  const high = words[6] ?? 0;
  const low = words[7] ?? 0;
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
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
  const embeddedIpv4 = embeddedIpv4Address(normalized);
  if (embeddedIpv4) return isBlockedAddress(embeddedIpv4);
  if (net.isIP(normalized) === 6) {
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff');
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

function abortError(): Error {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', onAbort); reject(error); }
    );
  });
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

export function extractReadableFeed(xml: string, fallbackUrl: URL, limit: number): {
  title: string;
  canonicalUrl: string;
  extractedText: string;
  excerpt: string;
  publishedAt?: string;
  feedItems: NonNullable<WebPageEvidence['feedItems']>;
} {
  const $ = load(xml, { xmlMode: true });
  const rootName = (($.root().children().first().get(0) as { name?: string } | undefined)?.name ?? '').toLowerCase();
  const hasRssRoot = rootName === 'rss' || rootName === 'rdf:rdf';
  const hasAtomRoot = rootName === 'feed';
  if (!hasRssRoot && !hasAtomRoot) throw new ResearchAdapterError('invalid_feed_format');
  const feedTitle = normalizeText($('channel > title').first().text() || $('feed > title').first().text())
    || fallbackUrl.hostname;
  const feedItems = $('item, entry').slice(0, 20).toArray().flatMap((
    element,
  ): NonNullable<WebPageEvidence['feedItems']> => {
    const entry = $(element);
    const title = normalizeText(entry.children('title').first().text());
    const body = normalizeText(
      entry.children('description, summary, content, content\\:encoded').first().text(),
    );
    const publishedAt = normalizeText(
      entry.children('pubDate, published, updated').first().text(),
    ) || undefined;
    const rawLink = entry.children('link').first().attr('href')
      ?? entry.children('link').first().text().trim();
    let canonicalUrl = fallbackUrl.toString();
    if (rawLink) {
      try {
        canonicalUrl = assertSafeResearchUrl(new URL(rawLink, fallbackUrl).toString()).toString();
      } catch {
        canonicalUrl = fallbackUrl.toString();
      }
    }
    const suppliedId = normalizeText(entry.children('guid, id').first().text());
    const material = normalizeText([title, body, publishedAt].filter(Boolean).join(' '));
    if (!material) return [];
    const contentHash = createHash('sha256').update(material).digest('hex');
    return [{
      externalId: suppliedId || (canonicalUrl !== fallbackUrl.toString() ? canonicalUrl : contentHash),
      canonicalUrl,
      title: title || feedTitle,
      summary: body || title,
      contentHash,
      publishedAt,
    }];
  });
  const extractedText = normalizeText(
    feedItems.map((item) => `${item.title}: ${item.summary}`).join(' '),
  ).slice(0, limit);
  const selfHref = $('feed > link[rel="self"]').first().attr('href')
    ?? $('rss > channel > atom\\:link[rel="self"]').first().attr('href');
  let canonicalUrl = fallbackUrl.toString();
  if (selfHref) {
    try {
      canonicalUrl = new URL(selfHref, fallbackUrl).toString();
    } catch {
      canonicalUrl = fallbackUrl.toString();
    }
  }
  const publishedAt = $('item > pubDate, entry > published, entry > updated').first().text().trim() || undefined;
  return {
    title: feedTitle,
    canonicalUrl,
    extractedText,
    excerpt: extractedText.slice(0, 700),
    publishedAt,
    feedItems,
  };
}

export async function fetchWithPinnedAddress(url: URL, init: RequestInit, address: string): Promise<Response> {
  const family = net.isIP(address);
  if (family !== 4 && family !== 6) {
    throw new ResearchAdapterError('dns_resolution_failed', 'DNS resolver returned an invalid address.');
  }
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = new Headers(init.headers);
  // Avoid a compressed body because this small, bounded reader operates on transfer bytes.
  if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'identity');
  return new Promise<Response>((resolve, reject) => {
    const clientRequest = request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
      signal: init.signal ?? undefined,
      family,
      autoSelectFamily: false,
      // The request keeps the hostname for TLS/SNI but always connects to the address just validated above.
      lookup: (_hostname: string, options: { all?: boolean }, callback: (err: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void) => {
        if (typeof options === 'object' && options !== null && 'all' in options && options.all) {
          callback(null, [{ address, family }]);
          return;
        }
        callback(null, address, family);
      }
    } as unknown as Parameters<typeof request>[0], (incoming) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      resolve(new Response(body, { status: incoming.statusCode ?? 502, statusText: incoming.statusMessage, headers: responseHeaders }));
    });
    clientRequest.once('error', reject);
    clientRequest.end();
  });
}

/** Read-only, cookie-free, redirect-checked public-page transport. */
export class SafeWebPageFetcher implements WebPageFetcher {
  readonly id = 'safe-web-page-fetcher';
  readonly mode = 'live' as const;
  private readonly request: NonNullable<SafeWebPageFetcherOptions['request']>;
  private readonly resolve: NonNullable<SafeWebPageFetcherOptions['lookup']>;
  private readonly now: () => Date;
  private readonly maxRedirects: number;
  private readonly maxResponseBytes: number;
  private readonly maxExtractedCharacters: number;
  private readonly timeoutMs: number;

  constructor(options: SafeWebPageFetcherOptions = {}) {
    // `fetch` is retained only as a deterministic test seam. Production uses the pinned transport.
    this.request = options.request ?? (options.fetch
      ? async (url, init) => options.fetch!(url, init)
      : fetchWithPinnedAddress);
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const resolveSafely = async (hostname: string) => {
          try { return await abortable(this.resolve(hostname), controller.signal); }
          catch (error) {
            if (controller.signal.aborted || (error as { name?: string }).name === 'AbortError') throw abortError();
            throw new ResearchAdapterError('dns_resolution_failed');
          }
        };
        const addresses = await resolveSafely(target.hostname);
        if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) throw new ResearchAdapterError('blocked_private_address');
        const response = await abortable(this.request(target, {
          method: 'GET',
          redirect: 'manual',
          credentials: 'omit',
          signal: controller.signal,
          headers: {
            Accept: 'text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain;q=0.9',
          }
        }, addresses[0]!.address), controller.signal);
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
        const body = await abortable(readBoundedBody(response, this.maxResponseBytes), controller.signal);
        const extracted = contentType === 'text/plain'
          ? { title: input.searchResult.title, canonicalUrl: target.toString(), extractedText: normalizeText(body).slice(0, this.maxExtractedCharacters), excerpt: normalizeText(body).slice(0, 700) }
          : FEED_CONTENT_TYPES.has(contentType)
            ? extractReadableFeed(body, target, this.maxExtractedCharacters)
            : extractReadablePage(body, target, this.maxExtractedCharacters);
        if (controller.signal.aborted) throw abortError();
        if (!extracted.extractedText) throw new ResearchAdapterError('empty_page_content');
        const canonical = assertSafeResearchUrl(extracted.canonicalUrl);
        const canonicalAddresses = await resolveSafely(canonical.hostname);
        if (canonicalAddresses.length === 0 || canonicalAddresses.some(({ address }) => isBlockedAddress(address))) throw new ResearchAdapterError('blocked_private_address');
        const feedItems = FEED_CONTENT_TYPES.has(contentType)
          ? (extracted as ReturnType<typeof extractReadableFeed>).feedItems
          : undefined;
        return {
          id: createId('page_evidence'), userId: input.userId, companionId: input.companionId, cycleId: input.cycleId,
          researchIntentId: input.researchIntentId, researchPlanId: input.researchPlanId,
          searchResultId: input.searchResult.id, query: input.searchResult.query, provider: input.searchResult.provider,
          url: target.toString(), canonicalUrl: canonical.toString(), domain: canonical.hostname.toLowerCase(),
          title: extracted.title, extractedText: extracted.extractedText, excerpt: extracted.excerpt,
          contentHash: createHash('sha256').update(extracted.extractedText).digest('hex'), contentType,
          fetchedAt: this.now().toISOString(), publishedAt: extracted.publishedAt,
          sourceType: FEED_CONTENT_TYPES.has(contentType)
            ? 'rss'
            : input.sourceType === 'rss'
              ? 'open_web'
              : input.sourceType,
          feedItems,
        };
      } catch (error) {
        if (controller.signal.aborted || (error as { name?: string }).name === 'AbortError') throw new ResearchAdapterError('timeout');
        if (error instanceof ResearchAdapterError) throw error;
        throw new ResearchAdapterError('fetch_failed', error instanceof Error ? error.message : 'Page fetch failed');
      } finally { clearTimeout(timer); }
    }
    throw new ResearchAdapterError('redirect_limit_exceeded');
  }
}

export class UnavailableWebPageFetcher implements WebPageFetcher {
  readonly mode = 'unavailable' as const;
  constructor(readonly id = 'safe-web-page-fetcher') {}
  async fetchPage(): Promise<WebPageEvidence> { throw new ResearchAdapterError('unavailable'); }
}
