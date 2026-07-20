import { describe, expect, it } from 'vitest';
import {
  decodeSearchRedirectUrl,
  normalizeBrowserSearchUrl,
  extractOrganicResultsFromHtml,
  toWebSearchResults,
} from './browserSearchExtraction';
import { FIXTURE_NORMAL_RESULTS, FIXTURE_EMPTY_RESULTS, FIXTURE_MALFORMED_LINKS } from './fixtures/searchPages';

describe('decodeSearchRedirectUrl', () => {
  it('decodes DuckDuckGo redirect URLs', () => {
    const redirectUrl = 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=abc';
    const result = decodeSearchRedirectUrl(redirectUrl);
    expect(result).toBe('https://example.com/page');
  });

  it('preserves direct http/https URLs', () => {
    expect(decodeSearchRedirectUrl('https://example.com/page')).toBe('https://example.com/page');
    expect(decodeSearchRedirectUrl('http://example.com/page')).toBe('http://example.com/page');
  });

  it('rejects non-http protocols', () => {
    expect(decodeSearchRedirectUrl('javascript:alert(1)')).toBeUndefined();
    expect(decodeSearchRedirectUrl('file:///etc/passwd')).toBeUndefined();
    expect(decodeSearchRedirectUrl('data:text/html,<h1>hi</h1>')).toBeUndefined();
  });

  it('rejects malformed URLs', () => {
    expect(decodeSearchRedirectUrl('not a url')).toBeUndefined();
    expect(decodeSearchRedirectUrl('')).toBeUndefined();
  });
});

describe('normalizeBrowserSearchUrl', () => {
  it('resolves relative URLs against page URL', () => {
    const result = normalizeBrowserSearchUrl('/relative/page', 'https://example.com/search');
    expect(result).toBe('https://example.com/relative/page');
  });

  it('removes hash fragments', () => {
    const result = normalizeBrowserSearchUrl('https://example.com/page#section', 'https://example.com/search');
    expect(result).toBe('https://example.com/page');
  });

  it('decodes redirect URLs', () => {
    const result = normalizeBrowserSearchUrl(
      'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdecoded',
      'https://html.duckduckgo.com/html/'
    );
    expect(result).toBe('https://example.com/decoded');
  });
});

describe('extractOrganicResultsFromHtml', () => {
  it('extracts organic results from normal search page', () => {
    const results = extractOrganicResultsFromHtml({
      html: FIXTURE_NORMAL_RESULTS,
      pageUrl: 'https://html.duckduckgo.com/html/?q=test',
      limit: 10,
      isSponsored: (element) => element.hasClass('result--ad') || element.hasClass('result--pub'),
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]?.title).toBe('Guide to pixel art');
    expect(results[0]?.url).toBe('https://example.com/guide');
    expect(results[0]?.snippet).toBe('Learn expressive pixel storytelling.');
  });

  it('ignores sponsored results', () => {
    const results = extractOrganicResultsFromHtml({
      html: FIXTURE_NORMAL_RESULTS,
      pageUrl: 'https://html.duckduckgo.com/html/?q=test',
      limit: 10,
      isSponsored: (element) => element.hasClass('result--ad'),
    });
    const titles = results.map((r) => r.title);
    expect(titles).not.toContain('Buy pixels');
  });

  it('deduplicates canonical URLs', () => {
    const results = extractOrganicResultsFromHtml({
      html: FIXTURE_NORMAL_RESULTS,
      pageUrl: 'https://html.duckduckgo.com/html/?q=test',
      limit: 10,
    });
    const urls = results.map((r) => r.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('normalizes DuckDuckGo redirect URLs', () => {
    const results = extractOrganicResultsFromHtml({
      html: FIXTURE_NORMAL_RESULTS,
      pageUrl: 'https://html.duckduckgo.com/html/?q=test',
      limit: 10,
    });
    const urls = results.map((r) => r.url);
    expect(urls).toContain('https://docs.example.com/tools');
  });

  it('rejects non-http URLs', () => {
    const results = extractOrganicResultsFromHtml({
      html: FIXTURE_NORMAL_RESULTS,
      pageUrl: 'https://html.duckduckgo.com/html/?q=test',
      limit: 10,
    });
    const urls = results.map((r) => r.url);
    expect(urls).not.toContain('javascript:alert(1)');
  });

  it('handles empty results page', () => {
    const results = extractOrganicResultsFromHtml({
      html: FIXTURE_EMPTY_RESULTS,
      pageUrl: 'https://html.duckduckgo.com/html/?q=test',
      limit: 10,
    });
    expect(results).toHaveLength(0);
  });

  it('handles malformed links', () => {
    const results = extractOrganicResultsFromHtml({
      html: FIXTURE_MALFORMED_LINKS,
      pageUrl: 'https://html.duckduckgo.com/html/?q=test',
      limit: 10,
    });
    expect(results).toHaveLength(0);
  });

  it('returns requested result limit', () => {
    const results = extractOrganicResultsFromHtml({
      html: FIXTURE_NORMAL_RESULTS,
      pageUrl: 'https://html.duckduckgo.com/html/?q=test',
      limit: 1,
    });
    expect(results).toHaveLength(1);
  });

  it('bounds title and snippet lengths', () => {
    const longTitle = 'A'.repeat(300);
    const longSnippet = 'B'.repeat(500);
    const html = `<div class="result"><a class="result__a" href="https://example.com">${longTitle}</a><div class="result__snippet">${longSnippet}</div></div>`;
    const results = extractOrganicResultsFromHtml({
      html: `<html><body>${html}</body></html>`,
      pageUrl: 'https://html.duckduckgo.com/html/',
      limit: 10,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.title.length).toBeLessThanOrEqual(240);
    expect(results[0]!.snippet!.length).toBeLessThanOrEqual(420);
  });
});

describe('toWebSearchResults', () => {
  it('normalizes extracted results to WebSearchResult format', () => {
    const results = toWebSearchResults({
      query: 'test query',
      providerId: 'electron-browser-search',
      results: [
        { title: 'Example Page', url: 'https://example.com/page', snippet: 'A useful page.' },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      query: 'test query',
      title: 'Example Page',
      url: 'https://example.com/page',
      domain: 'example.com',
      snippet: 'A useful page.',
      rank: 1,
      provider: 'electron-browser-search',
    });
    expect(results[0]!.id).toMatch(/^search_result_/);
  });

  it('sets correct rank for multiple results', () => {
    const results = toWebSearchResults({
      query: 'test',
      providerId: 'test',
      results: [
        { title: 'First', url: 'https://a.com' },
        { title: 'Second', url: 'https://b.com' },
        { title: 'Third', url: 'https://c.com' },
      ],
    });
    expect(results.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});
