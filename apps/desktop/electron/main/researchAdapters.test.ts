import { describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import {
  assertSafeResearchUrl,
  BraveWebSearchProvider,
  FixtureWebSearchProvider,
  FixtureWebPageFetcher,
  createDeterministicFixtureSearchProvider,
  fetchWithPinnedAddress,
  isBlockedAddress,
  ResearchAdapterError,
  SafeWebPageFetcher
} from './researchAdapters';

vi.mock('node:http', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));
vi.mock('node:https', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));

vi.mock('node:http', () => {
  const fn = vi.fn();
  return { request: fn, default: { request: fn } };
});
vi.mock('node:https', () => {
  const fn = vi.fn();
  return { request: fn, default: { request: fn } };
});

const publicLookup = async () => [{ address: '93.184.216.34' }];

function searchResult(url = 'https://public.example.test/article') {
  return { id: 'result_1', query: 'local first', title: 'Useful public article', url, domain: new URL(url).hostname, rank: 1, provider: 'fixture' };
}

function fetchInput(url?: string) {
  return {
    searchResult: searchResult(url), userId: 'user', companionId: 'companion', cycleId: 'cycle',
    researchIntentId: 'intent', researchPlanId: 'plan', sourceType: 'technical_article' as const
  };
}

function feedFetchInput(url?: string) {
  return { ...fetchInput(url), sourceType: 'rss' as const };
}

describe('SafeWebPageFetcher', () => {
  it.each([
    'file:///etc/passwd', 'data:text/html,hello', 'javascript:alert(1)', 'ftp://public.example/file',
    'http://localhost/', 'http://127.0.0.1/', 'http://0.1.2.3/', 'http://10.0.0.1/',
    'http://100.64.0.1/', 'http://169.254.1.1/', 'http://172.16.0.1/', 'http://192.168.1.1/',
    'http://224.0.0.1/', 'http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/'
  ])(
    'rejects forbidden research URL %s before any request',
    (url) => expect(() => assertSafeResearchUrl(url)).toThrow(ResearchAdapterError)
  );

  it.each(['::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:c0a8:101', '::127.0.0.1'])(
    'rejects IPv4-mapped or compatible private IPv6 address %s',
    (address) => expect(isBlockedAddress(address)).toBe(true)
  );

  it('rejects a redirect to a private address after the public first hop', async () => {
    const request = vi.fn(async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
    const fetcher = new SafeWebPageFetcher({ fetch: request as typeof fetch, lookup: publicLookup });
    await expect(fetcher.fetchPage(fetchInput())).rejects.toMatchObject({ code: 'blocked_private_address' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects DNS resolutions to private networks', async () => {
    const fetcher = new SafeWebPageFetcher({
      fetch: vi.fn() as unknown as typeof fetch,
      lookup: async () => [{ address: '192.168.1.3' }]
    });
    await expect(fetcher.fetchPage(fetchInput())).rejects.toMatchObject({ code: 'blocked_private_address' });
  });

  it('uses GET without cookies or authorization and extracts readable evidence deterministically', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(
      '<html><head><title>Architecture</title><link rel="canonical" href="/canonical" /></head><body><nav>noise</nav><article><h1>Local-first architecture</h1><p>Useful evidence about SQLite and offline-first design.</p><script>window.bad()</script></article></body></html>',
      { headers: { 'content-type': 'text/html' } }
    ));
    const fetcher = new SafeWebPageFetcher({ fetch: request as typeof fetch, lookup: publicLookup, now: () => new Date('2026-07-18T00:00:00.000Z') });
    const first = await fetcher.fetchPage(fetchInput());
    const second = await fetcher.fetchPage(fetchInput());
    const init = request.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(JSON.stringify(init.headers)).not.toMatch(/cookie|authorization/i);
    expect(first.extractedText).toContain('Useful evidence');
    expect(first.extractedText).not.toContain('noise');
    expect(first.extractedText).not.toContain('window.bad');
    expect(first.canonicalUrl).toBe('https://public.example.test/canonical');
    expect(first.contentHash).toBe(second.contentHash);
  });

  it.each([
    ['application/rss+xml', `<?xml version="1.0"?><rss><channel><title>Independent Feed</title><item><title>Release 2</title><description>Material release details for the companion.</description><pubDate>2026-07-18</pubDate></item></channel></rss>`],
    ['application/atom+xml', `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Independent Atom</title><entry><title>Research note</title><summary>Corroborated adaptive discovery evidence.</summary><updated>2026-07-18T00:00:00Z</updated></entry></feed>`],
  ])('accepts and extracts bounded RSS/Atom evidence for %s', async (contentType, body) => {
    const fetcher = new SafeWebPageFetcher({
      fetch: async () => new Response(body, { headers: { 'content-type': contentType } }),
      lookup: publicLookup,
    });
    const evidence = await fetcher.fetchPage(fetchInput('https://public.example.test/feed'));
    expect(evidence.sourceType).toBe('rss');
    expect(evidence.extractedText).toMatch(/release details|adaptive discovery evidence/i);
    expect(evidence.contentType).toBe(contentType);
    expect(evidence.feedItems).toHaveLength(1);
    expect(evidence.feedItems?.[0]).toMatchObject({
      title: expect.any(String),
      externalId: expect.any(String),
      canonicalUrl: 'https://public.example.test/feed',
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('does not label ordinary HTML as RSS when a feed probe requested it', async () => {
    const fetcher = new SafeWebPageFetcher({
      fetch: async () => new Response(
        '<html><head><title>Not a feed</title></head><body><main>Ordinary public page content.</main></body></html>',
        { headers: { 'content-type': 'text/html' } },
      ),
      lookup: publicLookup,
    });
    const evidence = await fetcher.fetchPage(feedFetchInput('https://public.example.test/not-a-feed'));
    expect(evidence).toMatchObject({
      sourceType: 'open_web',
      contentType: 'text/html',
      feedItems: undefined,
    });
  });

  it('rejects generic XML that is neither RSS nor Atom', async () => {
    const fetcher = new SafeWebPageFetcher({
      fetch: async () => new Response(
        '<catalog><rss><channel><title>Nested, not a feed root</title><item><title>Not RSS</title><description>Generic XML item.</description></item></channel></rss></catalog>',
        { headers: { 'content-type': 'application/xml' } },
      ),
      lookup: publicLookup,
    });
    await expect(fetcher.fetchPage(feedFetchInput('https://public.example.test/catalog.xml')))
      .rejects.toMatchObject({ code: 'invalid_feed_format' });
  });

  it('normalizes RSS entries independently using guid, canonical URL, and content hash', async () => {
    const body = `<?xml version="1.0"?><rss><channel><title>Releases</title>
      <item><guid>release-2</guid><title>Release 2</title><link>https://public.example.test/releases/2</link><description>Second release details.</description><pubDate>2026-07-18</pubDate></item>
      <item><guid>release-3</guid><title>Release 3</title><link>https://public.example.test/releases/3</link><description>Third release details.</description><pubDate>2026-07-19</pubDate></item>
    </channel></rss>`;
    const fetcher = new SafeWebPageFetcher({
      fetch: async () => new Response(body, { headers: { 'content-type': 'application/rss+xml' } }),
      lookup: publicLookup,
    });
    const evidence = await fetcher.fetchPage(fetchInput('https://public.example.test/feed'));
    expect(evidence.feedItems).toHaveLength(2);
    expect(evidence.feedItems?.map((item) => item.externalId)).toEqual(['release-2', 'release-3']);
    expect(new Set(evidence.feedItems?.map((item) => item.contentHash)).size).toBe(2);
    expect(evidence.feedItems?.map((item) => item.canonicalUrl)).toEqual([
      'https://public.example.test/releases/2',
      'https://public.example.test/releases/3',
    ]);
  });

  it('connects through the exact approved DNS address rather than resolving again in the transport', async () => {
    const request = vi.fn(async (_url: URL, _init: RequestInit, address: string) => new Response('Public page', { headers: { 'content-type': 'text/plain' } }));
    const fetcher = new SafeWebPageFetcher({ request, lookup: publicLookup });
    await fetcher.fetchPage(fetchInput());
    expect(request).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'manual' }), '93.184.216.34');
  });

  it('enforces supported content, response-size, and timeout limits', async () => {
    const unsupported = new SafeWebPageFetcher({
      fetch: async () => new Response('binary', { headers: { 'content-type': 'application/pdf' } }), lookup: publicLookup
    });
    await expect(unsupported.fetchPage(fetchInput())).rejects.toMatchObject({ code: 'unsupported_content_type' });

    const oversized = new SafeWebPageFetcher({
      fetch: async () => new Response('too large', { headers: { 'content-type': 'text/plain', 'content-length': '9999' } }), lookup: publicLookup, maxResponseBytes: 10
    });
    await expect(oversized.fetchPage(fetchInput())).rejects.toMatchObject({ code: 'response_too_large' });

    const timeout = new SafeWebPageFetcher({
      fetch: (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) as Promise<Response>,
      lookup: publicLookup,
      timeoutMs: 1
    });
    await expect(timeout.fetchPage(fetchInput())).rejects.toMatchObject({ code: 'timeout' });
  });

  it('keeps the page deadline active when headers arrive but the response body stalls', async () => {
    const stalled = new SafeWebPageFetcher({
      request: async (_url, init) => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener('abort', () => controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
        }
      }), { headers: { 'content-type': 'text/plain' } }),
      lookup: publicLookup,
      timeoutMs: 1
    });
    await expect(stalled.fetchPage(fetchInput())).rejects.toMatchObject({ code: 'timeout' });
  });

  it('applies the page deadline to a stalled canonical DNS validation', async () => {
    const fetcher = new SafeWebPageFetcher({
      fetch: async () => new Response('<link rel="canonical" href="https://canonical.example.test/article"><article>Evidence</article>', { headers: { 'content-type': 'text/html' } }),
      lookup: async (hostname) => hostname === 'canonical.example.test'
        ? new Promise<Array<{ address: string }>>(() => {})
        : [{ address: '93.184.216.34' }],
      timeoutMs: 1
    });
    await expect(fetcher.fetchPage(fetchInput())).rejects.toMatchObject({ code: 'timeout' });
  });

  describe('fetchWithPinnedAddress transport', () => {
    function makeFakeResponse() {
      const fakeHeaders = { 'content-type': 'text/plain' };
      return Object.assign(new Readable({ read() { this.push('OK'); this.push(null); } }), {
        statusCode: 200,
        statusMessage: 'OK',
        headers: fakeHeaders,
      }) as unknown as http.IncomingMessage;
    }

    function installMock(protocol: string) {
      const requestFn = vi.fn((_options: unknown, callback: (res: http.IncomingMessage) => void) => {
        callback(makeFakeResponse());
        return { once: vi.fn(), end: vi.fn() };
      });
      const mod = protocol === 'https:' ? https : http;
      (mod.request as ReturnType<typeof vi.fn>).mockImplementation(requestFn);
      return requestFn;
    }

    it('validated IPv4 address succeeds', async () => {
      const requestFn = installMock('https:');
      const url = new URL('https://example.test/page');
      await fetchWithPinnedAddress(url, { method: 'GET' }, '93.184.216.34');
      expect(requestFn).toHaveBeenCalledTimes(1);
      const options = requestFn.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(options.family).toBe(4);
      expect(options.autoSelectFamily).toBe(false);
      expect(options.hostname).toBe('example.test');
    });

    it('validated IPv6 address succeeds', async () => {
      const requestFn = installMock('https:');
      const url = new URL('https://example.test/page');
      await fetchWithPinnedAddress(url, { method: 'GET' }, '2606:4700::6810:85e5');
      expect(requestFn).toHaveBeenCalledTimes(1);
      const options = requestFn.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(options.family).toBe(6);
      expect(options.autoSelectFamily).toBe(false);
    });

    it('all:true lookup returns an address array', async () => {
      const requestFn = installMock('https:');
      const url = new URL('https://example.test/page');
      await fetchWithPinnedAddress(url, { method: 'GET' }, '93.184.216.34');
      const options = requestFn.mock.calls[0]?.[0] as Record<string, unknown>;
      const lookup = options.lookup as (
        hostname: string,
        opts: { all?: boolean },
        callback: (err: Error | null, result: unknown) => void,
      ) => void;
      const allResult = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
        lookup('example.test', { all: true }, (err, result) => {
          if (err) reject(err); else resolve(result as { address: string; family: number }[]);
        });
      });
      expect(allResult).toEqual([{ address: '93.184.216.34', family: 4 }]);
    });

    it('normal lookup returns address and family', async () => {
      const requestFn = installMock('https:');
      const url = new URL('https://example.test/page');
      await fetchWithPinnedAddress(url, { method: 'GET' }, '93.184.216.34');
      const options = requestFn.mock.calls[0]?.[0] as Record<string, unknown>;
      const lookup = options.lookup as (
        hostname: string,
        opts: object,
        callback: (err: Error | null, address: string, family: number) => void,
      ) => void;
      const result = await new Promise<{ address: string; family: number }>((resolve, reject) => {
        lookup('example.test', {}, (err, address, family) => {
          if (err) reject(err); else resolve({ address, family });
        });
      });
      expect(result).toEqual({ address: '93.184.216.34', family: 4 });
    });

    it('autoSelectFamily is disabled on the request options', async () => {
      const requestFn = installMock('https:');
      const url = new URL('https://example.test/page');
      await fetchWithPinnedAddress(url, { method: 'GET' }, '93.184.216.34');
      const options = requestFn.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(options.autoSelectFamily).toBe(false);
    });

    it('invalid resolver address returns dns_resolution_failed', async () => {
      await expect(
        fetchWithPinnedAddress(new URL('https://example.test/page'), { method: 'GET' }, 'not-an-ip')
      ).rejects.toMatchObject({ code: 'dns_resolution_failed' });
    });

    it('request preserves original hostname for TLS/SNI', async () => {
      const requestFn = installMock('https:');
      const url = new URL('https://example.test/page');
      await fetchWithPinnedAddress(url, { method: 'GET' }, '93.184.216.34');
      const options = requestFn.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(options.hostname).toBe('example.test');
    });

    it('invalid IP address: undefined cannot recur', async () => {
      await expect(
        fetchWithPinnedAddress(new URL('https://example.test/page'), { method: 'GET' }, 'undefined')
      ).rejects.not.toThrow('Invalid IP address: undefined');
      await expect(
        fetchWithPinnedAddress(new URL('https://example.test/page'), { method: 'GET' }, 'undefined')
      ).rejects.toMatchObject({ code: 'dns_resolution_failed' });
    });
  });
});

describe('BraveWebSearchProvider', () => {
  it('is unavailable without a key and never makes a request', async () => {
    const request = vi.fn<typeof fetch>();
    const provider = new BraveWebSearchProvider({ fetch: request as typeof fetch });
    expect(provider.mode).toBe('unavailable');
    await expect(provider.search({ query: 'test', limit: 1 })).resolves.toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the constrained Brave request contract without placing the key in the URL', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      web: { results: [
        { title: 'Independent report', url: 'https://independent.example/report', description: 'Useful result', page_age: '2026-07-17' },
        { title: 'Excluded result', url: 'https://excluded.example/report' }
      ] }
    }), { headers: { 'content-type': 'application/json' } }));
    const provider = new BraveWebSearchProvider({ apiKey: 'brave-secret', fetch: request as typeof fetch });

    const results = await provider.search({
      query: 'local first companion', limit: 99, freshnessDays: 8,
      domainHints: ['https://independent.example/path', 'not a domain!'], excludedDomains: ['excluded.example']
    });

    const [url, init] = request.mock.calls[0] ?? [];
    const endpoint = new URL(String(url));
    expect(endpoint.origin + endpoint.pathname).toBe('https://api.search.brave.com/res/v1/web/search');
    expect(endpoint.searchParams.get('count')).toBe('20');
    expect(endpoint.searchParams.get('safesearch')).toBe('strict');
    expect(endpoint.searchParams.get('freshness')).toBe('pm');
    expect(endpoint.searchParams.get('q')).toContain('site:independent.example');
    expect(endpoint.searchParams.get('q')).toContain('-site:excluded.example');
    expect(endpoint.toString()).not.toContain('brave-secret');
    expect(new Headers((init as RequestInit).headers).get('x-subscription-token')).toBe('brave-secret');
    expect(new Headers((init as RequestInit).headers).get('api-version')).toBe('2023-01-01');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ domain: 'independent.example', rank: 1, provider: 'brave-search' });
  });

  it.each([
    [401, 'authentication_error'],
    [403, 'authentication_error'],
    [429, 'rate_limited']
  ])('maps Brave HTTP %i to the safe adapter error %s', async (status, code) => {
    const provider = new BraveWebSearchProvider({ apiKey: 'brave-secret', fetch: async () => new Response('', { status }) });
    await expect(provider.search({ query: 'test', limit: 1 })).rejects.toMatchObject({ code });
  });

  it('maps 5xx and malformed provider responses without a retry', async () => {
    const failed = vi.fn<typeof fetch>(async () => new Response('', { status: 503 }));
    const failedProvider = new BraveWebSearchProvider({ apiKey: 'brave-secret', fetch: failed as typeof fetch });
    await expect(failedProvider.search({ query: 'test', limit: 1 })).rejects.toMatchObject({ code: 'provider_error' });
    expect(failed).toHaveBeenCalledTimes(1);

    const malformed = new BraveWebSearchProvider({ apiKey: 'brave-secret', fetch: async () => new Response('{', { status: 200 }) });
    await expect(malformed.search({ query: 'test', limit: 1 })).rejects.toMatchObject({ code: 'invalid_provider_response' });
  });

  it('maps request abort to timeout and does not retry the request', async () => {
    const request = vi.fn<typeof fetch>((_url, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }) as Promise<Response>);
    const provider = new BraveWebSearchProvider({ apiKey: 'brave-secret', fetch: request as typeof fetch, timeoutMs: 1 });
    await expect(provider.search({ query: 'test', limit: 1 })).rejects.toMatchObject({ code: 'timeout' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not expose an API key when a transport error includes it', async () => {
    const provider = new BraveWebSearchProvider({
      apiKey: 'brave-secret',
      fetch: async () => { throw new Error('request failed with brave-secret'); }
    });
    let error: unknown;
    try { await provider.search({ query: 'test', limit: 1 }); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: 'provider_request_failed' });
    expect(String(error)).not.toContain('brave-secret');
  });
});

describe('fixture web search', () => {
  it('returns arbitrary public domains without a fixed destination list', async () => {
    const provider = new FixtureWebSearchProvider([
      { id: 'a', query: '*', title: 'Independent article', url: 'https://independent.example/article', domain: 'independent.example', rank: 1, provider: 'fixture' },
      { id: 'b', query: '*', title: 'Other article', url: 'https://other.example/article', domain: 'other.example', rank: 2, provider: 'fixture' }
    ]);
    const results = await provider.search({ query: 'local AI', limit: 10, excludedDomains: ['other.example'] });
    expect(results).toHaveLength(1);
    expect(results[0]?.domain).toBe('independent.example');
  });

  it('returns stable search IDs and deterministic fixture evidence', async () => {
    const provider = createDeterministicFixtureSearchProvider();
    const first = await provider.search({ query: 'desktop AI companion', limit: 3 });
    const second = await provider.search({ query: 'desktop AI companion', limit: 3 });
    expect(first.map((result) => result.id)).toEqual(second.map((result) => result.id));
    const fetcher = new FixtureWebPageFetcher(() => new Date('2026-07-18T00:00:00.000Z'));
    const page = await fetcher.fetchPage({
      searchResult: first[0]!,
      userId: 'user',
      companionId: 'companion',
      cycleId: 'cycle',
      researchIntentId: 'intent',
      researchPlanId: 'plan',
      sourceType: 'technical_article',
    });
    expect(page.id).toBe(`fixture-evidence-${first[0]!.id}`);
    expect(page.provider).toBe('fixture-page-fetcher');
    expect(page.extractedText).toContain('desktop AI companion');
    expect(page.fetchedAt).toBe('2026-07-18T00:00:00.000Z');
  });
});
