import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CompanionPersonality,
  Discovery,
  NormalizedDiscovery
} from '@our-companion/shared';
import type { DiscoveryConnector, RawDiscoveryItem } from '@our-companion/discovery-engine';
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

afterEach(() => {
  for (const services of openServices.splice(0)) services.db.close();
});

describe('production memory companion isolation', () => {
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
    resolveFetch([{}]);
    const result = await pendingRefresh;

    expect(result).toEqual({ discoveries: [], newlyInserted: [] });
    expect(services.db.listDiscoveries({ companionId: second.id, limit: 100 })).toEqual([]);
    expect(services.db.listDiscoveries({ companionId: first.id, limit: 100 }))
      .toEqual([expect.objectContaining({
        companionId: first.id,
        title: 'Refresh owned by the original Companion'
      })]);
  });
});
