import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeResearchUrl,
  FixtureWebSearchProvider,
  ResearchAdapterError,
  SafeWebPageFetcher
} from './researchAdapters';

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
});
