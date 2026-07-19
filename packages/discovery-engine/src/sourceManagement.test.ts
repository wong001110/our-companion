import { describe, expect, it } from 'vitest';
import { normalizeDiscoveryBaseInput } from './sourceManagement';

describe('Discovery Source input normalization', () => {
  it('normalizes a durable search topic', () => {
    expect(normalizeDiscoveryBaseInput({
      sourceType: 'query',
      locator: '  local-first   AI applications  ',
    })).toEqual({
      connectorId: 'generic-web',
      scope: 'query',
      locator: 'local-first AI applications',
      label: undefined,
      initialState: 'trial',
    });
  });

  it('extracts and lowercases a public domain', () => {
    expect(normalizeDiscoveryBaseInput({
      sourceType: 'domain',
      locator: 'HTTPS://GitHub.BLOG/releases?source=test#news',
      label: '  GitHub news  ',
      initialState: 'active',
    })).toEqual({
      connectorId: 'generic-web',
      scope: 'domain',
      locator: 'github.blog',
      label: 'GitHub news',
      initialState: 'active',
    });
  });

  it('canonicalizes page and feed URLs', () => {
    expect(normalizeDiscoveryBaseInput({
      sourceType: 'page',
      locator: 'https://Example.com/changelog/?utm_source=test&version=2#latest',
    }).locator).toBe('https://example.com/changelog?version=2');
    expect(normalizeDiscoveryBaseInput({
      sourceType: 'feed',
      locator: 'https://Example.com/feed.xml#items',
    })).toMatchObject({
      connectorId: 'rss',
      scope: 'feed',
      locator: 'https://example.com/feed.xml',
    });
  });

  it.each([
    ['domain', 'localhost'],
    ['domain', '192.168.1.2'],
    ['domain', 'internal.local'],
    ['page', 'http://127.0.0.1/private'],
    ['page', 'file:///etc/passwd'],
    ['feed', 'https://user:secret@example.com/feed.xml'],
  ] as const)('rejects unsafe %s source %s', (sourceType, locator) => {
    expect(() => normalizeDiscoveryBaseInput({ sourceType, locator })).toThrow();
  });

  it.each(['', 'ab', 'x'.repeat(501)])('rejects invalid query length', (locator) => {
    expect(() => normalizeDiscoveryBaseInput({ sourceType: 'query', locator })).toThrow(
      'DISCOVERY_SOURCE_QUERY_LENGTH_INVALID',
    );
  });
});
