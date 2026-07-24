import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CompanionPersonality,
  CuriosityTarget,
  Discovery,
  NormalizedDiscovery,
  Pattern,
} from '@our-companion/shared';
import { DebugRuntimeClock, createSemanticFingerprint } from '@our-companion/shared';
import type { DiscoveryConnector, RawDiscoveryItem } from '@our-companion/discovery-engine';
import { buildInterestGraph } from '@our-companion/memory-engine';
import type { WebPageFetcher, WebSearchProvider } from './researchAdapters';
import { AppServices } from './services';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => ':memory:') },
  dialog: {},
  shell: { openExternal: vi.fn(async () => undefined) }
}));

const openServices: AppServices[] = [];
const personality: CompanionPersonality = {
  energy: 50,
  curiosity: 50,
  sociability: 50,
  diligence: 50,
  playfulness: 50,
  confidence: 50,
  calmness: 50,
  shyness: 50
};

function createCompanion(services: AppServices, name: string) {
  return services.db.createCompanion({
    name,
    personalityDescription: `${name} isolation fixture.`,
    personalityAnalysisId: `${name.toLowerCase()}-isolation`,
    personality,
    assetRoot: `companion://${name.toLowerCase()}/assets`
  });
}

function autonomyConnector(
  fetch: DiscoveryConnector['fetch'] = async () => [{}]
): DiscoveryConnector {
  return {
    source: 'github',
    providerMode: 'fixture',
    fetch,
    normalize: (): NormalizedDiscovery => ({
      source: 'github',
      title: 'Local-first TypeScript companion architecture',
      summary: 'A focused implementation reference for local-first Companion state.',
      url: 'https://example.com/local-first-companion',
      tags: ['local-first', 'typescript', 'frontend'],
      raw: {}
    })
  };
}

async function seedAutonomyMemory(
  services: AppServices,
  companionId: string
): Promise<void> {
  await services.memory.createNode({
    companionId,
    type: 'topic',
    title: 'Local-first TypeScript companion architecture',
    summary: 'Explore state ownership and deterministic local-first behavior.',
    content: 'Keep every autonomous artifact owned by the originating Companion.'
  });
}

afterEach(async () => {
  await Promise.all(openServices.splice(0).map((services) => services.dispose()));
});

describe('production memory companion isolation', () => {
  it('consumes Memory deletion tombstones and clears unsupported derived cognition', async () => {
    const clock = new DebugRuntimeClock(() => Date.parse('2026-07-18T04:00:00.000Z'));
    const services = new AppServices(':memory:', undefined, { clock });
    openServices.push(services);
    const companion = createCompanion(services, 'First');
    services.db.setPrimaryCompanion(companion.id);
    const timestamp = '2026-07-18T00:00:00.000Z';
    const deletedMemory = services.db.insertMemoryNode({
      id: 'memory-to-delete',
      userId: 'local',
      companionId: companion.id,
      type: 'topic',
      title: 'Disposable local-first direction',
      summary: 'A direction that should disappear from cognition.',
      importance: 0.8,
      isPinned: false,
      isMarkedWrong: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const retainedMemory = services.db.insertMemoryNode({
      id: 'memory-to-retain',
      userId: 'local',
      companionId: companion.id,
      type: 'topic',
      title: 'Retained private architecture',
      summary: 'A still-supported direction.',
      importance: 0.7,
      isPinned: false,
      isMarkedWrong: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const doomedPattern: Pattern = {
      id: 'pattern-doomed',
      userId: 'local',
      companionId: companion.id,
      type: 'repeated_theme',
      title: 'Disposable theme keeps appearing',
      summary: 'Only one observation remains after deletion.',
      confidence: 0.8,
      strength: 0.75,
      freshness: 0.9,
      evidence: [
        { sourceType: 'memory', sourceId: deletedMemory.id, summary: deletedMemory.title, weight: 0.8 },
        { sourceType: 'memory', sourceId: retainedMemory.id, summary: retainedMemory.title, weight: 0.7 },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const survivingPattern: Pattern = {
      ...doomedPattern,
      id: 'pattern-survives',
      semanticFingerprint: createSemanticFingerprint('pattern', ['repeated_theme', 'private architecture']),
      normalizedTopics: ['private architecture'],
      title: 'Private architecture keeps appearing',
      evidence: [
        ...doomedPattern.evidence,
        { sourceType: 'journey_event', sourceId: 'milestone-retained', summary: 'Private architecture milestone', weight: 0.65 },
      ],
    };
    services.db.insertPattern(doomedPattern);
    services.db.insertPattern(survivingPattern);
    const initialGraph = buildInterestGraph({
      userId: `local:${companion.id}`,
      memoryNodes: [deletedMemory, retainedMemory],
      patterns: [doomedPattern, survivingPattern],
      discoveries: [],
      feedback: [],
    });
    services.db.upsertInterestGraph(initialGraph);
    const target: CuriosityTarget = {
      id: 'curiosity-from-deleted-memory',
      userId: 'local',
      companionId: companion.id,
      topic: 'Disposable local-first direction',
      description: 'Explore the now-deleted direction.',
      source: 'memory_trigger',
      explorationType: 'adjacent',
      priority: 0.8,
      confidence: 0.8,
      reason: 'Derived only from the deleted memory and its unsupported Pattern.',
      expectedValue: 'This should close after deletion.',
      relatedMemoryIds: [deletedMemory.id],
      relatedPatternIds: [doomedPattern.id],
      generatedFromIds: [deletedMemory.id, doomedPattern.id],
      status: 'open',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    services.db.insertCuriosityTarget(target);
    services.db.markMemoriesProcessed([deletedMemory.id, retainedMemory.id], timestamp);

    await services.memory.deleteNode(deletedMemory.id);

    const tombstone = services.db.getMemoryProcessingState(deletedMemory.id);
    expect(tombstone?.deletedAt).toBeTruthy();
    expect(tombstone?.processedRevision).toBe(tombstone?.revision);
    expect(services.db.listPatterns('local', 100, companion.id).map((pattern) => pattern.id))
      .not.toContain(doomedPattern.id);
    const recomputedPattern = services.db.listPatterns('local', 100, companion.id)
      .find((pattern) => pattern.id === survivingPattern.id);
    expect(recomputedPattern?.evidence.map((evidence) => evidence.sourceId))
      .toEqual([retainedMemory.id, 'milestone-retained']);
    expect(recomputedPattern?.strength).toBeLessThan(survivingPattern.strength);

    const graph = services.db.getInterestGraph(`local:${companion.id}`);
    expect(graph.nodes.map((node) => node.label)).not.toContain(deletedMemory.title);
    expect(graph.nodes.map((node) => node.label)).not.toContain(doomedPattern.title);
    const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
    expect(graph.edges.every((edge) => graphNodeIds.has(edge.fromNodeId) && graphNodeIds.has(edge.toNodeId))).toBe(true);

    expect(services.db.getCuriosityTarget(target.id)).toEqual(expect.objectContaining({
      status: 'completed',
      relatedMemoryIds: [],
      relatedPatternIds: [],
      generatedFromIds: [],
    }));
  });

  it('inspects scoped cognition lineage and keeps repeated Memory recompute idempotent', async () => {
    const clock = new DebugRuntimeClock(() => Date.parse('2026-07-18T00:00:00.000Z'));
    const services = new AppServices(':memory:', undefined, { clock });
    openServices.push(services);
    const first = createCompanion(services, 'First');
    services.db.setPrimaryCompanion(first.id);
    const selected = await services.memory.createNode({
      companionId: first.id,
      type: 'topic',
      title: 'Local-first runtime architecture',
      summary: 'A local-first architecture for deterministic Companion runtime state.',
      content: 'Local-first architecture keeps runtime state private and deterministic.'
    });
    await services.memory.createNode({
      companionId: first.id,
      type: 'topic',
      title: 'Local-first memory architecture',
      summary: 'A local-first architecture for private Companion memory.',
      content: 'Local-first architecture keeps memory ownership explicit.'
    });

    const firstReport = await services.memory.recomputeImpact({ id: selected.id });
    expect(firstReport.researchCyclesStarted).toBe(0);
    expect(firstReport.patternsCreated).toBeGreaterThan(0);
    const before = {
      patterns: services.db.listPatterns('default', 100, first.id).map((pattern) => pattern.id),
      curiosity: services.db.listCuriosityTargets('default', 100, first.id).map((target) => target.id),
      cycles: services.db.listExplorationCycles(100).length,
    };
    const impact = await services.memory.inspectImpact(selected.id);
    expect(impact.interestNodeIds.length).toBeGreaterThan(0);
    expect(impact.patternIds.length).toBeGreaterThan(0);
    expect(impact.curiosityTargetIds.length).toBeGreaterThan(0);
    expect(impact.lastCognitiveEvaluation).toBe('2026-07-18T00:00:00.000Z');

    const secondReport = await services.memory.recomputeImpact({ id: selected.id });
    expect(secondReport.patternsCreated).toBe(0);
    expect(services.db.listPatterns('default', 100, first.id).map((pattern) => pattern.id)).toEqual(before.patterns);
    expect(services.db.listCuriosityTargets('default', 100, first.id).map((target) => target.id)).toEqual(before.curiosity);
    expect(services.db.listExplorationCycles(100)).toHaveLength(before.cycles);

    const second = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(second.id);
    await expect(services.memory.inspectImpact(selected.id)).rejects.toThrow('MEMORY_IMPACT_NOT_FOUND');
    services.db.setPrimaryCompanion(first.id);
    await services.memory.deleteNode(selected.id);
    await expect(services.memory.inspectImpact(selected.id)).rejects.toThrow('MEMORY_IMPACT_NOT_FOUND');
  });

  it('advances application time deterministically without changing real timer time', async () => {
    const realMs = Date.parse('2026-07-18T04:00:00.000Z');
    const clock = new DebugRuntimeClock(() => realMs);
    const services = new AppServices(':memory:', undefined, { clock });
    openServices.push(services);
    const companion = createCompanion(services, 'Clock');
    services.db.setPrimaryCompanion(companion.id);
    const before = await services.debug.getRuntimeTime();
    const advanced = await services.debug.advanceRuntimeTime({ milliseconds: 24 * 60 * 60 * 1000 });
    expect(Date.parse(advanced.newRuntimeTime) - Date.parse(before.runtimeTime)).toBe(24 * 60 * 60 * 1000);
    const diary = await services.diary.generateDaily();
    expect(diary.createdAt.startsWith('2026-07-19')).toBe(true);
    const reset = await services.debug.resetRuntimeTime();
    expect(reset.offsetMs).toBe(0);
    expect(reset.runtimeTime).toBe('2026-07-18T04:00:00.000Z');
  });

  it('owns createNode and addToJourney memories and hides them after switching Companions', async () => {
    const services = new AppServices(':memory:');
    openServices.push(services);
    const first = createCompanion(services, 'First');
    services.db.setPrimaryCompanion(first.id);

    const manual = await services.memory.createNode({
      type: 'topic',
      title: 'First Companion private note',
      content: 'Only the first Companion should rank or display this.'
    });
    const discovery: Discovery = {
      id: 'owned-discovery',
      companionId: first.id,
      source: 'github',
      title: 'First Companion discovery',
      summary: 'A discovery saved before switching Companions.',
      tags: ['private-first-topic'],
      raw: {},
      userInterestScore: 0.9,
      userHistoryScore: 0.9,
      characterExpertiseScore: 0.9,
      noveltyScore: 0.9,
      usefulnessScore: 0.9,
      finalScore: 0.9,
      status: 'announced',
      announcedAt: '2026-07-17T01:00:00.000Z',
      createdAt: '2026-07-17T01:00:00.000Z',
      updatedAt: '2026-07-17T01:00:00.000Z'
    };
    services.db.insertDiscovery(discovery);
    const saved = await services.discovery.addToJourney({ discoveryId: discovery.id });
    const firstDiary = await services.diary.generateDaily();

    expect(services.db.listMemoryNodes(first.id).map((memory) => memory.id))
      .toEqual(expect.arrayContaining([manual.id, saved.memory.id]));
    expect(services.db.listMemoryNodes(first.id).every((memory) => memory.companionId === first.id))
      .toBe(true);

    const second = createCompanion(services, 'Second');
    await services.character.setPrimary(second.id);

    expect(services.db.listMemoryNodes(second.id)).toEqual([]);
    expect((await services.memory.getGraph()).nodes).toEqual([]);
    expect(await services.memory.search({ query: 'First Companion' })).toEqual([]);
    expect(await services.memory.getNode(manual.id)).toBeUndefined();
    expect(await services.diary.getEntries()).toEqual([]);

    expect((await services.memory.getGraph({ companionId: first.id })).nodes.map((node) => node.id))
      .toEqual(expect.arrayContaining([manual.id, saved.memory.id]));
    expect(await services.diary.getEntries({ characterId: first.id }))
      .toEqual([expect.objectContaining({ id: firstDiary.id, characterId: first.id })]);
  });

  it('does not let a Companion save another Companion discovery into its memory', async () => {
    const services = new AppServices(':memory:');
    openServices.push(services);
    const first = createCompanion(services, 'First');
    const second = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(second.id);
    services.db.insertDiscovery({
      id: 'foreign-discovery',
      companionId: first.id,
      source: 'github',
      title: 'Foreign discovery',
      tags: [],
      raw: {},
      userInterestScore: 0.8,
      userHistoryScore: 0.8,
      characterExpertiseScore: 0.8,
      noveltyScore: 0.8,
      usefulnessScore: 0.8,
      finalScore: 0.8,
      status: 'announced',
      announcedAt: '2026-07-17T01:00:00.000Z',
      createdAt: '2026-07-17T01:00:00.000Z',
      updatedAt: '2026-07-17T01:00:00.000Z'
    });

    await expect(
      services.discovery.addToJourney({ discoveryId: 'foreign-discovery' })
    ).rejects.toThrow('different Companion');
    expect(services.db.listMemoryNodes(first.id)).toEqual([]);
    expect(services.db.listMemoryNodes(second.id)).toEqual([]);
  });

  it('scopes discovery feed, mutations, presentation, and autonomous history to one Companion', async () => {
    const services = new AppServices(':memory:');
    openServices.push(services);
    const first = createCompanion(services, 'First');
    const second = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(second.id);
    const firstDiscovery = {
      id: 'first-only-discovery',
      companionId: first.id,
      source: 'github',
      title: 'First only discovery',
      tags: ['first'],
      raw: {},
      userInterestScore: 0.8,
      userHistoryScore: 0.8,
      characterExpertiseScore: 0.8,
      noveltyScore: 0.8,
      usefulnessScore: 0.8,
      finalScore: 0.8,
      status: 'eligible',
      createdAt: '2026-07-17T01:00:00.000Z'
    } satisfies Discovery;
    const secondDiscovery = {
      ...firstDiscovery,
      id: 'second-only-discovery',
      companionId: second.id,
      title: 'Second only discovery'
    };
    services.db.insertDiscovery(firstDiscovery);
    services.db.insertDiscovery(secondDiscovery);

    expect((await services.discovery.getFeed()).map((discovery) => discovery.id))
      .toEqual(['second-only-discovery']);
    await expect(services.discovery.markInterested(firstDiscovery.id))
      .rejects.toThrow('active Companion');
    await expect(services.discovery.markNotInterested(firstDiscovery.id))
      .rejects.toThrow('active Companion');
    expect(services.requestDiscoveryPresentation(firstDiscovery)).toEqual(
      expect.objectContaining({
        action: 'stay_silent',
        timing: 'later',
        reason: 'discovery_companion_mismatch'
      })
    );

    const discoveriesSpy = vi.spyOn(services.db, 'listDiscoveries');
    const feedbackSpy = vi.spyOn(services.db, 'listDiscoveryFeedback');
    await services.autonomy.startExploration({ companionId: second.id });
    expect(discoveriesSpy).toHaveBeenCalledWith({ limit: 100, companionId: second.id });
    expect(feedbackSpy).toHaveBeenCalledWith(100, undefined, second.id);
  });

  it('does not hand an in-flight refresh result to a newly active Companion', async () => {
    let resolveFetch!: (items: RawDiscoveryItem[]) => void;
    const connector: DiscoveryConnector = {
      source: 'github',
      providerMode: 'fixture',
      fetch: () => new Promise<RawDiscoveryItem[]>((resolve) => {
        resolveFetch = resolve;
      }),
      normalize: (): NormalizedDiscovery => ({
        source: 'github',
        title: 'Refresh owned by the original Companion',
        summary: 'The primary Companion switches while this provider is pending.',
        url: 'https://example.com/in-flight-owner',
        tags: ['frontend'],
        raw: {}
      })
    };
    const services = new AppServices(':memory:', undefined, {
      discoveryConnectors: [connector]
    });
    openServices.push(services);
    const first = createCompanion(services, 'First');
    services.db.setPrimaryCompanion(first.id);

    const pendingRefresh = services.runDiscoveryRefresh();
    const second = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(second.id);
    const result = await pendingRefresh;

    expect(result).toEqual({ discoveries: [], newlyInserted: [] });
    expect(services.db.listDiscoveries({ companionId: second.id, limit: 100 })).toEqual([]);
    expect(services.db.listDiscoveries({ companionId: first.id, limit: 100 })).toEqual([]);
  });

  it('runs explicit non-active Companion autonomy entirely under that owner', async () => {
    const services = new AppServices(':memory:', undefined, {
      discoveryConnectors: []
    });
    openServices.push(services);
    const active = createCompanion(services, 'First');
    const owner = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(active.id);
    services.db.saveCharacterState(services.db.getCharacterState(active.id));
    services.db.saveCharacterState(services.db.getCharacterState(owner.id));
    await seedAutonomyMemory(services, owner.id);

    const activeBefore = services.db.getCharacterState(active.id);
    const saveCharacterState = vi.spyOn(services.db, 'saveCharacterState');
    const events: Array<{ companionId: string; message?: string }> = [];
    services.attachAutonomyBroadcasters({
      explorationEvent: (event) => {
        events.push({ companionId: event.companionId, message: event.message });
      }
    });

    const result = await services.autonomy.startExploration({
      companionId: owner.id,
      trigger: 'manual'
    });

    expect(result.cycle.companionId).toBe(owner.id);
    const ownerWrites = saveCharacterState.mock.calls.map(([state]) => state.characterId);
    expect(ownerWrites.length).toBeGreaterThan(0);
    expect(new Set(ownerWrites)).toEqual(new Set([owner.id]));
    expect(services.db.getCharacterState(active.id)).toEqual(activeBefore);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.companionId === owner.id)).toBe(true);
    expect(events.some((event) => event.message?.includes(owner.name))).toBe(true);
    expect(events.every((event) => !event.message?.includes(active.name))).toBe(true);
    saveCharacterState.mockRestore();
  });

  it('keeps an in-flight autonomous cycle on its original owner after a primary switch', async () => {
    let resolveFetch!: (items: RawDiscoveryItem[]) => void;
    const services = new AppServices(':memory:', undefined, {
      discoveryConnectors: [autonomyConnector(() => new Promise<RawDiscoveryItem[]>((resolve) => {
        resolveFetch = resolve;
      }))]
    });
    openServices.push(services);
    const owner = createCompanion(services, 'First');
    const newlyActive = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(owner.id);
    services.db.saveCharacterState(services.db.getCharacterState(owner.id));
    services.db.saveCharacterState(services.db.getCharacterState(newlyActive.id));
    await seedAutonomyMemory(services, owner.id);

    const newlyActiveBefore = services.db.getCharacterState(newlyActive.id);
    const saveCharacterState = vi.spyOn(services.db, 'saveCharacterState');
    const events: Array<{ companionId: string; message?: string }> = [];
    services.attachAutonomyBroadcasters({
      explorationEvent: (event) => {
        events.push({ companionId: event.companionId, message: event.message });
      }
    });

    const pendingCycle = services.autonomy.startExploration({
      companionId: owner.id,
      trigger: 'manual'
    });
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'));
    services.db.setPrimaryCompanion(newlyActive.id);
    resolveFetch([{}]);
    const result = await pendingCycle;

    expect(result.cycle.companionId).toBe(owner.id);
    expect(result.selectedInsight).toBeDefined();
    const writes = saveCharacterState.mock.calls.map(([state]) => state.characterId);
    expect(new Set(writes)).toEqual(new Set([owner.id]));
    expect(services.db.getCharacterState(newlyActive.id)).toEqual(newlyActiveBefore);
    expect(services.db.getCharacterState(owner.id)).toEqual(expect.objectContaining({
      coreState: 'idle',
      intent: 'waiting'
    }));
    expect(events.every((event) => event.companionId === owner.id)).toBe(true);
    expect(events.some((event) => event.message?.includes(owner.name))).toBe(true);
    expect(events.every((event) => !event.message?.includes(newlyActive.name))).toBe(true);
    expect(services.db.listDiscoveries({ companionId: newlyActive.id, limit: 100 })).toEqual([]);
  });

  it('keeps search evidence on the captured owner when the active Companion changes during an open-web search', async () => {
    const resolveSearches: Array<(items: Array<{ id: string; query: string; title: string; url: string; domain: string; rank: number; provider: string }>) => void> = [];
    const search: WebSearchProvider = {
      id: 'switch-search', mode: 'fixture',
      search: () => new Promise((resolve) => { resolveSearches.push(resolve); })
    };
    const pageFetcher: WebPageFetcher = {
      id: 'switch-fetcher', mode: 'fixture',
      async fetchPage(input) {
        return {
      id: 'owner-evidence', userId: input.userId, companionId: input.companionId, cycleId: input.cycleId,
      researchIntentId: input.researchIntentId, researchPlanId: input.researchPlanId,
      searchResultId: input.searchResult.id, query: input.searchResult.query, provider: 'switch-search', url: input.searchResult.url, canonicalUrl: input.searchResult.url,
      domain: input.searchResult.domain, title: input.searchResult.title, extractedText: 'Fetched public evidence owned by the original Companion.',
      excerpt: 'Fetched public evidence owned by the original Companion.', contentHash: 'owner-hash', contentType: 'text/html',
      fetchedAt: '2026-07-18T00:00:00.000Z', sourceType: input.sourceType
        };
      }
    };
    const services = new AppServices(':memory:', undefined, { webSearchProvider: search, webPageFetcher: pageFetcher, discoveryConnectors: [] });
    openServices.push(services);
    const owner = createCompanion(services, 'First');
    const newlyActive = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(owner.id);
    await seedAutonomyMemory(services, owner.id);

    const pending = services.autonomy.startExploration({ companionId: owner.id, trigger: 'manual' });
    await vi.waitFor(() => expect(resolveSearches.length).toBeGreaterThan(0));
    services.db.setPrimaryCompanion(newlyActive.id);
    for (const resolveSearch of resolveSearches) resolveSearch([{ id: 'actual-result', query: 'Local-first TypeScript companion architecture', title: 'Official implementation evidence', url: 'https://docs.example.test/owner', domain: 'docs.example.test', rank: 1, provider: 'switch-search' }]);
    const result = await pending;

    expect(result.cycle.companionId).toBe(owner.id);
    expect(services.db.listResearchIntents({ companionId: owner.id })).toHaveLength(1);
    expect(services.db.listWebPageEvidence({ companionId: owner.id })).toEqual([expect.objectContaining({ companionId: owner.id, id: 'owner-evidence' })]);
    expect(services.db.listResearchIntents({ companionId: newlyActive.id })).toEqual([]);
    expect(services.db.listWebPageEvidence({ companionId: newlyActive.id })).toEqual([]);
  });

  it('keeps page-fetch evidence on the captured owner when the active Companion changes during extraction', async () => {
    let resolvePage!: (page: import('@our-companion/shared').WebPageEvidence) => void;
    let pendingPageInput!: Parameters<WebPageFetcher['fetchPage']>[0];
    const search: WebSearchProvider = {
      id: 'page-switch-search', mode: 'fixture',
      async search(input) { return [{ id: 'actual-result', query: input.query, title: 'Official implementation evidence', url: 'https://docs.example.test/page-owner', domain: 'docs.example.test', rank: 1, provider: 'page-switch-search' }]; }
    };
    const pageFetcher: WebPageFetcher = {
      id: 'page-switch-fetcher', mode: 'fixture',
      fetchPage: (input) => new Promise((resolve) => {
        pendingPageInput = input;
        resolvePage = (page) => resolve(page);
      })
    };
    const services = new AppServices(':memory:', undefined, { webSearchProvider: search, webPageFetcher: pageFetcher, discoveryConnectors: [] });
    openServices.push(services);
    const owner = createCompanion(services, 'First');
    const newlyActive = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(owner.id);
    await seedAutonomyMemory(services, owner.id);

    const pending = services.autonomy.startExploration({ companionId: owner.id, trigger: 'manual' });
    await vi.waitFor(() => expect(resolvePage).toBeTypeOf('function'));
    services.db.setPrimaryCompanion(newlyActive.id);
    resolvePage({
      id: 'page-owner-evidence', userId: pendingPageInput.userId, companionId: pendingPageInput.companionId, cycleId: pendingPageInput.cycleId,
      researchIntentId: pendingPageInput.researchIntentId, researchPlanId: pendingPageInput.researchPlanId, searchResultId: pendingPageInput.searchResult.id,
      query: pendingPageInput.searchResult.query, provider: 'page-switch-search', url: pendingPageInput.searchResult.url, canonicalUrl: pendingPageInput.searchResult.url,
      domain: pendingPageInput.searchResult.domain, title: pendingPageInput.searchResult.title, extractedText: 'Fetched evidence remains private to its original owner.', excerpt: 'Fetched evidence remains private to its original owner.',
      contentHash: 'page-owner-hash', contentType: 'text/html', fetchedAt: '2026-07-18T00:00:00.000Z', sourceType: pendingPageInput.sourceType
    });
    const result = await pending;

    expect(result.cycle.companionId).toBe(owner.id);
    expect(services.db.listWebPageEvidence({ companionId: owner.id })).toEqual([expect.objectContaining({ companionId: owner.id, id: 'page-owner-evidence' })]);
    expect(services.db.listWebPageEvidence({ companionId: newlyActive.id })).toEqual([]);
  });

  it('applies feedback for an old cycle only to the cycle owner after switching Companions', async () => {
    const services = new AppServices(':memory:', undefined, {
      discoveryConnectors: [autonomyConnector()]
    });
    openServices.push(services);
    const owner = createCompanion(services, 'First');
    const newlyActive = createCompanion(services, 'Second');
    services.db.setPrimaryCompanion(owner.id);
    await seedAutonomyMemory(services, owner.id);
    const result = await services.autonomy.startExploration({
      companionId: owner.id,
      trigger: 'manual'
    });
    const insightId = result.cycle.selectedInsightId!;
    const ownerInsight = services.db.getCompanionInsight(insightId)!;
    services.db.insertCompanionInsight({
      ...ownerInsight,
      id: 'foreign-owner-insight',
      companionId: newlyActive.id,
      title: 'Second Companion foreign insight'
    });

    services.db.setPrimaryCompanion(newlyActive.id);
    services.db.saveCharacterState(services.db.getCharacterState(newlyActive.id));
    const newlyActiveStateBefore = services.db.getCharacterState(newlyActive.id);
    const ownerRelationshipBefore = services.db.getRelationship('local', owner.id);
    const newlyActiveRelationshipBefore = services.db.getRelationship('local', newlyActive.id);
    const ownerMemoriesBefore = services.db.listMemoryNodes(owner.id).length;

    await expect(services.autonomy.submitFeedback({
      cycleId: result.cycle.id,
      insightId: 'foreign-owner-insight',
      value: 'saved'
    })).rejects.toThrow(/insight|cycle|Companion/i);

    const feedback = await services.autonomy.submitFeedback({
      cycleId: result.cycle.id,
      insightId,
      value: 'saved',
      note: 'owner-only feedback'
    });

    expect(feedback.companionId).toBe(owner.id);
    expect(services.db.getRelationship('local', owner.id)).toEqual(expect.objectContaining({
      companionId: owner.id,
      recentPositiveInteractions: ownerRelationshipBefore.recentPositiveInteractions + 1
    }));
    expect(services.db.getRelationship('local', newlyActive.id)).toEqual(newlyActiveRelationshipBefore);
    expect(services.db.listMemoryNodes(owner.id)).toHaveLength(ownerMemoriesBefore + 1);
    expect(services.db.listMemoryNodes(newlyActive.id)).toEqual([]);
    expect(services.db.getCharacterState(newlyActive.id)).toEqual(newlyActiveStateBefore);

    const ownerDiary = await services.diary.getEntries({ characterId: owner.id });
    expect(ownerDiary[0]).toEqual(expect.objectContaining({
      characterId: owner.id,
      title: expect.stringContaining(owner.name)
    }));
    expect(ownerDiary[0]?.title).not.toContain(newlyActive.name);
    const reflectionEvent = services.db.listExplorationEventsForCycle(result.cycle.id)
      .find((event) => event.state === 'reflecting');
    expect(reflectionEvent).toEqual(expect.objectContaining({
      companionId: owner.id,
      message: expect.stringContaining(owner.name)
    }));
    expect(reflectionEvent?.message).not.toContain(newlyActive.name);
  });
});
