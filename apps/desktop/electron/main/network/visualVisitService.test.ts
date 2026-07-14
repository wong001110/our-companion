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
  const companions = { getLocalCompanionId: vi.fn().mockResolvedValue('local-ann'), getVerifiedVisitVisualManifest: vi.fn().mockResolvedValue(manifest()) };
  const publish = vi.fn();
  return { network, visits, companions, publish, service: new VisualVisitService(network as never, visits as never, companions as never, publish) };
}

describe('VisualVisitService', () => {
  it('creates one sanitized remote Visitor for an active host session and does not duplicate it', async () => {
    const { service, companions } = dependencies('host');
    await service.reconcile();
    await service.reconcile();
    const state = service.getState();
    expect(state.visitor).toMatchObject({ runtimeId: 'visit:session-1', name: 'Ann', role: 'remote_visitor', assetPackId: 'pack-1' });
    expect(state.visitor).not.toHaveProperty('cacheRoot');
    expect(companions.getVerifiedVisitVisualManifest).toHaveBeenCalledTimes(2);
  });

  it('places only the mapped local Companion into away mode for an active owner session', async () => {
    const { service, companions } = dependencies('owner');
    await service.reconcile();
    expect(companions.getLocalCompanionId).toHaveBeenCalledWith('network-companion-1');
    expect(service.getState()).toEqual({ ownerPresenceMode: 'away_visiting' });
  });

  it('removes a stale visitor and restores the owner when no active session remains', async () => {
    const { service, visits } = dependencies('host');
    await service.reconcile();
    visits.listSessions.mockResolvedValue([session('ended')]);
    await service.reconcile();
    expect(service.getState()).toEqual({ ownerPresenceMode: 'home' });
  });
});
