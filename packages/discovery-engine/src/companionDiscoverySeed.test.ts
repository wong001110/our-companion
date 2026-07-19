import { describe, expect, it } from 'vitest';
import {
  buildCompanionDiscoverySeedPlan,
  extractDiscoveryInterests,
  parseDiscoverySeedPlanFromAnalysis,
} from './companionDiscoverySeed';
import { filterKnownCuratedFeedIds, listCuratedDiscoveryFeedIds } from './curatedDiscoveryFeeds';
import {
  fenceDiscoveryPlatformQuery,
  MANAGED_DISCOVERY_PLATFORM_IDS,
} from './discoveryPlatformPresets';
import {
  buildFallbackDiscoveryResearchPlan,
  validateDynamicDiscoveryResearchPlan,
} from './discoveryResearchPlanner';

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

  it('does not persist platform queries in the seed plan', () => {
    const plan = buildCompanionDiscoverySeedPlan({
      description: 'Curious about local-first AI and thoughtful desktop companions',
    });
    expect(plan.interests.length).toBeGreaterThanOrEqual(3);
    expect(plan.preferredContentTypes.length).toBeGreaterThan(0);
    expect(plan).not.toHaveProperty('platformQueries');
    expect(plan).not.toHaveProperty('genericQuery');
    expect(JSON.stringify(plan)).not.toContain('site:');
  });

  it('cannot inject arbitrary RSS URLs from analysis output', () => {
    const plan = parseDiscoverySeedPlanFromAnalysis(
      'Interested in open source tooling and calm interfaces',
      {
        interests: ['open source tooling', 'calm interfaces', 'desktop research'],
        curatedFeedIds: ['https://evil.example/feed.xml', 'not-a-real-feed'],
        platformQueries: [{ platformId: 'reddit', query: 'site:evil.com hack' }],
        rssUrls: ['https://evil.example/feed.xml'],
      },
    );
    expect(plan.curatedFeedIds).toEqual([]);
    expect(JSON.stringify(plan)).not.toContain('evil.example');
    expect(JSON.stringify(plan)).not.toContain('site:');
  });

  it('ignores unknown curated feed IDs and unknown platform affinities', () => {
    expect(filterKnownCuratedFeedIds(['missing-feed', 'also-missing'])).toEqual([]);
    const plan = buildCompanionDiscoverySeedPlan({
      description: 'Local-first research companion',
      curatedFeedIds: ['unknown-feed-id'],
      platformAffinities: { reddit: 0.8, unknown: 1 } as never,
    });
    expect(plan.curatedFeedIds).toEqual([]);
    expect(plan.platformAffinities).toEqual({ reddit: 0.8 });
    expect(listCuratedDiscoveryFeedIds()).toEqual([]);
  });
});

describe('Discovery research planner fencing', () => {
  it('constrains platform queries with deterministic domain fencing', () => {
    expect(fenceDiscoveryPlatformQuery('reddit', 'local-first AI')).toBe('site:reddit.com local-first AI');
    expect(fenceDiscoveryPlatformQuery('youtube', 'pixel art tutorials')).toContain('site:youtube.com');
    expect(fenceDiscoveryPlatformQuery('youtube', 'pixel art tutorials')).toContain('youtu.be');
    expect(fenceDiscoveryPlatformQuery('github', 'sqlite sync')).toBe('site:github.com sqlite sync');
    expect(fenceDiscoveryPlatformQuery('bilibili', '像素艺术')).toBe('site:bilibili.com 像素艺术');
    expect(fenceDiscoveryPlatformQuery('generic-web', 'calm product research')).toBe('calm product research');
  });

  it('rejects planner output that injects URLs or site operators', () => {
    const plan = validateDynamicDiscoveryResearchPlan({
      candidate: {
        tasks: [
          { platformId: 'reddit', query: 'https://evil.example/x', rationale: 'bad' },
          { platformId: 'github', query: 'site:evil.com sqlite', rationale: 'bad' },
          { platformId: 'generic-web', query: 'local-first sync patterns', rationale: 'ok' },
        ],
      },
      enabledPlatformIds: ['reddit', 'github', 'generic-web'],
    });
    expect(plan?.tasks).toEqual([
      expect.objectContaining({
        platformId: 'generic-web',
        semanticQuery: 'local-first sync patterns',
        query: 'local-first sync patterns',
      }),
    ]);
  });

  it('limits planner selection to enabled unique channels', () => {
    const plan = validateDynamicDiscoveryResearchPlan({
      candidate: {
        tasks: [
          { platformId: 'reddit', query: 'community experiences', rationale: 'a' },
          { platformId: 'reddit', query: 'duplicate', rationale: 'b' },
          { platformId: 'youtube', query: 'demo workflow', rationale: 'c' },
          { platformId: 'github', query: 'reference implementation', rationale: 'd' },
          { platformId: 'bilibili', query: '中文教程', rationale: 'e' },
        ],
      },
      enabledPlatformIds: ['reddit', 'youtube', 'github'],
    });
    expect(plan?.tasks).toHaveLength(3);
    expect(plan?.tasks.map((task) => task.platformId).sort()).toEqual(['github', 'reddit', 'youtube']);
    expect(MANAGED_DISCOVERY_PLATFORM_IDS).toContain('bilibili');
  });

  it('builds curiosity-aware fallback plans without fabricating AI mode', () => {
    const codePlan = buildFallbackDiscoveryResearchPlan({
      curiosityTopic: 'library implementation patterns for local sync',
      enabledPlatformIds: ['github', 'generic-web', 'reddit'],
      reason: 'AI provider unavailable',
    });
    expect(codePlan.plannerMode).toBe('fallback');
    expect(codePlan.tasks[0]?.platformId).toBe('github');
    expect(codePlan.tasks[0]?.query).toContain('site:github.com');
  });
});
