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

  it('backfills default managed platform sources, updates them in place, and preserves blocked state', async () => {
    const services = createServices();
    const companion = addCompanion(services, 'Seed', 'Calm product design research');

    const first = (await services.discovery.listBases()).filter((base) => base.origin === 'personality');
    expect(first.length).toBeGreaterThanOrEqual(5);
    expect(first.filter((base) => base.data.managedBy === 'personality_seed')).toHaveLength(1);
    expect(first.filter((base) => base.data.managedBy === 'personality_platform_seed')).toHaveLength(4);
    expect(first.map((base) => base.data.platformId).sort()).toEqual([
      'bilibili',
      'generic-web',
      'github',
      'reddit',
      'youtube',
    ]);
    const reddit = first.find((base) => base.data.platformId === 'reddit')!;
    const seedId = reddit.id;
    await services.discovery.updateBaseState({ baseId: seedId, state: 'blocked' });

    services.db.updateCompanion(companion.id, {
      personalityDescription: 'Calm accessibility and interaction research',
    });
    const updated = (await services.discovery.listBases()).filter((base) => base.origin === 'personality');
    expect(updated.filter((base) => base.data.platformId === 'reddit')).toHaveLength(1);
    expect(updated.find((base) => base.data.platformId === 'reddit')).toMatchObject({
      id: seedId,
      state: 'blocked',
    });
    expect(updated.find((base) => base.data.platformId === 'reddit')?.locator).toContain('accessibility');
  });

  it('updates the personality seed revision when only text beyond the query limit changes', async () => {
    const services = createServices();
    const sharedPrefix = 'Calm local-first AI research and thoughtful desktop companions ';
    const companion = addCompanion(services, 'Long Seed', `${sharedPrefix}${'x'.repeat(200)} first ending`);
    const first = (await services.discovery.listBases()).find((base) => base.data.managedBy === 'personality_seed');
    expect(first).toBeDefined();

    services.db.updateCompanion(companion.id, {
      personalityDescription: `${sharedPrefix}${'x'.repeat(200)} second ending`,
    });
    const updated = (await services.discovery.listBases()).find((base) => base.data.managedBy === 'personality_seed');

    expect(updated?.id).toBe(first!.id);
    expect(updated?.data.personalityRevision).not.toBe(first?.data.personalityRevision);
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

  it('deletes a Base without deleting its previously generated Discovery, Candidate, or Evidence history', async () => {
    const clock = new DebugRuntimeClock(() => Date.parse('2026-07-18T00:00:00.000Z'));
    const services = createServices({
      clock,
      webSearchProvider: createDeterministicFixtureSearchProvider(),
      webPageFetcher: new FixtureWebPageFetcher(() => clock.now()),
      discoveryConnectors: [],
    });
    const companion = addCompanion(services, 'History', 'Local-first desktop companion research');
    const source = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'local-first desktop companion history',
      initialState: 'active',
    });

    const cycle = await services.discovery.runBaseNow(source.id);
    const discoveryIds = (await services.discovery.getFeed({ limit: 50 })).map((item) => item.id);
    const candidateIds = cycle.discoveryCandidates.map((item) => item.id);
    const evidenceIds = (cycle.webPageEvidence ?? []).map((item) => item.id);
    expect(discoveryIds.length).toBeGreaterThan(0);
    expect(candidateIds.length).toBeGreaterThan(0);
    expect(evidenceIds.length).toBeGreaterThan(0);

    await expect(services.discovery.deleteBase(source.id)).resolves.toEqual({ deleted: true });
    expect((await services.discovery.listBases()).some((base) => base.id === source.id)).toBe(false);
    expect((await services.discovery.getFeed({ limit: 50 })).map((item) => item.id))
      .toEqual(expect.arrayContaining(discoveryIds));
    for (const candidateId of candidateIds) {
      expect(services.db.getDiscoveryCandidate(candidateId)?.companionId).toBe(companion.id);
    }
    for (const evidenceId of evidenceIds) {
      expect(services.db.getWebPageEvidence(evidenceId, companion.id)?.id).toBe(evidenceId);
    }
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
    fetchPage.mockResolvedValueOnce({
      sourceType: 'open_web',
      contentType: 'text/html',
      feedItems: undefined,
    });
    await expect(services.discovery.addBase({
      sourceType: 'feed',
      locator: 'https://example.com/not-a-feed',
    })).rejects.toThrow('DISCOVERY_SOURCE_FEED_FORMAT_INVALID');
    fetchPage.mockResolvedValueOnce({
      sourceType: 'rss',
      contentType: 'application/rss+xml',
      feedItems: [{
        externalId: 'fixture-entry',
        canonicalUrl: 'https://example.com/entry',
        title: 'Fixture entry',
        summary: 'Fixture feed entry.',
        contentHash: 'fixture-content-hash',
      }],
    });
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

  it('suppresses deleted managed platforms and restores them once', async () => {
    const services = createServices();
    addCompanion(services, 'Suppress', 'Local-first AI character interaction research');
    const bases = await services.discovery.listBases();
    const youtube = bases.find((base) => base.data.platformId === 'youtube');
    expect(youtube).toBeDefined();

    await services.discovery.deleteBase(youtube!.id);
    expect((await services.discovery.listBases()).some((base) => base.data.platformId === 'youtube')).toBe(false);
    expect(await services.discovery.listSuppressedPlatforms()).toEqual([
      expect.objectContaining({ platformId: 'youtube', state: 'suppressed' }),
    ]);

    // Edit-style reconciliation must not restore suppressed platforms.
    await services.discovery.listBases();
    expect((await services.discovery.listBases()).some((base) => base.data.platformId === 'youtube')).toBe(false);

    const restored = await services.discovery.restoreManagedPlatform('youtube');
    expect(restored.data.platformId).toBe('youtube');
    expect((await services.discovery.listBases()).filter((base) => base.data.platformId === 'youtube')).toHaveLength(1);

    const userSource = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'user created research topic',
    });
    await services.discovery.deleteBase(userSource.id);
    expect(await services.discovery.listSuppressedPlatforms()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ platformId: 'reddit' })]),
    );
  });

  it('preserves muted blocked trial active and expired platform states across reconciliation', async () => {
    const services = createServices();
    addCompanion(services, 'States', 'Thoughtful desktop companion research topics');
    const bases = await services.discovery.listBases();
    const byPlatform = Object.fromEntries(
      bases
        .filter((base) => typeof base.data.platformId === 'string')
        .map((base) => [String(base.data.platformId), base]),
    );

    await services.discovery.updateBaseState({ baseId: byPlatform.reddit.id, state: 'muted' });
    await services.discovery.updateBaseState({ baseId: byPlatform.youtube.id, state: 'blocked' });
    await services.discovery.updateBaseState({ baseId: byPlatform.github.id, state: 'active' });
    await services.discovery.updateBaseState({ baseId: byPlatform.bilibili.id, state: 'expired' });

    const refreshed = await services.discovery.listBases();
    expect(refreshed.find((base) => base.data.platformId === 'reddit')).toMatchObject({
      id: byPlatform.reddit.id,
      state: 'muted',
    });
    expect(refreshed.find((base) => base.data.platformId === 'youtube')).toMatchObject({
      id: byPlatform.youtube.id,
      state: 'blocked',
    });
    expect(refreshed.find((base) => base.data.platformId === 'github')).toMatchObject({
      id: byPlatform.github.id,
      state: 'active',
    });
    expect(refreshed.find((base) => base.data.platformId === 'bilibili')).toMatchObject({
      id: byPlatform.bilibili.id,
      state: 'expired',
    });
    expect(refreshed.filter((base) => base.data.platformId === 'reddit')).toHaveLength(1);
  });

  it('does not backfill platforms when auto-manage is disabled', async () => {
    const services = createServices();
    await services.discovery.setAutoManageDefaultPlatforms(false);
    addCompanion(services, 'Manual', 'Curious open web research companion');
    const bases = await services.discovery.listBases();
    expect(bases.filter((base) => base.data.managedBy === 'personality_seed')).toHaveLength(1);
    expect(bases.filter((base) => base.data.managedBy === 'personality_platform_seed')).toHaveLength(0);
  });

  it('records provider unavailable bootstrap status without inventing results', async () => {
    const services = createServices({
      webSearchProvider: { id: 'unavailable-search', mode: 'unavailable', search: async () => [] },
    });
    const personality = openPersonality;
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, {
        personality: typeof personality;
        description: string;
        expiresAt: number;
        used: boolean;
      }>;
    }).personalityAnalyses;
    analyses.set('bootstrap-unavailable', {
      personality,
      description: 'Local-first AI research companion for careful discovery',
      expiresAt: Date.now() + 60_000,
      used: false,
    });

    // Creation path requires assets; use listBases backfill + explicit bootstrap helper instead.
    const companion = addCompanion(services, 'Bootstrap', 'Local-first AI research companion for careful discovery');
    const seeded = (await services.discovery.listBases()).filter((base) => base.origin === 'personality');
    expect(seeded.length).toBeGreaterThanOrEqual(5);

    const bootstrap = await (services as unknown as {
      runInitialDiscoveryBootstrap(
        companion: { id: string },
        sourceIds: string[],
      ): Promise<{ status: string; executedSourceIds: string[]; reason?: string }>;
    }).runInitialDiscoveryBootstrap(companion, seeded.map((base) => base.id));

    expect(bootstrap).toMatchObject({
      attempted: true,
      status: 'provider_unavailable',
      executedSourceIds: [],
    });
    expect(bootstrap.reason).toMatch(/not configured/i);
    const status = await services.discovery.getBootstrapStatus();
    expect(status?.status).toBe('provider_unavailable');
    for (const base of await services.discovery.listBases()) {
      expect(base.lastCheckedAt).toBeUndefined();
    }
  });

  it('clears platform suppression when a Companion is deleted', async () => {
    const services = createServices();
    const first = addCompanion(services, 'Keep', 'Keep companion research interests');
    const second = addCompanion(services, 'Remove', 'Remove companion research interests', false);
    services.db.setPrimaryCompanion(second.id);
    await services.discovery.listBases();
    const youtube = (await services.discovery.listBases()).find((base) => base.data.platformId === 'youtube');
    await services.discovery.deleteBase(youtube!.id);
    expect(await services.discovery.listSuppressedPlatforms()).toHaveLength(1);

    services.db.setPrimaryCompanion(first.id);
    await services.companionNew.delete(second.id);
    services.db.setPrimaryCompanion(first.id);
    expect(
      (services as unknown as {
        listPlatformPreferences(companionId: string): unknown[];
      }).listPlatformPreferences(second.id),
    ).toEqual([]);
  });
});
