import { describe, expect, it } from 'vitest';
import { buildBrowserSearchQuery, cleanBrowserSearchDomain } from './buildBrowserSearchQuery';

describe('cleanBrowserSearchDomain', () => {
  it('strips protocol prefix', () => {
    expect(cleanBrowserSearchDomain('https://example.com')).toBe('example.com');
    expect(cleanBrowserSearchDomain('http://example.com')).toBe('example.com');
  });

  it('strips path segments', () => {
    expect(cleanBrowserSearchDomain('example.com/path/to/page')).toBe('example.com');
  });

  it('lowercases the domain', () => {
    expect(cleanBrowserSearchDomain('Example.COM')).toBe('example.com');
  });

  it('trims whitespace', () => {
    expect(cleanBrowserSearchDomain('  example.com  ')).toBe('example.com');
  });

  it('rejects malformed domains', () => {
    expect(cleanBrowserSearchDomain('')).toBeUndefined();
    expect(cleanBrowserSearchDomain('not a domain!')).toBeUndefined();
    expect(cleanBrowserSearchDomain('example space com')).toBeUndefined();
  });

  it('accepts valid domain patterns', () => {
    expect(cleanBrowserSearchDomain('sub.domain.example.com')).toBe('sub.domain.example.com');
    expect(cleanBrowserSearchDomain('my-site.co.uk')).toBe('my-site.co.uk');
  });
});

describe('buildBrowserSearchQuery', () => {
  it('encodes plain queries', () => {
    expect(buildBrowserSearchQuery({ query: 'local first AI companion' })).toBe('local first AI companion');
  });

  it('applies valid domain hints', () => {
    const result = buildBrowserSearchQuery({
      query: 'test query',
      domainHints: ['github.com', 'reddit.com'],
    });
    expect(result).toBe('test query site:github.com site:reddit.com');
  });

  it('applies excluded domains', () => {
    const result = buildBrowserSearchQuery({
      query: 'test query',
      excludedDomains: ['spam.com'],
    });
    expect(result).toBe('test query -site:spam.com');
  });

  it('rejects malformed domains', () => {
    const result = buildBrowserSearchQuery({
      query: 'test',
      domainHints: ['not valid!', 'https://good.com'],
    });
    expect(result).toBe('test site:good.com');
  });

  it('bounds query length', () => {
    const longQuery = 'a'.repeat(500);
    expect(() => buildBrowserSearchQuery({ query: longQuery })).toThrow('browser_search_query_too_long');
  });

  it('throws on empty query', () => {
    expect(() => buildBrowserSearchQuery({ query: '' })).toThrow('browser_search_query_empty');
    expect(() => buildBrowserSearchQuery({ query: '   ' })).toThrow('browser_search_query_empty');
  });

  it('does not accept arbitrary search-page URLs', () => {
    const result = buildBrowserSearchQuery({
      query: 'https://evil.example.com/search?q=bad',
    });
    expect(result).toBe('https://evil.example.com/search?q=bad');
    expect(result).not.toContain('site:');
  });

  it('strips protocol from domain hints', () => {
    const result = buildBrowserSearchQuery({
      query: 'test',
      domainHints: ['https://example.com/path', 'http://other.org'],
    });
    expect(result).toBe('test site:example.com site:other.org');
  });

  it('combines hints and exclusions', () => {
    const result = buildBrowserSearchQuery({
      query: 'advanced search',
      domainHints: ['docs.github.com'],
      excludedDomains: ['spam.net'],
    });
    expect(result).toBe('advanced search site:docs.github.com -site:spam.net');
  });
});
