import { describe, expect, it, vi } from 'vitest';
import { ElectronBrowserSearchProvider, mapBrowserSearchAvailabilityMessage } from './ElectronBrowserSearchProvider';
import { BrowserSearchError, BROWSER_SEARCH_PROVIDER_ID } from './browserSearchTypes';
import { resetBrowserSearchDiagnosticsForTests } from './browserSearchDiagnostics';
import type { BrowserSearchWorkerResult } from './BrowserSearchWorker';

function createMockWorker(result: BrowserSearchWorkerResult = {
  url: 'https://html.duckduckgo.com/html/?q=test',
  title: 'Test Page',
  visibleText: 'Test content',
  results: [{ title: 'Test Result', url: 'https://example.com/page', snippet: 'A test snippet.' }],
}) {
  return {
    execute: vi.fn(async () => result),
  };
}

function createFailWorker(error: Error) {
  return {
    execute: vi.fn(async () => { throw error; }),
  };
}

describe('ElectronBrowserSearchProvider', () => {
  it('has correct provider ID and live mode', () => {
    const provider = new ElectronBrowserSearchProvider({
      worker: createMockWorker() as any,
      isAppReady: () => true,
    });
    expect(provider.id).toBe(BROWSER_SEARCH_PROVIDER_ID);
    expect(provider.mode).toBe('live');
  });

  it('returns search results through the worker', async () => {
    const provider = new ElectronBrowserSearchProvider({
      worker: createMockWorker({
        url: 'https://html.duckduckgo.com/html/?q=test',
        title: 'Test',
        visibleText: '',
        results: [
          { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
          { title: 'Result 2', url: 'https://example.com/2', snippet: 'Snippet 2' },
        ],
      }) as any,
      isAppReady: () => true,
    });
    const results = await provider.search({ query: 'test', limit: 10 });
    expect(results).toHaveLength(2);
    expect(results[0]!.title).toBe('Result 1');
    expect(results[0]!.provider).toBe(BROWSER_SEARCH_PROVIDER_ID);
  });

  it('respects input limit', async () => {
    const provider = new ElectronBrowserSearchProvider({
      worker: createMockWorker({
        url: 'https://html.duckduckgo.com/html/?q=test',
        title: 'Test',
        visibleText: '',
        results: [
          { title: 'R1', url: 'https://a.com/1' },
          { title: 'R2', url: 'https://a.com/2' },
          { title: 'R3', url: 'https://a.com/3' },
        ],
      }) as any,
      isAppReady: () => true,
    });
    const results = await provider.search({ query: 'test', limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('throws when app is not ready', async () => {
    const provider = new ElectronBrowserSearchProvider({
      worker: createMockWorker() as any,
      isAppReady: () => false,
    });
    await expect(provider.search({ query: 'test', limit: 10 })).rejects.toMatchObject({
      code: 'browser_search_unavailable',
    });
  });

  it('reports diagnostics after successful search', async () => {
    const provider = new ElectronBrowserSearchProvider({
      worker: createMockWorker() as any,
      isAppReady: () => true,
    });
    await provider.search({ query: 'test', limit: 10 });
    const diagnostics = provider.getDiagnostics();
    expect(diagnostics.availability).toBe('ready');
    expect(diagnostics.lastSuccessAt).toBeDefined();
  });

  it('reports challenge diagnostics', async () => {
    const provider = new ElectronBrowserSearchProvider({
      worker: createFailWorker(new BrowserSearchError('browser_search_challenge')) as any,
      isAppReady: () => true,
    });
    await provider.search({ query: 'test', limit: 10 }).catch(() => {});
    const diagnostics = provider.getDiagnostics();
    expect(diagnostics.availability).toBe('challenge');
    expect(diagnostics.lastErrorCode).toBe('browser_search_challenge');
  });

  it('reports cooldown diagnostics after rate limit', async () => {
    const provider = new ElectronBrowserSearchProvider({
      worker: createFailWorker(new BrowserSearchError('browser_search_rate_limited')) as any,
      isAppReady: () => true,
    });
    await provider.search({ query: 'test', limit: 10 }).catch(() => {});
    const diagnostics = provider.getDiagnostics();
    expect(diagnostics.availability).toBe('cooldown');
  });

  it('uses cached results for identical queries', async () => {
    const worker = createMockWorker({
      url: 'https://html.duckduckgo.com/html/?q=test',
      title: 'Test',
      visibleText: '',
      results: [{ title: 'Cached', url: 'https://cached.com', snippet: 'cached' }],
    });
    const provider = new ElectronBrowserSearchProvider({
      worker: worker as any,
      isAppReady: () => true,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    await provider.search({ query: 'test', limit: 10 });
    await provider.search({ query: 'test', limit: 10 });
    expect(worker.execute).toHaveBeenCalledTimes(1);
  });

  it('returns fresh results when cache expires', async () => {
    let now = new Date('2026-01-01T00:00:00Z').getTime();
    const worker = createMockWorker();
    const provider = new ElectronBrowserSearchProvider({
      worker: worker as any,
      isAppReady: () => true,
      now: () => new Date(now),
    });
    await provider.search({ query: 'test', limit: 10 });
    now += 7 * 60 * 60 * 1000;
    await provider.search({ query: 'test', limit: 10 });
    expect(worker.execute).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable diagnostics when worker throws generic error', async () => {
    const provider = new ElectronBrowserSearchProvider({
      worker: createFailWorker(new Error('generic failure')) as any,
      isAppReady: () => true,
    });
    await provider.search({ query: 'test', limit: 10 }).catch(() => {});
    const diagnostics = provider.getDiagnostics();
    expect(diagnostics.availability).toBe('unavailable');
  });

  describe('requiredDomains filtering', () => {
    it('GitHub accepts github.com', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createMockWorker({
          url: 'https://html.duckduckgo.com/html/?q=test',
          title: 'Test',
          visibleText: '',
          results: [
            { title: 'GitHub Result', url: 'https://github.com/repo', snippet: 'GitHub' },
            { title: 'Other Result', url: 'https://example.com/page', snippet: 'Other' },
          ],
        }) as any,
        isAppReady: () => true,
      });
      const results = await provider.search({
        query: 'test',
        limit: 10,
        requiredDomains: ['github.com'],
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.domain).toBe('github.com');
    });

    it('GitHub accepts subdomains of github.com', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createMockWorker({
          url: 'https://html.duckduckgo.com/html/?q=test',
          title: 'Test',
          visibleText: '',
          results: [
            { title: 'GitHub Docs', url: 'https://docs.github.com/page', snippet: 'Docs' },
            { title: 'GitHub API', url: 'https://api.github.com/repos', snippet: 'API' },
          ],
        }) as any,
        isAppReady: () => true,
      });
      const results = await provider.search({
        query: 'test',
        limit: 10,
        requiredDomains: ['github.com'],
      });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.domain.endsWith('github.com'))).toBe(true);
    });

    it('GitHub rejects example.com', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createMockWorker({
          url: 'https://html.duckduckgo.com/html/?q=test',
          title: 'Test',
          visibleText: '',
          results: [
            { title: 'GitHub Result', url: 'https://github.com/repo', snippet: 'GitHub' },
            { title: 'Other Result', url: 'https://example.com/page', snippet: 'Other' },
          ],
        }) as any,
        isAppReady: () => true,
      });
      const results = await provider.search({
        query: 'test',
        limit: 10,
        requiredDomains: ['github.com'],
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.domain).toBe('github.com');
    });

    it('YouTube accepts youtube.com and youtu.be', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createMockWorker({
          url: 'https://html.duckduckgo.com/html/?q=test',
          title: 'Test',
          visibleText: '',
          results: [
            { title: 'YouTube Video', url: 'https://youtube.com/watch?v=123', snippet: 'YouTube' },
            { title: 'YouTube Short', url: 'https://youtu.be/123', snippet: 'Short' },
            { title: 'Other Result', url: 'https://example.com/page', snippet: 'Other' },
          ],
        }) as any,
        isAppReady: () => true,
      });
      const results = await provider.search({
        query: 'test',
        limit: 10,
        requiredDomains: ['youtube.com', 'youtu.be'],
      });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.domain === 'youtube.com' || r.domain === 'youtu.be')).toBe(true);
    });

    it('Reddit rejects non-reddit domains', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createMockWorker({
          url: 'https://html.duckduckgo.com/html/?q=test',
          title: 'Test',
          visibleText: '',
          results: [
            { title: 'Reddit Post', url: 'https://reddit.com/r/test', snippet: 'Reddit' },
            { title: 'Other Result', url: 'https://example.com/page', snippet: 'Other' },
          ],
        }) as any,
        isAppReady: () => true,
      });
      const results = await provider.search({
        query: 'test',
        limit: 10,
        requiredDomains: ['reddit.com'],
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.domain).toBe('reddit.com');
    });

    it('Open Web has no required-domain filter', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createMockWorker({
          url: 'https://html.duckduckgo.com/html/?q=test',
          title: 'Test',
          visibleText: '',
          results: [
            { title: 'Result 1', url: 'https://example.com/1', snippet: 'Result 1' },
            { title: 'Result 2', url: 'https://other.com/2', snippet: 'Result 2' },
          ],
        }) as any,
        isAppReady: () => true,
      });
      const results = await provider.search({
        query: 'test',
        limit: 10,
        requiredDomains: [],
      });
      expect(results).toHaveLength(2);
    });

    it('Excluded domains are always removed', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createMockWorker({
          url: 'https://html.duckduckgo.com/html/?q=test',
          title: 'Test',
          visibleText: '',
          results: [
            { title: 'Result 1', url: 'https://example.com/1', snippet: 'Result 1' },
            { title: 'Result 2', url: 'https://spam.com/2', snippet: 'Result 2' },
          ],
        }) as any,
        isAppReady: () => true,
      });
      const results = await provider.search({
        query: 'test',
        limit: 10,
        excludedDomains: ['spam.com'],
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.domain).toBe('example.com');
    });

    it('All rejected results produce no-results outcome', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createMockWorker({
          url: 'https://html.duckduckgo.com/html/?q=test',
          title: 'Test',
          visibleText: '',
          results: [
            { title: 'Other Result', url: 'https://example.com/page', snippet: 'Other' },
          ],
        }) as any,
        isAppReady: () => true,
      });
      await expect(provider.search({
        query: 'test',
        limit: 10,
        requiredDomains: ['github.com'],
      })).rejects.toMatchObject({ code: 'browser_search_no_results' });
    });
  });

  describe('no-results keeps availability ready', () => {
    it('no results keeps availability ready', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createFailWorker(new BrowserSearchError('browser_search_no_results')) as any,
        isAppReady: () => true,
      });
      await provider.search({ query: 'test', limit: 10 }).catch(() => {});
      const diagnostics = provider.getDiagnostics();
      expect(diagnostics.availability).toBe('ready');
    });

    it('timeout sets availability unavailable', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createFailWorker(new BrowserSearchError('browser_search_timeout')) as any,
        isAppReady: () => true,
      });
      await provider.search({ query: 'test', limit: 10 }).catch(() => {});
      const diagnostics = provider.getDiagnostics();
      expect(diagnostics.availability).toBe('unavailable');
    });

    it('successful retry clears prior transient error', async () => {
      const provider = new ElectronBrowserSearchProvider({
        worker: createFailWorker(new BrowserSearchError('browser_search_timeout')) as any,
        isAppReady: () => true,
      });
      await provider.search({ query: 'test', limit: 10 }).catch(() => {});
      expect(provider.getDiagnostics().lastErrorCode).toBe('browser_search_timeout');

      const worker2 = createMockWorker();
      const provider2 = new ElectronBrowserSearchProvider({
        worker: worker2 as any,
        isAppReady: () => true,
      });
      await provider2.search({ query: 'test', limit: 10 });
      const diagnostics = provider2.getDiagnostics();
      expect(diagnostics.availability).toBe('ready');
      expect(diagnostics.lastErrorCode).toBeUndefined();
    });
  });
});

describe('mapBrowserSearchAvailabilityMessage', () => {
  it('maps all error codes to human-readable messages', () => {
    expect(mapBrowserSearchAvailabilityMessage('browser_search_timeout')).toContain('timed out');
    expect(mapBrowserSearchAvailabilityMessage('browser_search_challenge')).toContain('human verification');
    expect(mapBrowserSearchAvailabilityMessage('browser_search_rate_limited')).toContain('rate-limited');
    expect(mapBrowserSearchAvailabilityMessage('browser_search_unavailable')).toContain('unavailable');
    expect(mapBrowserSearchAvailabilityMessage('browser_search_no_results')).toContain('no results');
    expect(mapBrowserSearchAvailabilityMessage('browser_search_parse_failed')).toContain('could not read');
    expect(mapBrowserSearchAvailabilityMessage('browser_search_http_blocked')).toContain('blocked');
    expect(mapBrowserSearchAvailabilityMessage('browser_search_destroyed')).toContain('destroyed');
    expect(mapBrowserSearchAvailabilityMessage('browser_search_navigation_failed')).toContain('load the search page');
  });

  it('returns default for unknown codes', () => {
    expect(mapBrowserSearchAvailabilityMessage('unknown_code')).toContain('unavailable');
    expect(mapBrowserSearchAvailabilityMessage()).toContain('unavailable');
  });
});
