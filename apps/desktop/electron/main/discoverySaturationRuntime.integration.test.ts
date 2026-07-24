import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebugRuntimeClock, type CompanionPersonality, type Discovery } from '@our-companion/shared';
import {
  createDiscoverySeenIdentities,
  createTopicFingerprint,
  fingerprintDiscovery,
  type DiscoveryConnector,
} from '@our-companion/discovery-engine';
import type { WebPageFetcher, WebSearchProvider } from './researchAdapters';
import { AppServices } from './services';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => ':memory:') },
  dialog: {},
  shell: { openExternal: vi.fn(async () => undefined) },
}));

const openServices: AppServices[] = [];
const now = '2026-07-18T00:00:00.000Z';
const topic = 'Saturation runtime integration';
const personality: CompanionPersonality = {
  energy: 50,
  curiosity: 50,
  sociability: 50,
  diligence: 50,
  playfulness: 50,
  confidence: 50,
  calmness: 50,
  shyness: 50,
};

afterEach(async () => {
  await Promise.all(openServices.splice(0).map((services) => services.dispose()));
});

function createServices(
  search: WebSearchProvider,
  pageFetcher?: WebPageFetcher,
  discoveryConnectors: DiscoveryConnector[] = [],
): {
  services: AppServices;
  companionId: string;
} {
  const clock = new DebugRuntimeClock(() => Date.parse(now));
  const services = new AppServices(':memory:', undefined, {
    clock,
    webSearchProvider: search,
    webPageFetcher: pageFetcher,
    discoveryConnectors,
  });
  openServices.push(services);
  const companion = services.db.createCompanion({
    name: 'Saturation',
    personalityDescription: 'A deterministic saturation integration fixture.',
    personalityAnalysisId: 'saturation-runtime',
    personality,
    assetRoot: 'companion://saturation/assets',
  });
  services.db.setPrimaryCompanion(companion.id);
  return { services, companionId: companion.id };
}

async function seedTopic(services: AppServices, companionId: string): Promise<void> {
  const memory = await services.memory.createNode({
    companionId,
    type: 'topic',
    title: topic,
    summary: topic,
    content: topic,
  });
  services.db.insertCuriosityTarget({
    id: 'highest-priority-saturated-target',
    userId: 'default',
    companionId,
    topic,
    description: `Explore ${topic}.`,
    source: 'memory_trigger',
    explorationType: 'deepening',
    priority: 1,
    confidence: 1,
    reason: 'Highest-priority deterministic saturation fixture.',
    expectedValue: 'Exercise runtime target switching.',
    relatedMemoryIds: [memory.id],
    status: 'open',
    createdAt: now,
    updatedAt: now,
  });
}

function saturatedDiscovery(
  companionId: string,
  discoveryTopic = topic,
  id = 'ignored-topic',
): Discovery {
  return {
    id,
    companionId,
    source: 'companion',
    title: discoveryTopic,
    summary: 'The user already ignored this topic.',
    tags: [discoveryTopic],
    raw: {},
    fingerprint: 'ignored-event',
    userInterestScore: 0.5,
    userHistoryScore: 0.5,
    characterExpertiseScore: 0.5,
    noveltyScore: 0.5,
    usefulnessScore: 0.5,
    finalScore: 0.5,
    status: 'dismissed',
    createdAt: now,
    updatedAt: now,
  };
}

describe('Discovery saturation runtime integration', () => {
  it('switches away from the highest-priority target when its topic is in ignored cooldown', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async () => []);
    const { services, companionId } = createServices({
      id: 'saturation-search',
      mode: 'fixture',
      search,
    });
    await seedTopic(services, companionId);
    services.db.insertDiscovery(saturatedDiscovery(companionId));

    const result = await services.autonomy.startExploration({
      companionId,
      trigger: 'manual',
    });

    expect(search).toHaveBeenCalled();
    expect(result.selectedCuriosityTarget?.topic).not.toBe(topic);
    expect(result.discoveryCandidates).toEqual([]);
    expect(result.cycle.state).toBe('reflecting');
  });

  it('stops before provider research when no unsaturated target remains', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async () => []);
    const { services, companionId } = createServices({
      id: 'saturation-stop-search',
      mode: 'fixture',
      search,
    });
    services.db.insertDiscovery(saturatedDiscovery(
      companionId,
      'Ambient AI companion interfaces',
      'ignored-generic-topic',
    ));

    const result = await services.autonomy.startExploration({
      companionId,
      trigger: 'manual',
    });

    expect(search).not.toHaveBeenCalled();
    expect(result.selectedCuriosityTarget).toBeUndefined();
    expect(result.discoveryCandidates).toEqual([]);
    expect(services.db.listEngineTraces({ cycleId: result.cycle.id, limit: 100 }))
      .toContainEqual(expect.objectContaining({
        engine: 'discovery',
        operation: 'provider-search',
        status: 'skipped',
        skipReason: 'ignored_topic_cooldown',
      }));
  });

  it('classifies a later topic event as a revival without any exact Seen identity match', async () => {
    const url = 'https://updates.example.test/new-event';
    const search: WebSearchProvider = {
      id: 'revival-search',
      mode: 'fixture',
      async search(input) {
        return [{
          id: 'revival-result',
          query: input.query,
          title: 'A genuinely new saturation runtime event',
          url,
          domain: 'updates.example.test',
          rank: 1,
          provider: 'revival-search',
        }];
      },
    };
    const pageFetcher: WebPageFetcher = {
      id: 'revival-fetcher',
      mode: 'fixture',
      async fetchPage(input) {
        return {
          id: 'revival-evidence',
          userId: input.userId,
          companionId: input.companionId,
          cycleId: input.cycleId,
          researchIntentId: input.researchIntentId,
          researchPlanId: input.researchPlanId,
          searchResultId: input.searchResult.id,
          query: input.searchResult.query,
          provider: 'revival-search',
          url,
          canonicalUrl: url,
          domain: 'updates.example.test',
          title: input.searchResult.title,
          extractedText: 'A new event provides concrete evidence for this topic.',
          excerpt: 'A new event provides concrete evidence for this topic.',
          contentHash: 'revival-content',
          contentType: 'text/html',
          fetchedAt: now,
          sourceType: input.sourceType,
        };
      },
    };
    const { services, companionId } = createServices(search, pageFetcher);
    await seedTopic(services, companionId);
    const topicFingerprint = createTopicFingerprint([topic])!;
    services.db.insertDiscovery({
      ...saturatedDiscovery(companionId, topic, 'old-topic-discovery'),
      status: 'eligible',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    services.db.upsertDiscoverySeenIdentity({
      id: 'old-topic-seen',
      companionId,
      type: 'canonical_url',
      hash: 'identity-that-does-not-match-the-new-url',
      discoveryId: 'old-topic-discovery',
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        normalizedValue: 'https://updates.example.test/old-event',
        topicFingerprint,
      },
    });

    const result = await services.autonomy.startExploration({
      companionId,
      trigger: 'manual',
    });
    const snapshot = await services.debug.getEngineSnapshot();

    expect(result.discoveryCandidates).toHaveLength(1);
    expect(snapshot.discoveryInspection).toEqual(expect.objectContaining({
      revivalCount: 1,
      newCount: 0,
    }));
  });

  it('rejects an ordinary candidate when the same event was already presented', async () => {
    const eventTopic = 'Ambient AI companion interfaces';
    const url = 'https://updates.example.test/repeated-event';
    const title = 'Repeated ambient interface event';
    const eventFingerprint = fingerprintDiscovery({
      title,
      canonicalUrl: url,
      sourceType: 'technical_article',
    });
    const search: WebSearchProvider = {
      id: 'same-event-search',
      mode: 'fixture',
      async search(input) {
        return [{
          id: 'same-event-result',
          query: input.query,
          title,
          url,
          domain: 'updates.example.test',
          rank: 1,
          provider: 'same-event-search',
        }];
      },
    };
    const pageFetcher: WebPageFetcher = {
      id: 'same-event-fetcher',
      mode: 'fixture',
      async fetchPage(input) {
        return {
          id: 'same-event-evidence',
          userId: input.userId,
          companionId: input.companionId,
          cycleId: input.cycleId,
          researchIntentId: input.researchIntentId,
          researchPlanId: input.researchPlanId,
          searchResultId: input.searchResult.id,
          query: input.searchResult.query,
          provider: 'same-event-search',
          url,
          canonicalUrl: url,
          domain: 'updates.example.test',
          title,
          extractedText: 'This is the same event with no verified material change.',
          excerpt: 'This is the same event with no verified material change.',
          contentHash: 'same-event-content',
          contentType: 'text/html',
          fetchedAt: now,
          sourceType: input.sourceType,
        };
      },
    };
    const { services, companionId } = createServices(search, pageFetcher);
    services.db.insertDiscovery({
      ...saturatedDiscovery(companionId, eventTopic, 'presented-same-event'),
      status: 'eligible',
      fingerprint: eventFingerprint,
    });

    const result = await services.autonomy.startExploration({
      companionId,
      trigger: 'manual',
    });
    const snapshot = await services.debug.getEngineSnapshot();

    expect(result.discoveryCandidates).toEqual([]);
    expect(snapshot.discoveryInspection?.candidatesRejected).toEqual([
      expect.objectContaining({ reason: 'same_event_seen' }),
    ]);
  });

  it('accepts a material update through saved-topic and same-event suppression', async () => {
    const materialTopic = 'Ambient AI companion interfaces';
    const url = 'https://updates.example.test/material-event';
    const title = 'Material ambient interface update';
    const candidateFingerprint = fingerprintDiscovery({
      title,
      canonicalUrl: url,
      sourceType: 'technical_article',
    });
    const search: WebSearchProvider = {
      id: 'material-search',
      mode: 'fixture',
      async search(input) {
        return [{
          id: 'material-result',
          query: input.query,
          title,
          url,
          domain: 'updates.example.test',
          rank: 1,
          provider: 'material-search',
        }];
      },
    };
    const fetchMaterialPage = vi.fn<WebPageFetcher['fetchPage']>(async (input) => {
      return {
        id: 'material-evidence',
        userId: input.userId,
        companionId: input.companionId,
        cycleId: input.cycleId,
        researchIntentId: input.researchIntentId,
        researchPlanId: input.researchPlanId,
        searchResultId: input.searchResult.id,
        query: input.searchResult.query,
        provider: 'material-search',
        url,
        canonicalUrl: url,
        domain: 'updates.example.test',
        title,
        extractedText: 'New accessibility controls launched. Battery usage dropped by twenty percent.',
        excerpt: 'New accessibility controls launched. Battery usage dropped by twenty percent.',
        contentHash: 'material-content-v2',
        contentType: 'text/html',
        fetchedAt: now,
        sourceType: input.sourceType,
      };
    });
    const pageFetcher: WebPageFetcher = {
      id: 'material-fetcher',
      mode: 'fixture',
      fetchPage: fetchMaterialPage,
    };
    const { services, companionId } = createServices(search, pageFetcher);
    const saved = saturatedDiscovery(
      companionId,
      materialTopic,
      'saved-material-topic',
    );
    services.db.insertDiscovery({
      ...saved,
      status: 'saved',
      fingerprint: candidateFingerprint,
      url,
      canonicalUrl: url,
    });
    const topicFingerprint = createTopicFingerprint([materialTopic])!;
    const oldIdentity = createDiscoverySeenIdentities({
      connectorId: 'updates.example.test',
      canonicalUrl: url,
      contentHash: 'material-content-v1',
      title,
      topics: [materialTopic],
      observedAt: '2026-06-01T00:00:00.000Z',
      materialFacts: ['Original ambient interface launch'],
    }).find((identity) => identity.type === 'canonical_url')!;
    services.db.upsertDiscoverySeenIdentity({
      id: 'old-material-seen',
      companionId,
      type: oldIdentity.type,
      hash: oldIdentity.hash,
      discoveryId: 'saved-material-topic',
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        normalizedValue: oldIdentity.normalizedValue,
        contentHash: 'material-content-v1',
        materialFacts: ['Original ambient interface launch'],
        topicFingerprint,
      },
    });

    const result = await services.autonomy.startExploration({
      companionId,
      trigger: 'manual',
    });
    const snapshot = await services.debug.getEngineSnapshot();

    expect(result.discoveryCandidates).toHaveLength(1);
    expect(result.selectedCuriosityTarget?.topic).toBe(materialTopic);
    expect(snapshot.discoveryInspection).toEqual(expect.objectContaining({
      mode: 'core',
      materialUpdateCount: 1,
      candidatesAccepted: [result.discoveryCandidates[0]!.id],
    }));
    expect(fetchMaterialPage).toHaveBeenCalledTimes(1);

    const duplicateProbeTopic = 'Same URL unchanged content verification';
    await services.memory.createNode({
      companionId,
      type: 'topic',
      title: duplicateProbeTopic,
      summary: duplicateProbeTopic,
      content: duplicateProbeTopic,
    });
    const duplicateResult = await services.autonomy.startExploration({
      companionId,
      trigger: 'manual',
    });
    const duplicateSnapshot = await services.debug.getEngineSnapshot();

    expect(fetchMaterialPage).toHaveBeenCalledTimes(2);
    expect(duplicateResult.discoveryCandidates).toEqual([]);
    expect(duplicateSnapshot.discoveryInspection).toEqual(expect.objectContaining({
      duplicateCount: 1,
      candidatesAccepted: [],
      candidatesRejected: [expect.objectContaining({
        reason: expect.stringContaining('already_seen'),
      })],
    }));
  });

  it('ignores and repairs an orphan Seen target from a legacy cap-poisoned candidate', async () => {
    const url = 'https://updates.example.test/recovered-orphan';
    const title = 'Recovered orphan discovery artifact';
    const search: WebSearchProvider = {
      id: 'orphan-repair-search',
      mode: 'fixture',
      async search(input) {
        return [{
          id: 'orphan-repair-result',
          query: input.query,
          title,
          url,
          domain: 'updates.example.test',
          rank: 1,
          provider: 'orphan-repair-search',
        }];
      },
    };
    const pageFetcher: WebPageFetcher = {
      id: 'orphan-repair-fetcher',
      mode: 'fixture',
      async fetchPage(input) {
        return {
          id: 'orphan-repair-evidence',
          userId: input.userId,
          companionId: input.companionId,
          cycleId: input.cycleId,
          researchIntentId: input.researchIntentId,
          researchPlanId: input.researchPlanId,
          searchResultId: input.searchResult.id,
          query: input.searchResult.query,
          provider: 'orphan-repair-search',
          url,
          canonicalUrl: url,
          domain: 'updates.example.test',
          title,
          extractedText: 'Durable evidence makes the previously poisoned artifact eligible again.',
          excerpt: 'Durable evidence makes the artifact eligible again.',
          contentHash: 'orphan-repair-content',
          contentType: 'text/html',
          fetchedAt: now,
          sourceType: input.sourceType,
        };
      },
    };
    const { services, companionId } = createServices(search, pageFetcher);
    await seedTopic(services, companionId);
    const canonicalIdentity = createDiscoverySeenIdentities({
      connectorId: 'updates.example.test',
      canonicalUrl: url,
      title,
      topics: [topic],
      observedAt: '2026-06-01T00:00:00.000Z',
    }).find((identity) => identity.type === 'canonical_url')!;
    services.db.upsertDiscoverySeenIdentity({
      id: 'legacy-orphan-seen',
      companionId,
      type: canonicalIdentity.type,
      hash: canonicalIdentity.hash,
      discoveryId: 'candidate-that-was-never-persisted',
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        normalizedValue: canonicalIdentity.normalizedValue,
        topicFingerprint: createTopicFingerprint([topic]),
      },
    });
    services.db.upsertDiscoverySeenIdentity({
      id: 'legacy-unrelated-orphan-seen',
      companionId,
      type: 'external_id',
      hash: 'unrelated-orphan-hash',
      discoveryId: 'another-candidate-that-never-existed',
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
      metadata: { normalizedValue: 'unrelated:orphan' },
    });

    const result = await services.autonomy.startExploration({
      companionId,
      trigger: 'manual',
    });
    const repaired = services.db.getDiscoverySeenIdentity(
      companionId,
      canonicalIdentity.type,
      canonicalIdentity.hash,
    )!;
    const durableTarget = repaired.discoveryId
      ? services.db.getDiscoveryCandidate(repaired.discoveryId)
        ?? services.db.getDiscovery(repaired.discoveryId)
      : undefined;

    expect(result.discoveryCandidates).toHaveLength(1);
    expect(repaired.discoveryId).not.toBe('candidate-that-was-never-persisted');
    expect(durableTarget).toBeDefined();
    expect(services.db.getDiscoverySeenIdentity(
      companionId,
      'external_id',
      'unrelated-orphan-hash',
    )?.discoveryId).toBeUndefined();
  });

  it('fairly executes every eligible Discovery Base across bounded rounds', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async () => []);
    const { services, companionId } = createServices({
      id: 'base-scheduler-search',
      mode: 'fixture',
      search,
    });
    await seedTopic(services, companionId);
    for (let index = 1; index <= 5; index += 1) {
      services.db.upsertDiscoveryBase({
        id: `scheduler-base-${index}`,
        companionId,
        connectorId: 'generic-web',
        scope: 'query',
        locator: `${topic} source ${index}`,
        data: { topic },
        origin: 'user',
        state: 'active',
        discoveredAt: `2026-07-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`,
        // Deliberately make the newest three sort first under the old
        // updated_at DESC behavior.
        updatedAt: `2026-07-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`,
      });
    }

    await services.autonomy.startExploration({ companionId, trigger: 'manual' });
    const firstRound = (await services.debug.getEngineSnapshot()).discoveryInspection?.executedBases
      .map((base) => base.id) ?? [];
    expect(services.db.listDiscoveryBasesForExecution(companionId, 5).map((base) => base.id).slice(0, 2))
      .toEqual(['scheduler-base-4', 'scheduler-base-5']);
    const secondTopic = 'Fair persistent source scheduling';
    await services.memory.createNode({
      companionId,
      type: 'topic',
      title: secondTopic,
      summary: secondTopic,
      content: secondTopic,
    });
    const secondResult = await services.autonomy.startExploration({ companionId, trigger: 'manual' });
    expect(secondResult.selectedCuriosityTarget?.topic).toContain(secondTopic);
    const secondRound = (await services.debug.getEngineSnapshot()).discoveryInspection?.executedBases
      .map((base) => base.id) ?? [];

    expect(firstRound).toHaveLength(3);
    expect(secondRound).toHaveLength(3);
    expect(new Set([...firstRound, ...secondRound])).toEqual(new Set([
      'scheduler-base-1',
      'scheduler-base-2',
      'scheduler-base-3',
      'scheduler-base-4',
      'scheduler-base-5',
    ]));
    expect(services.db.listDiscoveryBasesForExecution(companionId, 5).every((base) => base.lastCheckedAt)).toBe(true);
  });

  it('accepts a structured-connector material update using normalized content provenance', async () => {
    const url = 'https://feed.example.test/items/material-update';
    const title = 'Structured material update';
    const connector: DiscoveryConnector = {
      source: 'rss',
      providerMode: 'fixture',
      async fetch() {
        return [{
          id: 'structured-entry',
          title,
          summary: 'A new accessibility mode launched. Battery use dropped by twenty percent.',
          url,
          publishedAt: now,
          version: 'v2',
        }];
      },
      normalize(item) {
        return {
          source: 'rss',
          externalId: String(item.id),
          title: String(item.title),
          summary: String(item.summary),
          url: String(item.url),
          publishedAt: String(item.publishedAt),
          tags: ['structured'],
          raw: item,
        };
      },
    };
    const { services, companionId } = createServices(
      { id: 'unavailable-search', mode: 'unavailable', search: async () => [] },
      undefined,
      [connector],
    );
    await seedTopic(services, companionId);
    const eventFingerprint = fingerprintDiscovery({
      title,
      canonicalUrl: url,
      sourceType: 'article',
    });
    services.db.insertDiscovery({
      ...saturatedDiscovery(companionId, topic, 'saved-structured-topic'),
      status: 'saved',
      fingerprint: eventFingerprint,
    });
    const oldIdentity = createDiscoverySeenIdentities({
      connectorId: 'rss',
      externalId: 'structured-entry',
      canonicalUrl: url,
      contentHash: 'structured-content-v1',
      title,
      topics: [topic],
      observedAt: '2026-06-01T00:00:00.000Z',
      materialFacts: ['The original structured release launched'],
      version: 'v1',
    }).find((identity) => identity.type === 'external_id')!;
    services.db.upsertDiscoverySeenIdentity({
      id: 'old-structured-seen',
      companionId,
      type: oldIdentity.type,
      hash: oldIdentity.hash,
      discoveryId: 'saved-structured-topic',
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-01T00:00:00.000Z',
      metadata: {
        normalizedValue: oldIdentity.normalizedValue,
        contentHash: 'structured-content-v1',
        materialFacts: ['The original structured release launched'],
        version: 'v1',
        topicFingerprint: createTopicFingerprint([topic]),
      },
    });

    const result = await services.autonomy.startExploration({
      companionId,
      trigger: 'manual',
    });
    const rawEvidence = JSON.parse(result.discoveryCandidates[0]?.rawEvidence ?? '{}') as Record<string, unknown>;
    const snapshot = await services.debug.getEngineSnapshot();
    const persistedUpdate = services.db.getDiscoverySeenIdentity(
      companionId,
      oldIdentity.type,
      oldIdentity.hash,
    );

    expect(result.discoveryCandidates).toHaveLength(1);
    expect(rawEvidence).toEqual(expect.objectContaining({
      contentHash: expect.any(String),
      publishedAt: now,
      version: 'v2',
    }));
    expect(persistedUpdate?.metadata).toEqual(expect.objectContaining({
      contentHash: rawEvidence.contentHash,
      publishedAt: now,
      version: 'v2',
    }));
    expect(snapshot.discoveryInspection).toEqual(expect.objectContaining({
      materialUpdateCount: 1,
      candidatesAccepted: [result.discoveryCandidates[0]!.id],
    }));
  });
});
