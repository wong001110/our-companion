import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisitService } from './visitService';

const invitation = {
  id: 'invitation-1',
  visitorOwnerUserId: 'owner',
  hostUserId: 'host',
  networkCompanionId: 'network-companion',
  assetPackId: 'asset-pack',
  companionName: 'Ann',
  companionTags: [],
  status: 'pending',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const session = {
  id: 'session-1',
  invitationId: invitation.id,
  visitorOwnerUserId: 'owner',
  hostUserId: 'host',
  networkCompanionId: 'network-companion',
  assetPackId: 'asset-pack',
  state: 'preparing',
  visitorOwnerReady: false,
  hostReady: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const activeSession = { ...session, state: 'active', visitorOwnerReady: true, hostReady: true };

function networkMock(overrides: Record<string, unknown> = {}) {
  return {
    getStatus: vi.fn().mockResolvedValue({ onlineModeEnabled: true, state: 'online', account: { id: 'owner' } }),
    getStatusSnapshot: vi.fn().mockReturnValue({ visit: { heartbeatIntervalSeconds: 60 } }),
    getVisitReservation: vi.fn().mockResolvedValue({ locked: false }),
    listVisitSessions: vi.fn().mockResolvedValue([]),
    createVisitInvitation: vi.fn().mockResolvedValue(invitation),
    getVisitSession: vi.fn().mockResolvedValue(session),
    startVisitSession: vi.fn().mockResolvedValue(activeSession),
    getVisitSocialState: vi.fn().mockResolvedValue({
      sessionId: session.id,
      maxTurns: 12,
      nextActorUserId: 'owner',
      share: { id: 'share-1', kind: 'discovery', title: 'Quiet work music', summary: 'A calm set for focused work.', tags: ['music'], createdAt: new Date().toISOString() },
      turns: [],
    }),
    setVisitSocialShare: vi.fn().mockResolvedValue(undefined),
    markVisitReady: vi.fn().mockResolvedValue({ ...session, state: 'ready', visitorOwnerReady: true }),
    appendVisitSocialTurn: vi.fn().mockResolvedValue(undefined),
    heartbeatVisitSession: vi.fn().mockResolvedValue(activeSession),
    finalizeVisitSharedMoment: vi.fn().mockResolvedValue({ id: 'moment-1', sessionId: session.id, title: 'Shared', summary: 'Shared safely.', turnCount: 2, createdAt: new Date().toISOString() }),
    ...overrides,
  };
}

function companionsMock() {
  return {
    hasNetworkCompanionMapping: vi.fn().mockResolvedValue(true),
    downloadVisitPack: vi.fn().mockResolvedValue(undefined),
    cancelVisitDownload: vi.fn().mockResolvedValue(undefined),
  };
}

describe('VisitService social MVP', () => {
  it('keeps a rolling Network deployment fallback for legacy turn responses', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'visitService.ts'), 'utf8');
    expect(source).toContain('isSocialVisitState(appended)');
    expect(source).toContain('getVisitSocialState(sessionId)');
  });

  const services: VisitService[] = [];
  afterEach(() => services.splice(0).forEach((service) => service.stopAll()));

  it('stores only the user-approved Discovery copy before creating a Session', async () => {
    const network = networkMock();
    const db = {
      getDiscovery: vi.fn().mockReturnValue({
        id: 'discovery-1', title: 'Quiet work music', summary: undefined,
        whyThisMatters: 'A calm set for focused work.', tags: ['music', 'focus', 'music'], url: 'https://example.com/discovery',
        privatePrompt: 'must not leave device',
      }),
      setAppSetting: vi.fn(),
    };
    const service = new VisitService(network as never, companionsMock() as never, db as never);
    services.push(service);

    await service.sendDiscoveryInvitation({ hostUserId: 'host', discoveryId: 'discovery-1' });

    expect(network.createVisitInvitation).toHaveBeenCalledWith('host');
    const stored = db.setAppSetting.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(stored).toMatchObject({ title: 'Quiet work music', summary: 'A calm set for focused work.', tags: ['music', 'focus'] });
    expect(stored).not.toHaveProperty('privatePrompt');
  });

  it('attaches the approved share before the visiting Companion becomes Ready', async () => {
    const network = networkMock({ getVisitSocialState: vi.fn().mockResolvedValue({ sessionId: session.id, maxTurns: 12, turns: [] }) });
    const db = {
      getAppSetting: vi.fn().mockReturnValue({
        invitationId: invitation.id,
        discoveryId: 'discovery-1',
        title: 'Quiet work music',
        summary: 'A calm set for focused work.',
        tags: ['music'],
        approvedAt: new Date().toISOString(),
      }),
    };
    const service = new VisitService(network as never, companionsMock() as never, db as never);
    services.push(service);

    await service.prepare(session.id);

    expect(network.setVisitSocialShare.mock.invocationCallOrder[0]).toBeLessThan(network.markVisitReady.mock.invocationCallOrder[0]);
    expect(network.setVisitSocialShare).toHaveBeenCalledWith(session.id, expect.objectContaining({ title: 'Quiet work music' }));
  });

  it('omits a legacy non-web source URL instead of failing share validation', async () => {
    const network = networkMock({ getVisitSocialState: vi.fn().mockResolvedValue({ sessionId: session.id, maxTurns: 12, turns: [] }) });
    const db = {
      getAppSetting: vi.fn().mockReturnValue({
        invitationId: invitation.id,
        discoveryId: 'discovery-1',
        title: '  Quiet work music  ',
        summary: '  A calm set for focused work. ',
        tags: ['music', ' music ', 'focus'],
        sourceUrl: 'file:///Users/example/private-note.txt',
        approvedAt: new Date().toISOString(),
      }),
    };
    const service = new VisitService(network as never, companionsMock() as never, db as never);
    services.push(service);

    await service.prepare(session.id);

    expect(network.setVisitSocialShare).toHaveBeenCalledWith(session.id, {
      title: 'Quiet work music',
      summary: 'A calm set for focused work.',
      tags: ['music', 'focus'],
    });
  });

  it('preserves legacy visual Visit startup without a social share', async () => {
    const network = networkMock({
      getVisitSocialState: vi.fn().mockRejectedValue(new Error('VISIT_SHARE_REQUIRED')),
    });
    const service = new VisitService(network as never, companionsMock() as never);
    services.push(service);

    await expect(service.start(session.id)).resolves.toEqual(activeSession);
    expect(network.getVisitSocialState).not.toHaveBeenCalled();
    expect(network.startVisitSession).toHaveBeenCalledWith(session.id);
  });

  it('generates only the local participant turn from the approved share and bounded transcript', async () => {
    const network = networkMock({ getVisitSession: vi.fn().mockResolvedValue(activeSession) });
    const db = {
      getPrimaryCompanion: vi.fn().mockReturnValue({ name: 'Ann', personalityDescription: 'quiet and curious' }),
      getAppSetting: vi.fn(),
    };
    const generate = vi.fn().mockResolvedValue('{"intent":"SHARE","message":"This felt relevant to quiet work. What do you notice?","emotion":"curious","topic":"music"}');
    const service = new VisitService(network as never, companionsMock() as never, db as never, generate);
    services.push(service);

    await service.respondSocial(session.id);

    expect(generate).toHaveBeenCalledOnce();
    const prompt = generate.mock.calls[0]?.[0] as Array<{ content: string }>;
    expect(prompt[1]?.content).toContain('Quiet work music');
    expect(prompt[1]?.content).not.toContain('privatePrompt');
    expect(network.appendVisitSocialTurn).toHaveBeenCalledWith(session.id, expect.objectContaining({
      intent: 'SHARE',
      message: 'This felt relevant to quiet work. What do you notice?',
    }));
  });

  it('uses a deterministic safe fallback when the AI provider is unavailable', async () => {
    const network = networkMock({ getVisitSession: vi.fn().mockResolvedValue(activeSession) });
    const db = { getPrimaryCompanion: vi.fn(), getAppSetting: vi.fn() };
    const service = new VisitService(network as never, companionsMock() as never, db as never, vi.fn().mockRejectedValue(new Error('provider unavailable')));
    services.push(service);

    await service.respondSocial(session.id);

    expect(network.appendVisitSocialTurn).toHaveBeenCalledWith(session.id, expect.objectContaining({ intent: 'SHARE' }));
  });
  it('creates Shared Moment discoveries as announced before adding them to Journey', async () => {
    const now = new Date().toISOString();
    const topic = { id: 'topic-1', sessionId: session.id, sequence: 1, state: 'completed', ownerCompanionId: 'network-companion', title: 'A gentle topic', summary: 'A shared summary.', tags: ['care'], allowRecipientSave: true, minimumTurns: 3, maximumTurns: 6, createdAt: now, updatedAt: now };
    const sharedMoment = { id: 'moment-1', sessionId: session.id, title: 'Shared care', summary: 'A meaningful exchange.', turnCount: 4, createdAt: now };
    const network = networkMock({ getVisitSocialState: vi.fn().mockResolvedValue({ sessionId: session.id, maxTurns: 15, topics: [topic], participants: [], turns: [], sharedMoment }) });
    const settings = new Map<string, unknown>();
    let storedDiscovery: Record<string, unknown> | undefined;
    const db = {
      getAppSetting: vi.fn((key: string) => settings.get(key)),
      setAppSetting: vi.fn((key: string, value: unknown) => { settings.set(key, value); }),
      insertDiscovery: vi.fn((discovery: Record<string, unknown>) => { storedDiscovery = discovery; return discovery; }),
      getDiscovery: vi.fn((id: string) => storedDiscovery?.id === id ? storedDiscovery : undefined),
      resolveActiveCompanionId: vi.fn().mockReturnValue('companion-1'),
      transitionDiscoveryStatus: vi.fn((id: string, status: string) => {
        if (!storedDiscovery || storedDiscovery.id !== id) throw new Error('missing discovery');
        storedDiscovery = { ...storedDiscovery, status };
        return storedDiscovery;
      }),
    };
    const addToJourney = vi.fn(async () => { storedDiscovery = { ...storedDiscovery, status: 'saved' }; });
    const service = new VisitService(network as never, companionsMock() as never, db as never, undefined, addToJourney);
    services.push(service);

    const result = await service.saveSharedMoment(session.id);

    expect(db.insertDiscovery).toHaveBeenCalledWith(expect.objectContaining({ source: 'companion', status: 'announced' }));
    expect(addToJourney).toHaveBeenCalledWith(expect.stringMatching(/^shared-moment-/));
    expect(result.sharedMomentSaved).toBe(true);
  });

  it('recovers the eligible Shared Moment record left by the previous failed save', async () => {
    const now = new Date().toISOString();
    const topic = { id: 'topic-1', sessionId: session.id, sequence: 1, state: 'completed', ownerCompanionId: 'network-companion', title: 'A gentle topic', summary: 'A shared summary.', tags: ['care'], allowRecipientSave: true, minimumTurns: 3, maximumTurns: 6, createdAt: now, updatedAt: now };
    const sharedMoment = { id: 'moment-1', sessionId: session.id, title: 'Shared care', summary: 'A meaningful exchange.', turnCount: 4, createdAt: now };
    const network = networkMock({ getVisitSocialState: vi.fn().mockResolvedValue({ sessionId: session.id, maxTurns: 15, topics: [topic], participants: [], turns: [], sharedMoment }) });
    let storedDiscovery: Record<string, unknown> = { id: 'shared-moment-existing', status: 'eligible' };
    const db = {
      getAppSetting: vi.fn((key: string) => key.includes('social.visit.saved-moment.') ? 'shared-moment-existing' : undefined),
      setAppSetting: vi.fn(),
      insertDiscovery: vi.fn(),
      getDiscovery: vi.fn(() => storedDiscovery),
      resolveActiveCompanionId: vi.fn().mockReturnValue('companion-1'),
      transitionDiscoveryStatus: vi.fn((id: string, status: string) => {
        storedDiscovery = { ...storedDiscovery, id, status };
        return storedDiscovery;
      }),
    };
    const addToJourney = vi.fn(async () => { storedDiscovery = { ...storedDiscovery, status: 'saved' }; });
    const service = new VisitService(network as never, companionsMock() as never, db as never, undefined, addToJourney);
    services.push(service);

    const result = await service.saveSharedMoment(session.id);

    expect(db.transitionDiscoveryStatus.mock.calls.map((call) => call[1])).toEqual(['queued', 'presenting', 'announced']);
    expect(addToJourney).toHaveBeenCalledWith('shared-moment-existing');
    expect(result.sharedMomentSaved).toBe(true);
  });

});
