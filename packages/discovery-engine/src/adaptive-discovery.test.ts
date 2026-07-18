import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCOVERY_MODE_WEIGHTS,
  MAX_PERSONALITY_MODE_SHIFT,
  adjustDiscoveryModeWeights,
  buildBoundedDiscoveryContext,
  canStartDiscoveryTrial,
  classifyDiscoveredLink,
  classifyDiscoveryAgainstSeen,
  createDiscoverySeenIdentities,
  createExplorationIntent,
  createTopicFingerprint,
  DiscoveryConnectorRegistry,
  evaluateTopicSaturation,
  MVP_DISCOVERY_CONNECTOR_MANIFESTS,
  selectDiscoveryMode,
  startDiscoveryTrial,
  transitionDiscoveryBase,
  type DiscoveryBase,
  type DiscoveryContextCategory,
  type DynamicDiscoveryConnector,
  type SeenDiscoveryRecord
} from './index';

const now = '2026-07-18T00:00:00.000Z';

describe('adaptive discovery mode and intent policy', () => {
  it('uses the 50/30/15/5 default distribution and deterministic selection', () => {
    expect(DEFAULT_DISCOVERY_MODE_WEIGHTS).toEqual({
      core: 0.5, adjacent: 0.3, wildcard: 0.15, challenge: 0.05
    });
    expect([0, 0.49, 0.5, 0.79, 0.8, 0.94, 0.95].map((roll) => selectDiscoveryMode(roll)))
      .toEqual(['core', 'core', 'adjacent', 'adjacent', 'wildcard', 'wildcard', 'challenge']);
  });

  it('limits personality influence and moves saturated exploration toward non-core modes', () => {
    const adjusted = adjustDiscoveryModeWeights({
      personalityBias: { core: 1, challenge: -1 },
      saturationPenalty: 1
    });
    expect(Math.abs(adjusted.core - (DEFAULT_DISCOVERY_MODE_WEIGHTS.core - 0.2))).toBeLessThanOrEqual(
      MAX_PERSONALITY_MODE_SHIFT + 0.001
    );
    expect(adjusted.adjacent).toBeGreaterThan(DEFAULT_DISCOVERY_MODE_WEIGHTS.adjacent);
    expect(adjusted.wildcard).toBeGreaterThan(DEFAULT_DISCOVERY_MODE_WEIGHTS.wildcard);
    expect(adjusted.challenge).toBeGreaterThan(0);
    expect(Object.values(adjusted).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it('creates the question/value/evidence/trust/locality intent before connector selection', () => {
    const intent = createExplorationIntent({
      mode: 'challenge',
      topic: 'local-first assistants',
      freshness: 'recent',
      trustRequirement: 'primary',
      languages: ['en', 'ms'],
      regions: ['MY'],
      domainHints: ['https://Docs.Example.test/arbitrary/trusted/path'],
      createdAt: now
    });
    expect(intent).toEqual(expect.objectContaining({
      mode: 'challenge',
      topic: 'local-first assistants',
      freshness: 'recent',
      trustRequirement: 'primary',
      languages: ['en', 'ms'],
      regions: ['MY'],
      domainHints: ['docs.example.test']
    }));
    expect(intent.searchTasks).toEqual([intent.question]);
    expect(intent.question).toContain('challenges');
    expect(intent.expectedValue).toBeTruthy();
    expect(intent.evidenceRequirements).not.toHaveLength(0);
  });

  it('enforces same-event, ignored-90-day, saved-material-only, and 3/7-day saturation rules', () => {
    const history = [
      { topicFingerprint: 'topic', eventKey: 'event-1', disposition: 'presented' as const, occurredAt: '2026-07-16T00:00:00.000Z' }
    ];
    expect(evaluateTopicSaturation({ topicFingerprint: 'other', eventKey: 'event-1', history, now }).reason)
      .toBe('same_event_seen');
    expect(evaluateTopicSaturation({
      topicFingerprint: 'topic',
      history: [{ topicFingerprint: 'topic', disposition: 'ignored', occurredAt: '2026-05-01T00:00:00.000Z' }],
      now
    }).reason).toBe('ignored_topic_cooldown');
    expect(evaluateTopicSaturation({
      topicFingerprint: 'topic',
      history: [{ topicFingerprint: 'topic', disposition: 'saved', occurredAt: '2025-01-01T00:00:00.000Z' }],
      now
    }).reason).toBe('saved_requires_material_update');
    const recent = evaluateTopicSaturation({ topicFingerprint: 'topic', history, now });
    expect(recent.blocked).toBe(false);
    expect(recent.penalty).toBe(0.9);
    expect(recent.modeWeights.core).toBeLessThan(DEFAULT_DISCOVERY_MODE_WEIGHTS.core);
  });
});

describe('open-ended bases, manifests, and bounded trials', () => {
  const base: DiscoveryBase = {
    id: 'base', companionId: 'companion', connectorId: 'custom.research-archive', scope: 'collection',
    locator: 'archive://novel-domain', data: { arbitrary: true }, origin: 'search_result', state: 'trial',
    discoveredAt: now, trialStartedAt: now, trialExpiresAt: '2026-07-28T00:00:00.000Z', updatedAt: now
  };

  it('registers arbitrary connector IDs and scopes without a platform union', () => {
    const connector: DynamicDiscoveryConnector = {
      manifest: {
        connectorId: 'custom.research-archive',
        version: '1',
        displayName: 'Research Archive',
        scopes: ['collection'],
        capabilities: ['search'],
        providerMode: 'fixture'
      },
      validateBase: (candidate) => candidate.scope === 'collection',
      discover: async () => []
    };
    const registry = new DiscoveryConnectorRegistry([connector]);
    expect(registry.compatible(base)).toBe(connector);
    expect(registry.manifests()[0]?.connectorId).toBe('custom.research-archive');
    expect(MVP_DISCOVERY_CONNECTOR_MANIFESTS.map((manifest) => manifest.connectorId))
      .toEqual(['generic-web', 'rss', 'brave-search', 'fixture-search']);
  });

  it('keeps generic pages and personal blogs as one-time evidence unless explicitly requested', () => {
    expect(classifyDiscoveredLink({ connectorAvailable: true })).toBe('one_time_evidence');
    expect(classifyDiscoveredLink({
      connectorAvailable: true, feedDetected: true, personalSite: true, trustScore: 1, relevanceScore: 1
    })).toBe('one_time_evidence');
    expect(classifyDiscoveredLink({
      connectorAvailable: true, explicitUserRequest: true, personalSite: true
    })).toBe('trial');
    expect(classifyDiscoveredLink({
      connectorAvailable: true, feedDetected: true, trustScore: 0.8, relevanceScore: 0.7
    })).toBe('trial');
  });

  it('bounds daily trials and supports promotion, expiry, mute, and block', () => {
    const started = [0, 1].map((index) => ({ ...base, id: `base-${index}` }));
    expect(canStartDiscoveryTrial({ companionId: 'companion', bases: started, now }))
      .toEqual({ allowed: false, reason: 'daily_trial_limit' });
    const trial = startDiscoveryTrial({
      base: {
        id: 'new', companionId: 'companion', connectorId: 'rss', scope: 'feed',
        locator: 'https://example.test/feed', data: {}, origin: 'feed_detection', discoveredAt: now
      },
      now,
      policy: { trialDays: 99, maxNewTrialsPerDay: 2, maxTrialBases: 8, maxActiveBases: 24 }
    });
    expect(trial.trialExpiresAt).toBe('2026-08-01T00:00:00.000Z');
    expect(transitionDiscoveryBase({ base: trial, feedback: 'useful', now }).state).toBe('active');
    expect(transitionDiscoveryBase({ base: trial, feedback: 'mute', now }).state).toBe('muted');
    expect(transitionDiscoveryBase({ base: trial, feedback: 'block', now }).state).toBe('blocked');
    expect(transitionDiscoveryBase({
      base: trial, feedback: 'none', now: '2026-08-02T00:00:00.000Z'
    }).state).toBe('expired');
  });
});

describe('persistent identity and layered dedup policy', () => {
  const candidate = {
    connectorId: 'rss',
    externalId: 'post-1',
    canonicalUrl: 'https://example.test/post?utm_source=feed',
    contentHash: 'content-a',
    eventKey: 'release-1',
    title: 'Product version one released',
    keyNouns: ['product', 'version'],
    entities: ['Example'],
    topics: ['desktop ai'],
    publishedAt: '2026-07-18T00:00:00.000Z',
    observedAt: now,
    materialFacts: ['initial release'],
    version: '1'
  };

  function recordFor(identityType: 'external_id' | 'canonical_url' | 'content_hash' | 'fingerprint' | 'event_key'): SeenDiscoveryRecord {
    const identities = createDiscoverySeenIdentities(candidate);
    return {
      discoveryId: 'existing',
      identities: identities.filter((identity) => identity.type === identityType),
      seenAt: '2026-07-17T00:00:00.000Z',
      contentHash: candidate.contentHash,
      materialFacts: candidate.materialFacts,
      publishedAt: candidate.publishedAt,
      version: candidate.version,
      topicFingerprint: createTopicFingerprint(candidate.topics)
    };
  }

  it.each(['external_id', 'canonical_url', 'content_hash', 'event_key', 'fingerprint'] as const)(
    'deduplicates at the %s layer',
    (identityType) => {
      expect(classifyDiscoveryAgainstSeen({ candidate, existing: [recordFor(identityType)] }))
        .toEqual(expect.objectContaining({ outcome: 'duplicate', layer: identityType }));
    }
  );

  it('deduplicates the same fetched content and event fingerprint across different URLs', () => {
    const contentRecord = recordFor('content_hash');
    expect(classifyDiscoveryAgainstSeen({
      candidate: {
        ...candidate,
        externalId: undefined,
        canonicalUrl: 'https://mirror.test/different',
        eventKey: undefined
      },
      existing: [contentRecord]
    })).toEqual(expect.objectContaining({ outcome: 'duplicate', layer: 'content_hash' }));

    const fingerprintRecord = recordFor('fingerprint');
    expect(classifyDiscoveryAgainstSeen({
      candidate: {
        ...candidate,
        externalId: undefined,
        canonicalUrl: 'https://another.test/report',
        contentHash: undefined,
        eventKey: undefined
      },
      existing: [fingerprintRecord]
    })).toEqual(expect.objectContaining({ outcome: 'duplicate', layer: 'fingerprint' }));
  });

  it('returns a material update only for meaningful changed evidence', () => {
    const updated = {
      ...candidate,
      contentHash: 'content-b',
      publishedAt: '2026-07-19T00:00:00.000Z',
      materialFacts: ['initial release', 'security fix'],
      version: '2'
    };
    expect(classifyDiscoveryAgainstSeen({ candidate: updated, existing: [recordFor('canonical_url')] }))
      .toEqual(expect.objectContaining({
        outcome: 'material_update', layer: 'canonical_url', existingDiscoveryId: 'existing'
      }));
    expect(classifyDiscoveryAgainstSeen({
      candidate: { ...candidate, contentHash: 'cosmetic-change' },
      existing: [recordFor('canonical_url')]
    })).toEqual(expect.objectContaining({ outcome: 'duplicate', attachEvidenceOnly: true }));
  });

  it('distinguishes a later topic revival from a brand-new topic', () => {
    const topicOnly: SeenDiscoveryRecord = {
      discoveryId: 'old-topic',
      identities: [],
      seenAt: '2026-06-01T00:00:00.000Z',
      topicFingerprint: createTopicFingerprint(candidate.topics)
    };
    expect(classifyDiscoveryAgainstSeen({
      candidate: { ...candidate, externalId: 'new', canonicalUrl: 'https://other.test/new', contentHash: 'new', eventKey: 'new' },
      existing: [topicOnly]
    }).outcome).toBe('revival');
    expect(classifyDiscoveryAgainstSeen({
      candidate: { ...candidate, topics: ['gardening'], externalId: 'garden', canonicalUrl: 'https://garden.test', contentHash: 'garden', eventKey: 'garden' },
      existing: [topicOnly]
    }).outcome).toBe('new');
  });
});

describe('bounded discovery context', () => {
  it('keeps at most forty summarized items with representation from all four categories', () => {
    const categories: DiscoveryContextCategory[] = [
      'pinned_or_saved', 'recent_unsaved', 'recent_presented', 'feedback_or_ignored'
    ];
    const items = Array.from({ length: 120 }, (_, index) => ({
      id: `item-${index}`,
      category: categories[index % categories.length]!,
      summary: 'x'.repeat(700),
      occurredAt: new Date(Date.parse(now) - index * 1_000).toISOString(),
      priority: index % 3
    }));
    const context = buildBoundedDiscoveryContext({ items });
    expect(context.count).toBe(40);
    expect(context.countsByCategory).toEqual({
      pinned_or_saved: 10,
      recent_unsaved: 10,
      recent_presented: 10,
      feedback_or_ignored: 10
    });
    expect(context.items.every((item) => item.summary.length === 500)).toBe(true);
  });
});
