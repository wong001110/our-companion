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

  it('creates a Discovery Profile and default Channels without permanent site queries', async () => {
    const services = createServices();
    addCompanion(services, 'Seed', 'Calm product design research');

    const bases = await services.discovery.listBases();
    expect(bases.some((base) => String(base.locator).includes('site:reddit.com'))).toBe(false);
    expect(bases.some((base) => base.data.managedBy === 'personality_platform_seed' && !base.data.curatedFeedId)).toBe(false);
    expect(bases.some((base) => base.data.managedBy === 'personality_seed')).toBe(false);

    const channels = await services.discovery.listChannels();
    expect(channels.map((channel) => channel.platformId).sort()).toEqual([
      'bilibili',
      'generic-web',
      'github',
      'reddit',
      'youtube',
    ]);
    expect(channels.every((channel) => channel.state === 'enabled')).toBe(true);

    const profile = await services.discovery.getDiscoveryProfile();
    expect(profile?.interests.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(profile)).not.toContain('site:');

    await services.discovery.updateChannelState({ platformId: 'reddit', state: 'blocked' });
    services.db.updateCompanion(services.db.getPrimaryCompanion()!.id, {
      personalityDescription: 'Calm accessibility and interaction research',
    });
    await services.discovery.listChannels();
    const afterEdit = await services.discovery.listChannels();
    expect(afterEdit.find((channel) => channel.platformId === 'reddit')?.state).toBe('blocked');
    const updatedProfile = await services.discovery.getDiscoveryProfile();
    expect(updatedProfile?.interests.some((interest) => interest.includes('accessibility'))).toBe(true);
  });

  it('updates Discovery Profile revision when personality text changes', async () => {
    const services = createServices();
    const sharedPrefix = 'Calm local-first AI research and thoughtful desktop companions ';
    const companion = addCompanion(services, 'Long Seed', `${sharedPrefix}${'x'.repeat(200)} first ending`);
    await services.discovery.listChannels();
    const first = await services.discovery.getDiscoveryProfile();
    expect(first).toBeDefined();

    services.db.updateCompanion(companion.id, {
      personalityDescription: `${sharedPrefix}${'x'.repeat(200)} second ending`,
    });
    (services as unknown as {
      syncPersonalityDiscoverySeed(companion: { id: string; personalityDescription: string; personality: typeof openPersonality; name: string }): void;
    }).syncPersonalityDiscoverySeed(services.db.getCompanion(companion.id)!);
    const updated = await services.discovery.getDiscoveryProfile();
    expect(updated?.personalityRevision).not.toBe(first?.personalityRevision);
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

  it('suppresses and restores Discovery Channels without creating query Bases', async () => {
    const services = createServices();
    addCompanion(services, 'Suppress', 'Local-first AI character interaction research');
    await services.discovery.listChannels();

    await services.discovery.updateChannelState({ platformId: 'youtube', state: 'suppressed' });
    expect(await services.discovery.listSuppressedPlatforms()).toEqual([
      expect.objectContaining({ platformId: 'youtube', state: 'suppressed' }),
    ]);
    expect((await services.discovery.listChannels()).some((channel) => channel.platformId === 'youtube' && channel.state === 'enabled')).toBe(false);

    await services.discovery.listChannels();
    expect((await services.discovery.listChannels()).find((channel) => channel.platformId === 'youtube')?.state).toBe('suppressed');

    const restored = await services.discovery.restoreManagedPlatform('youtube');
    expect(restored).toMatchObject({ platformId: 'youtube', state: 'enabled' });
    expect((await services.discovery.listBases()).some((base) => String(base.locator).includes('site:youtube.com'))).toBe(false);

    const userSource = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'user created research topic',
    });
    await services.discovery.deleteBase(userSource.id);
    expect(await services.discovery.listSuppressedPlatforms()).toEqual([]);
  });

  it('preserves muted and blocked Channel states across reconciliation', async () => {
    const services = createServices();
    addCompanion(services, 'States', 'Thoughtful desktop companion research topics');
    await services.discovery.listChannels();
    await services.discovery.updateChannelState({ platformId: 'reddit', state: 'muted' });
    await services.discovery.updateChannelState({ platformId: 'youtube', state: 'blocked' });
    await services.discovery.updateChannelState({ platformId: 'github', state: 'enabled' });

    const refreshed = await services.discovery.listChannels();
    expect(refreshed.find((channel) => channel.platformId === 'reddit')?.state).toBe('muted');
    expect(refreshed.find((channel) => channel.platformId === 'youtube')?.state).toBe('blocked');
    expect(refreshed.find((channel) => channel.platformId === 'github')?.state).toBe('enabled');
  });

  it('does not backfill platform Channels when auto-manage is disabled', async () => {
    const services = createServices();
    await services.discovery.setAutoManageDefaultPlatforms(false);
    addCompanion(services, 'Manual', 'Curious open web research companion');
    const channels = await services.discovery.listChannels();
    expect(channels.some((channel) => channel.platformId === 'generic-web')).toBe(true);
    expect(channels.some((channel) => channel.platformId === 'reddit')).toBe(false);
    expect((await services.discovery.listBases()).filter((base) => base.data.managedBy === 'personality_platform_seed')).toHaveLength(0);
  });

  it('records provider unavailable bootstrap status without inventing results', async () => {
    const services = createServices({
      webSearchProvider: { id: 'unavailable-search', mode: 'unavailable', search: async () => [] },
    });
    const companion = addCompanion(services, 'Bootstrap', 'Local-first AI research companion for careful discovery');
    await services.discovery.listChannels();

    const bootstrap = await (services as unknown as {
      runInitialDiscoveryBootstrap(companion: { id: string }): Promise<{ status: string; executedSourceIds: string[]; reason?: string }>;
    }).runInitialDiscoveryBootstrap(companion);

    expect(bootstrap).toMatchObject({
      attempted: true,
      status: 'provider_unavailable',
      executedSourceIds: [],
    });
    expect(bootstrap.reason).toMatch(/not configured/i);
    const status = await services.discovery.getBootstrapStatus();
    expect(status?.status).toBe('provider_unavailable');
  });

  it('migrates v1 managed platform query Bases into Channels and removes them', async () => {
    const services = createServices();
    const companion = addCompanion(services, 'Migrate', 'Local-first AI migration companion');
    const now = new Date().toISOString();
    for (const platformId of ['reddit', 'youtube', 'github', 'bilibili'] as const) {
      services.db.upsertDiscoveryBase({
        id: `legacy_${platformId}`,
        companionId: companion.id,
        connectorId: 'generic-web',
        scope: 'query',
        locator: `site:${platformId}.com legacy topics`,
        data: {
          managedBy: 'personality_platform_seed',
          platformId,
          bootstrapVersion: 1,
        },
        origin: 'personality',
        state: platformId === 'reddit' ? 'muted' : platformId === 'youtube' ? 'blocked' : 'trial',
        discoveredAt: now,
        updatedAt: now,
        trialStartedAt: now,
        trialExpiresAt: now,
      });
    }
    services.db.upsertDiscoveryBase({
      id: 'legacy_generic',
      companionId: companion.id,
      connectorId: 'generic-web',
      scope: 'query',
      locator: 'legacy personality query',
      data: { managedBy: 'personality_seed', bootstrapVersion: 1 },
      origin: 'personality',
      state: 'trial',
      discoveredAt: now,
      updatedAt: now,
      trialStartedAt: now,
      trialExpiresAt: now,
    });
    const user = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'keep this user query',
    });

    await services.discovery.listChannels();
    const bases = await services.discovery.listBases();
    expect(bases.some((base) => base.id.startsWith('legacy_'))).toBe(false);
    expect(bases.some((base) => base.id === user.id)).toBe(true);
    const channels = await services.discovery.listChannels();
    expect(channels.find((channel) => channel.platformId === 'reddit')?.state).toBe('muted');
    expect(channels.find((channel) => channel.platformId === 'youtube')?.state).toBe('blocked');
    expect(channels.find((channel) => channel.platformId === 'github')?.state).toBe('enabled');

    await services.discovery.listChannels();
    expect((await services.discovery.listChannels()).find((channel) => channel.platformId === 'reddit')?.state).toBe('muted');
  });

  it('clears Discovery Channel preferences when a Companion is deleted', async () => {
    const services = createServices();
    const first = addCompanion(services, 'Keep', 'Keep companion research interests');
    const second = addCompanion(services, 'Remove', 'Remove companion research interests', false);
    services.db.setPrimaryCompanion(second.id);
    await services.discovery.listChannels();
    await services.discovery.updateChannelState({ platformId: 'youtube', state: 'suppressed' });
    expect(await services.discovery.listSuppressedPlatforms()).toHaveLength(1);

    services.db.setPrimaryCompanion(first.id);
    await services.companionNew.delete(second.id);
    expect(
      (services as unknown as {
        listDiscoveryChannels(companionId: string): unknown[];
      }).listDiscoveryChannels(second.id),
    ).toEqual([]);
  });
});
