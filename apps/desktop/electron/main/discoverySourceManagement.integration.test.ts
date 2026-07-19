import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebugRuntimeClock } from '@our-companion/shared';
import {
  createDeterministicFixtureSearchProvider,
  FixtureWebPageFetcher,
} from './researchAdapters';
import { AppServices, type AppRuntimeDependencies } from './services';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => ':memory:'),
    isPackaged: false,
  },
}));

const openPersonality = {
  energy: 50,
  curiosity: 70,
  sociability: 50,
  diligence: 60,
  playfulness: 55,
  confidence: 50,
  calmness: 60,
  shyness: 40,
};

function addCompanion(services: AppServices, name: string, description: string, primary = true) {
  const companion = services.db.createCompanion({
    name,
    personalityDescription: description,
    personalityAnalysisId: 'fixture',
    personality: openPersonality,
    assetRoot: `companion://${name}/assets`,
  });
  return primary ? services.db.setPrimaryCompanion(companion.id) : companion;
}

describe('Discovery Source management', () => {
  const servicesToClose: AppServices[] = [];

  afterEach(() => {
    for (const services of servicesToClose.splice(0)) services.db.close();
  });

  function createServices(runtimeDependencies: AppRuntimeDependencies = {}) {
    const services = new AppServices(':memory:', undefined, runtimeDependencies);
    servicesToClose.push(services);
    return services;
  }

  it('adds normalized query, domain, and page sources and keeps duplicate state intact', async () => {
    const services = createServices();
    addCompanion(services, 'Ann', 'Curious about thoughtful local-first software');

    const query = await services.discovery.addBase({
      sourceType: 'query',
      locator: '  local-first   AI applications ',
    });
    expect(query).toMatchObject({
      connectorId: 'generic-web',
      scope: 'query',
      locator: 'local-first AI applications',
      origin: 'user',
      state: 'trial',
    });

    const blocked = await services.discovery.updateBaseState({ baseId: query.id, state: 'blocked' });
    expect(blocked.state).toBe('blocked');
    const duplicate = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'local-first AI applications',
      initialState: 'active',
      label: 'Must not overwrite',
    });
    expect(duplicate.state).toBe('blocked');
    expect(duplicate.data).not.toHaveProperty('label');

    await expect(services.discovery.addBase({
      sourceType: 'domain',
      locator: 'HTTPS://GitHub.BLOG/releases?from=test',
    })).resolves.toMatchObject({ scope: 'domain', locator: 'github.blog' });
    await expect(services.discovery.addBase({
      sourceType: 'page',
      locator: 'https://example.com/changelog?utm_source=test#latest',
    })).resolves.toMatchObject({ scope: 'page', locator: 'https://example.com/changelog' });
    await expect(services.discovery.addBase({
      sourceType: 'page',
      locator: 'http://192.168.1.4/private',
    })).rejects.toThrow('DISCOVERY_SOURCE_URL_NOT_PUBLIC');
  });

  it('enforces active Companion ownership for state changes and deletion', async () => {
    const services = createServices();
    const first = addCompanion(services, 'First', 'First source personality');
    const source = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'first companion source',
    });
    const second = addCompanion(services, 'Second', 'Second source personality', false);
    services.db.setPrimaryCompanion(second.id);

    await expect(services.discovery.updateBaseState({ baseId: source.id, state: 'active' }))
      .rejects.toThrow('DISCOVERY_SOURCE_NOT_FOUND');
    await expect(services.discovery.deleteBase(source.id))
      .rejects.toThrow('DISCOVERY_SOURCE_NOT_FOUND');
    expect(services.db.getDiscoveryBase(source.id, first.id)).toBeDefined();
  });

  it('backfills one stable personality seed, updates it in place, and preserves blocked state', async () => {
    const services = createServices();
    const companion = addCompanion(services, 'Seed', 'Calm product design research');

    const first = (await services.discovery.listBases()).filter((base) => base.origin === 'personality');
    expect(first).toHaveLength(1);
    expect(first[0]?.data).toMatchObject({ managedBy: 'personality_seed' });
    const seedId = first[0]!.id;
    await services.discovery.updateBaseState({ baseId: seedId, state: 'blocked' });

    services.db.updateCompanion(companion.id, {
      personalityDescription: 'Calm accessibility and interaction research',
    });
    const updated = (await services.discovery.listBases()).filter((base) => base.origin === 'personality');
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: seedId,
      state: 'blocked',
    });
    expect(updated[0]?.locator).toContain('accessibility');
  });

  it('deletes only the active Companion source', async () => {
    const services = createServices();
    addCompanion(services, 'Delete', 'Deletion-safe research');
    const source = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'temporary discovery source',
    });
    await expect(services.discovery.deleteBase(source.id)).resolves.toEqual({ deleted: true });
    expect((await services.discovery.listBases()).some((base) => base.id === source.id)).toBe(false);
  });

  it('expires elapsed trials when Sources is opened', async () => {
    let currentTime = Date.parse('2026-07-01T00:00:00.000Z');
    const clock = new DebugRuntimeClock(() => currentTime);
    const services = createServices({ clock });
    addCompanion(services, 'Expiry', 'Time-aware discovery research');
    const source = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'time-sensitive research',
    });
    currentTime = Date.parse(source.trialExpiresAt!) + 1;

    const refreshed = (await services.discovery.listBases()).find((base) => base.id === source.id);
    expect(refreshed?.state).toBe('expired');
  });

  it('probes feeds safely and rejects content that is not RSS or Atom', async () => {
    const services = createServices();
    addCompanion(services, 'Feeds', 'Careful feed research');
    const fetchPage = vi.spyOn(
      (services as unknown as { manualResearchPageFetcher: { fetchPage: (...args: unknown[]) => Promise<unknown> } })
        .manualResearchPageFetcher,
      'fetchPage',
    );
    fetchPage.mockResolvedValueOnce({ sourceType: 'page' });
    await expect(services.discovery.addBase({
      sourceType: 'feed',
      locator: 'https://example.com/not-a-feed',
    })).rejects.toThrow('DISCOVERY_SOURCE_FEED_FORMAT_INVALID');
    fetchPage.mockResolvedValueOnce({ sourceType: 'rss' });
    await expect(services.discovery.addBase({
      sourceType: 'feed',
      locator: 'https://example.com/feed.xml',
    })).resolves.toMatchObject({
      connectorId: 'rss',
      scope: 'feed',
      locator: 'https://example.com/feed.xml',
    });
  });

  it('runs the selected source now and records its actual execution', async () => {
    const clock = new DebugRuntimeClock(() => Date.parse('2026-07-18T00:00:00.000Z'));
    const services = createServices({
      clock,
      webSearchProvider: createDeterministicFixtureSearchProvider(),
      webPageFetcher: new FixtureWebPageFetcher(() => clock.now()),
      discoveryConnectors: [],
    });
    addCompanion(services, 'RunNow', 'Local-first desktop companion research');
    const selected = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'local-first desktop companion',
      initialState: 'active',
    });
    await services.discovery.addBase({
      sourceType: 'query',
      locator: 'a different scheduled source',
      initialState: 'active',
    });

    const result = await services.discovery.runBaseNow(selected.id);
    const refreshed = (await services.discovery.listBases()).find((base) => base.id === selected.id);
    const inspection = (await services.debug.getEngineSnapshot()).discoveryInspection;

    expect(result.selectedCuriosityTarget?.topic).toContain('local-first desktop companion');
    expect(inspection?.selectedBases[0]?.id).toBe(selected.id);
    expect(inspection?.executedBases.some((base) => base.id === selected.id)).toBe(true);
    expect(refreshed?.lastCheckedAt).toBe('2026-07-18T00:00:00.000Z');
    expect(refreshed?.data.lastResult).not.toBe('not_executed');
  });

  it('does not advance lastChecked when Run Now cannot execute the selected source', async () => {
    const services = createServices({ discoveryConnectors: [] });
    addCompanion(services, 'Unavailable', 'Unavailable provider research');
    const selected = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'provider unavailable topic',
      initialState: 'active',
    });

    await expect(services.discovery.runBaseNow(selected.id))
      .rejects.toThrow('DISCOVERY_SOURCE_NOT_EXECUTED');
    const refreshed = (await services.discovery.listBases()).find((base) => base.id === selected.id);
    expect(refreshed?.lastCheckedAt).toBeUndefined();
    expect(refreshed?.data.lastResult).toBe('not_executed');
  });
});
