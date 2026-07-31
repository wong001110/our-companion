import { describe, expect, it, vi } from 'vitest';
import type { SocialVisitState, VisitRoomState, VisitSessionSummary } from '@our-companion/shared';
import { VisualVisitService } from './visualVisitService';

const session = (state: VisitSessionSummary['state'] = 'active', id = 'session-1'): VisitSessionSummary => ({
  id, invitationId: `invitation-${id}`, visitorOwnerUserId: 'owner', hostUserId: 'host', hostNetworkCompanionId: 'host-companion', networkCompanionId: 'network-companion-1', assetPackId: 'pack-1', visitMode: 'standard', state,
  visitorOwnerReady: true, hostReady: true, createdAt: '2026-07-14T00:00:00.000Z', updatedAt: '2026-07-14T00:00:00.000Z',
});

const manifest = () => ({
  format: 'our-companion-asset-pack' as const, schemaVersion: 1 as const,
  runtime: { defaultAnimation: 'Idle_Neutral' as const, animations: ['Idle_Neutral', 'Enter', 'Leave', 'Walk_Left', 'Walk_Right', 'Walk_Up', 'Walk_Down', 'Talk_Neutral'].map((name) => ({ name, format: 'sprite_sheet' as const, files: [`assets/animations/${name}.png`], frameWidth: 300, frameHeight: 300, frameCount: 1, frameDurationMs: 180, loop: name === 'Idle_Neutral' })) },
  files: [],
});

function roomFor(current: VisitSessionSummary, includeGuest = false): VisitRoomState {
  return {
    session: { id: current.id, state: current.state, hostUserId: current.hostUserId, roomCapacity: 3, currentTopicSequence: 1, createdAt: current.createdAt, updatedAt: current.updatedAt },
    participants: [
      { id: `${current.id}-host`, userId: current.hostUserId, networkCompanionId: current.hostNetworkCompanionId ?? 'host-companion', companionName: 'Host Companion', assetPackId: `host-pack-${current.id}`, role: 'host', state: 'active', joinedAt: current.createdAt },
      { id: `${current.id}-visitor`, userId: current.visitorOwnerUserId, networkCompanionId: current.networkCompanionId, companionName: 'Ann', assetPackId: current.assetPackId, role: 'visitor', state: 'active', joinedAt: current.createdAt },
      ...(includeGuest ? [{ id: `${current.id}-guest`, userId: 'guest', networkCompanionId: 'guest-companion', companionName: 'Bea', assetPackId: `guest-pack-${current.id}`, role: 'guest' as const, state: 'active' as const, joinedAt: current.createdAt }] : []),
    ],
    topics: [],
    pendingJoinRequests: [],
  };
}

function socialFor(current: VisitSessionSummary, senderUserId?: string): SocialVisitState {
  return {
    sessionId: current.id, maxTurns: 15, topics: [], participants: roomFor(current).participants,
    turns: senderUserId ? [{ id: `turn-${senderUserId}`, sessionId: current.id, sequence: 1, senderUserId, intent: 'REACT', message: `${senderUserId} says hello`, emotion: 'neutral', createdAt: current.createdAt }] : [],
  };
}

function dependencies(accountId: 'owner' | 'host' = 'host', sessions: VisitSessionSummary[] = [session()]) {
  const network = { getStatusSnapshot: vi.fn(() => ({ state: 'online', onlineModeEnabled: true, account: { id: accountId }, features: { visualVisits: true } })) };
  const visits = {
    listSessions: vi.fn().mockResolvedValue(sessions),
    listInvitations: vi.fn().mockResolvedValue([]),
    getRoom: vi.fn(async (sessionId: string) => roomFor(sessions.find((item) => item.id === sessionId)!)),
    getSocialState: vi.fn(async (sessionId: string) => socialFor(sessions.find((item) => item.id === sessionId)!)),
  };
  const companions = {
    getLocalCompanionId: vi.fn().mockResolvedValue('local-ann'),
    getVerifiedVisitVisualManifest: vi.fn().mockResolvedValue(manifest()),
    getVerifiedVisitParticipantVisualManifest: vi.fn().mockResolvedValue(manifest()),
    readVerifiedCachedAsset: vi.fn().mockReturnValue({ bytes: Buffer.from('sprite'), mimeType: 'image/png' }),
  };
  const publish = vi.fn();
  return { network, visits, companions, publish, service: new VisualVisitService(network as never, visits as never, companions as never, publish) };
}

describe('VisualVisitService', () => {
  it('renders every remote room participant with a stable participant runtime id', async () => {
    const current = session();
    const { service, visits, companions } = dependencies('host', [current]);
    visits.getRoom.mockResolvedValue(roomFor(current, true));
    await service.reconcile();
    await service.reconcile();
    const state = service.getState();
    expect(state.visitorOrder).toEqual(['visit:session-1:session-1-visitor', 'visit:session-1:session-1-guest']);
    expect(state.visitors[state.visitorOrder[0]]).toMatchObject({ name: 'Ann', role: 'remote_visitor', assetPackId: 'pack-1', participantRole: 'visitor', sceneSlotIndex: 0 });
    expect(state.visitors[state.visitorOrder[1]]).toMatchObject({ name: 'Bea', participantRole: 'guest', sceneSlotIndex: 1 });
    expect(companions.getVerifiedVisitParticipantVisualManifest).toHaveBeenCalledTimes(4);
  });

  it('places the local Companion into away mode when this device is a Visitor or Guest', async () => {
    const { service, companions } = dependencies('owner');
    await service.reconcile();
    expect(companions.getLocalCompanionId).toHaveBeenCalledWith('network-companion-1');
    expect(service.getState()).toMatchObject({ ownerPresenceMode: 'away_visiting', visitors: {}, visitorOrder: [], errors: {} });
  });

  it('presents the correct remote speaker and acknowledges only that turn', async () => {
    const current = session();
    const { service, visits } = dependencies('host', [current]);
    visits.getSocialState.mockResolvedValue(socialFor(current, 'owner'));
    await service.reconcile();
    const runtimeId = service.getState().visitorOrder[0];
    expect(service.getState().visitors[runtimeId].presentation).toMatchObject({ turnId: 'turn-owner', senderUserId: 'owner', animationName: 'Talk_Neutral' });
    service.acknowledgePresentation('turn-owner');
    expect(service.getState().visitors[runtimeId].presentation).toBeUndefined();
  });

  it('publishes a local presentation when the local Companion owns the latest turn', async () => {
    const current = session();
    const { service, visits } = dependencies('host', [current]);
    visits.getSocialState.mockResolvedValue(socialFor(current, 'host'));
    await service.reconcile();
    expect(service.getState().localPresentation).toMatchObject({ turnId: 'turn-host', senderUserId: 'host' });
    service.acknowledgePresentation('turn-host');
    expect(service.getState().localPresentation).toBeUndefined();
  });

  it('keeps departing Pack bytes authorized only until renderer acknowledgement', async () => {
    const { service, visits } = dependencies('host');
    await service.reconcile();
    const runtimeId = service.getState().visitorOrder[0];
    visits.listSessions.mockResolvedValue([session('ended')]);
    await service.reconcile();
    expect(service.getState().departingVisitors[runtimeId]).toMatchObject({ sessionId: 'session-1' });
    expect(service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Leave.png')).toEqual({ bytes: Buffer.from('sprite'), mimeType: 'image/png' });
    expect(() => service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Idle_Neutral.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
    service.completeRendererDeparture(runtimeId);
    expect(() => service.readVerifiedCachedAsset('session-1', 'pack-1', 'assets/animations/Leave.png')).toThrow('VISUAL_VISIT_ASSET_UNAVAILABLE');
  });

  it('isolates renderer failure and rejects room participants beyond visual capacity', async () => {
    const current = session();
    const { service, visits } = dependencies('host', [current]);
    const room = roomFor(current, true);
    room.participants.push({ id: 'overflow', userId: 'overflow', networkCompanionId: 'overflow-companion', companionName: 'Cyd', assetPackId: 'overflow-pack', role: 'guest', state: 'active', joinedAt: current.createdAt });
    visits.getRoom.mockResolvedValue(room);
    await service.reconcile();
    expect(service.getState().visitorOrder).toHaveLength(2);
    expect(service.getState().errors['session-1']).toBe('VISUAL_VISIT_CAPACITY_REACHED');
    const first = service.getState().visitorOrder[0];
    service.reportRendererFailure(first);
    expect(service.getState().visitors[first]).toBeUndefined();
    expect(service.getState().errors['session-1']).toBe('VISUAL_VISIT_RENDERER_UNAVAILABLE');
  });
});
