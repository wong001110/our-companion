import { describe, expect, it } from 'vitest';
import {
  MAX_DISCOVERY_SEARCH_ATTEMPTS,
  clampDiscoverySearchAttempts,
  classifyPreviouslySeenSearchResult,
  semanticallyEquivalentTitle,
} from './discoverySearchGuard';

describe('discoverySearchGuard', () => {
  it('caps every discovery cycle at three search attempts', () => {
    expect(MAX_DISCOVERY_SEARCH_ATTEMPTS).toBe(3);
    expect(clampDiscoverySearchAttempts(undefined)).toBe(MAX_DISCOVERY_SEARCH_ATTEMPTS);
    expect(clampDiscoverySearchAttempts(0)).toBe(1);
    expect(clampDiscoverySearchAttempts(2.9)).toBe(2);
    expect(clampDiscoverySearchAttempts(3)).toBe(3);
    expect(clampDiscoverySearchAttempts(99)).toBe(3);
  });

  it('filters a previously seen canonical URL before page fetching', () => {
    expect(classifyPreviouslySeenSearchResult(
      { url: 'https://example.com/article?utm_source=again', title: 'A different search title' },
      [{ canonicalUrl: 'https://example.com/article', title: 'Original title' }],
    )).toEqual({ seen: true, reason: 'canonical_url' });
  });

  it('filters a semantically repeated Chinese article on a different URL', () => {
    expect(classifyPreviouslySeenSearchResult(
      { url: 'https://mirror.example/new', title: '温柔护理中的耐心观察与沟通方法' },
      [{ canonicalUrl: 'https://old.example/item', title: '温柔护理：耐心观察与沟通方法' }],
    )).toEqual({ seen: true, reason: 'semantic_title' });
  });

  it('does not block an adjacent article with materially different content', () => {
    expect(semanticallyEquivalentTitle(
      '温柔护理中的耐心观察与沟通方法',
      '急诊护理中的交接流程与风险管理',
    )).toBe(false);
  });

  it('allows exact and semantic repeats only for an explicit material-update probe', () => {
    expect(classifyPreviouslySeenSearchResult(
      { url: 'https://example.com/article', title: 'Original release notes' },
      [{ canonicalUrl: 'https://example.com/article', title: 'Original release notes' }],
      { allowSeenCanonicalUrl: true, allowSeenSemanticTitle: true },
    ).seen).toBe(false);
  });
});
