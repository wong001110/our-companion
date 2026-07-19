import { describe, expect, it } from 'vitest';
import {
  buildCompanionDiscoverySeedPlan,
  extractDiscoveryInterests,
  parseDiscoverySeedPlanFromAnalysis,
} from './companionDiscoverySeed';
import { filterKnownCuratedFeedIds, listCuratedDiscoveryFeedIds } from './curatedDiscoveryFeeds';
import { MANAGED_DISCOVERY_PLATFORM_IDS } from './discoveryPlatformPresets';

describe('Companion discovery seed plan', () => {
  it('returns normalized interests from a character description', () => {
    const interests = extractDiscoveryInterests(
      'A companion who loves local-first AI tools, character interaction design, and calm product research.',
    );
    expect(interests.length).toBeGreaterThanOrEqual(3);
    expect(interests.length).toBeLessThanOrEqual(5);
    expect(interests.every((interest) => interest === interest.toLowerCase())).toBe(true);
    expect(new Set(interests).size).toBe(interests.length);
  });

  it('returns all default platform queries', () => {
    const plan = buildCompanionDiscoverySeedPlan({
      description: 'Curious about local-first AI and thoughtful desktop companions',
    });
    expect(plan.platformQueries.map((entry) => entry.platformId).sort()).toEqual(
      [...MANAGED_DISCOVERY_PLATFORM_IDS].sort(),
    );
    expect(plan.genericQuery.length).toBeGreaterThanOrEqual(3);
    expect(plan.genericQuery.length).toBeLessThanOrEqual(500);
    for (const entry of plan.platformQueries) {
      expect(entry.query).toContain('site:');
      expect(entry.query.length).toBeLessThanOrEqual(500);
    }
  });

  it('cannot inject arbitrary RSS URLs from analysis output', () => {
    const plan = parseDiscoverySeedPlanFromAnalysis(
      'Interested in open source tooling and calm interfaces',
      {
        interests: ['open source tooling', 'calm interfaces', 'desktop research'],
        curatedFeedIds: ['https://evil.example/feed.xml', 'not-a-real-feed'],
        rssUrls: ['https://evil.example/feed.xml'],
      },
    );
    expect(plan.curatedFeedIds).toEqual([]);
    expect(JSON.stringify(plan)).not.toContain('evil.example');
  });

  it('ignores unknown curated feed IDs', () => {
    expect(filterKnownCuratedFeedIds(['missing-feed', 'also-missing'])).toEqual([]);
    const plan = buildCompanionDiscoverySeedPlan({
      description: 'Local-first research companion',
      curatedFeedIds: ['unknown-feed-id'],
    });
    expect(plan.curatedFeedIds).toEqual([]);
    expect(listCuratedDiscoveryFeedIds()).toEqual([]);
  });
});
