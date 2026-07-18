import { describe, expect, it, vi } from 'vitest';
import { VisualVisitService } from './visualVisitService';

const session = (state: 'active' | 'ended' = 'active') => ({
  id: 'session-1', invitationId: 'invitation-1', visitorOwnerUserId: 'owner', hostUserId: 'host', networkCompanionId: 'network-companion-1', assetPackId: 'pack-1', state,
  visitorOwnerReady: true, hostReady: true, createdAt: '2026-07-14T00:00:00.000Z', updatedAt: '2026-07-14T00:00:00.000Z',
});
const manifest = () => ({
  format: 'our-companion-asset-pack' as const, schemaVersion: 1 as const,
  runtime: { defaultAnimation: 'Idle_Neutral' as const, animations: ['Idle_Neutral', 'Enter', 'Leave', 'Walk_Left', 'Walk_Right', 'Walk_Up', 'Walk_Down'].map((name) => ({ name, format: 'sprite_sheet' as const, files: [`assets/animations/${name}.png`], frameWidth: 300, frameHeight: 300, frameCount: 1, frameDurationMs: 180, loop: name === 'Idle_Neutral' })) },
  files: [],
});

function dependencies(accountId: 'owner' | 'host' = 'host') {
  const network = { getStatusSnapshot: vi.fn(() => ({ state: 'online', onlineModeEnabled: true, account: { id: accountId }, features: { visualVisits: true } })) };
  const visits = { listSessions: vi.fn().mockResolvedValue([session()]), listInvitations: vi.fn().mockResolvedValue([{ id: 'invitation-1', companionName: 'Ann' }]) };
  const companions = { getLocalCompanionId: vi.fn().mockResolvedValue('local-ann'), getVerifiedVisitVisualManifest: vi.fn().mockResolvedValue(manifest()), readVerifiedCachedAsset: vi.fn().mockReturnValue({ bytes: Buffer.from('sprite'), mimeType: 'image/png' }) };
  const publish = vi.fn();
  return { network, visits, companions, publish, service: new VisualVisitService(network as never, visits as never, companions as never, publish) };
}

describe('VisualVisitService', () => {
  it('creates one sanitized remote Visitor for an active host session and does not duplicate it', async () => {
    const { service, companions } = dependencies('host');
    await service.reconcile();
    await service.reconcile();
    const state = service.getState();
    expect(state.visitorOrder).toEqual(['session-1']);
    expect(state.visitors['session-1']).toMatchObject({ runtimeId: 'visit:session-1', name: 'Ann', role: 'remote_visitor', assetPackId: 'pack-1' });
    expect(state.visitors['session-1']).not.toHaveProperty('cacheRoot');
    expect(companions.getVerifiedVisitVisualManifest).toHaveBeenCalledTimes(2);
  });

  it('places only the mapped local Companion into away mode for an active owner session', async () => {
    const { service, companions } = dependencies('owner');
    await service.reconcile();
    expect(companions.getLocalCompanionId).toHaveBeenCalledWith('network-companion-1');
    expect(service.getState()).toMatchObject({ ownerPresenceMode: 'away_visiting', visitors: {}, visitorOrder: [], errors: {} });
  });

  it('removes a stale visitor and restores the owner when no active session remains', async () => {
    const { service, visits } = dependencies('host');
    await service.reconcile();
    visits.listSessions.mockResolvedValue([session('ended')]);
    await service.reconcile();
    expect(service.getState()).toMatchObject({ ownerPresenceMode: 'home', visitors: {}, visitorOrder: [], errors: {} });
    expect(service.getState().departingVisitors['session-1']).toMatchObject({ sessionId: 'session-1' });
    expect(service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Leave.png')).toEqual({ bytes: Buffer.from('sprite'), mimeType: 'image/png' });
    expect(() => service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Idle_Neutral.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
    expect(() => service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Walk_Left.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
    service.completeRendererDeparture('session-1');
    expect(() => service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Leave.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
  });

  it('keeps each departure authorized until its own renderer acknowledgement', async () => {
    const { service, visits } = dependencies('host');
    const second = { ...session(), id: 'session-2', invitationId: 'invitation-2', assetPackId: 'pack-2', createdAt: '2026-07-14T00:01:00.000Z' };
    visits.listSessions.mockResolvedValue([session(), second]);
    visits.listInvitations.mockResolvedValue([{ id: 'invitation-1', companionName: 'Ann' }, { id: 'invitation-2', companionName: 'Bea' }]);
    await service.reconcile();

    visits.listSessions.mockResolvedValue([second]);
    await service.reconcile();
    await service.reconcile();
    expect(service.getState().visitors['session-2']).toMatchObject({ sessionId: 'session-2' });
    expect(service.getState().departingVisitors['session-1']).toMatchObject({ sessionId: 'session-1' });
    expect(service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Leave.png')).toEqual({ bytes: Buffer.from('sprite'), mimeType: 'image/png' });

    service.completeRendererDeparture('session-1');
    expect(service.getState().visitors['session-2']).toMatchObject({ sessionId: 'session-2' });
    expect(() => service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Leave.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
  });

  it('revokes live and departing Pack authorization while reconnecting', async () => {
    const { service, visits } = dependencies('host');
    await service.reconcile();
    visits.listSessions.mockResolvedValue([session('ended')]);
    await service.reconcile();
    service.pauseForReconnect();
    expect(service.getState()).toMatchObject({ visitors: {}, departingVisitors: {}, visitorOrder: [], errors: {} });
    expect(() => service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Leave.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
  });

  it('allows safe Pack bytes only while that Pack belongs to the active host Visitor', async () => {
    const { service, companions } = dependencies('host');
    await service.reconcile();
    expect(service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Idle_Neutral.png')).toEqual({ bytes: Buffer.from('sprite'), mimeType: 'image/png' });
    expect(companions.readVerifiedCachedAsset).toHaveBeenCalledWith('pack-1', 'assets/animations/Idle_Neutral.png');
    expect(() => service.readVerifiedCachedAsset('session-1', 'other-pack', 'assets/animations/Idle_Neutral.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
    expect(() => service.readVerifiedCachedAsset('other-session', 'pack-1', 'assets/animations/Idle_Neutral.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
    service.stopSession('session-1');
    expect(() => service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Idle_Neutral.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
  });

  it('removes only the failed host renderer while preserving the authoritative session for later reconciliation', async () => {
    const { service, visits } = dependencies('host');
    await service.reconcile();
    service.reportRendererFailure('other-session');
    expect(service.getState().visitors['session-1']).toMatchObject({ sessionId: 'session-1' });
    service.reportRendererFailure('session-1');
    expect(service.getState().visitorOrder).toEqual([]);
    expect(service.getState().errors['session-1']).toBe('VISUAL_VISIT_RENDERER_UNAVAILABLE');
    await service.reconcile();
    expect(service.getState()).toMatchObject({ ownerPresenceMode: 'home', visitors: { 'session-1': expect.any(Object) }, errors: {} });
    expect(visits.listSessions).toHaveBeenCalled();
  });

  it('reconciles two independent visitors in a stable order and isolates a renderer failure', async () => {
    const { service, visits, companions } = dependencies('host');
    const second = { ...session(), id: 'session-2', invitationId: 'invitation-2', assetPackId: 'pack-2', createdAt: '2026-07-14T00:01:00.000Z' };
    visits.listSessions.mockResolvedValue([second, session()]);
    visits.listInvitations.mockResolvedValue([{ id: 'invitation-1', companionName: 'Ann' }, { id: 'invitation-2', companionName: 'Bea' }]);
    await service.reconcile();
    expect(service.getState().visitorOrder).toEqual(['session-1', 'session-2']);
    expect(service.getState().visitors['session-1']).toMatchObject({ sceneSlotIndex: 0, assetPackId: 'pack-1' });
    expect(service.getState().visitors['session-2']).toMatchObject({ sceneSlotIndex: 1, assetPackId: 'pack-2' });
    expect(companions.getVerifiedVisitVisualManifest).toHaveBeenCalledTimes(2);
    service.reportRendererFailure('session-1');
    expect(service.getState().visitors['session-2']).toMatchObject({ sessionId: 'session-2' });
    expect(service.getState().errors['session-1']).toBe('VISUAL_VISIT_RENDERER_UNAVAILABLE');
  });

  it('keeps the first two deterministic visitors and surfaces authoritative overflow', async () => {
    const { service, visits } = dependencies('host');
    visits.listSessions.mockResolvedValue([
      session(),
      { ...session(), id: 'session-2', invitationId: 'invitation-2', assetPackId: 'pack-2', createdAt: '2026-07-14T00:01:00.000Z' },
      { ...session(), id: 'session-3', invitationId: 'invitation-3', assetPackId: 'pack-3', createdAt: '2026-07-14T00:02:00.000Z' },
    ]);
    visits.listInvitations.mockResolvedValue([{ id: 'invitation-1', companionName: 'Ann' }, { id: 'invitation-2', companionName: 'Bea' }, { id: 'invitation-3', companionName: 'Cyd' }]);
    await service.reconcile();
    expect(service.getState().visitorOrder).toEqual(['session-1', 'session-2']);
    expect(service.getState().errors['session-3']).toBe('VISUAL_VISIT_CAPACITY_REACHED');
  });

  it('defensively suppresses host visitors when the local owner is away in an invalid concurrent state', async () => {
    const { service, visits } = dependencies('host');
    visits.listSessions.mockResolvedValue([
      session(),
      { ...session(), id: 'owner-session', visitorOwnerUserId: 'host', hostUserId: 'owner', networkCompanionId: 'network-companion-1' },
    ]);
    await service.reconcile();
    expect(service.getState()).toMatchObject({ ownerPresenceMode: 'away_visiting', visitors: {}, visitorOrder: [] });
    expect(service.getState().errors['session-1']).toBe('VISUAL_VISIT_HOST_AWAY_CONFLICT');
  });
});
