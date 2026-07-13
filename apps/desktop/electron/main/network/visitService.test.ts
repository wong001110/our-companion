import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisitService } from './visitService';

const owner = 'owner';
const host = 'host';
const session = (state: 'preparing' | 'ready' | 'active' | 'ended' = 'preparing') => ({
  id: 'session-1', invitationId: 'invitation-1', visitorOwnerUserId: owner, hostUserId: host,
  networkCompanionId: 'companion-1', assetPackId: 'pack-1', state,
  visitorOwnerReady: false, hostReady: false, createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z',
});

function dependencies(accountId = owner) {
  const network = {
    getStatus: vi.fn().mockResolvedValue({ onlineModeEnabled: true, state: 'online', account: { id: accountId } }),
    getVisitSession: vi.fn().mockResolvedValue(session()),
    markVisitReady: vi.fn().mockResolvedValue({ ...session(), visitorOwnerReady: true }),
    startVisitSession: vi.fn(), endVisitSession: vi.fn(), heartbeatVisitSession: vi.fn().mockResolvedValue(session()),
    listVisitSessions: vi.fn().mockResolvedValue([]), listVisitInvitations: vi.fn(), createVisitInvitation: vi.fn(), acceptVisitInvitation: vi.fn(), declineVisitInvitation: vi.fn(), cancelVisitInvitation: vi.fn(),
  };
  const companions = { hasNetworkCompanionMapping: vi.fn().mockResolvedValue(true), downloadVisitPack: vi.fn().mockResolvedValue({ verified: true }) };
  return { network, companions, service: new VisitService(network as never, companions as never) };
}

describe('VisitService main-process coordinator', () => {
  afterEach(() => vi.useRealTimers());

  it('prepares the visitor owner only after a local network mapping exists', async () => {
    const { service, network, companions } = dependencies(owner);
    await expect(service.prepare('session-1')).resolves.toMatchObject({ visitorOwnerReady: true });
    expect(companions.hasNetworkCompanionMapping).toHaveBeenCalledWith('companion-1');
    expect(companions.downloadVisitPack).not.toHaveBeenCalled();
    expect(network.markVisitReady).toHaveBeenCalledWith('session-1');
  });

  it('downloads and verifies the session-scoped snapshot pack before the host reports ready', async () => {
    const { service, network, companions } = dependencies(host);
    await service.prepare('session-1');
    expect(companions.downloadVisitPack).toHaveBeenCalledWith({ sessionId: 'session-1', assetPackId: 'pack-1', networkCompanionId: 'companion-1' });
    expect(network.markVisitReady).toHaveBeenCalledAfter(companions.downloadVisitPack as never);
  });

  it('starts one heartbeat per non-terminal session and stops it when terminal', async () => {
    vi.useFakeTimers();
    const { service, network } = dependencies(owner);
    network.listVisitSessions.mockResolvedValue([session('preparing')]);
    await service.listSessions();
    await service.listSessions();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(network.heartbeatVisitSession).toHaveBeenCalledTimes(1);
    network.heartbeatVisitSession.mockResolvedValue(session('ended'));
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(network.heartbeatVisitSession).toHaveBeenCalledTimes(2);
  });

  it('refuses preparation while Online Mode is unavailable', async () => {
    const { service, network } = dependencies(owner);
    network.getStatus.mockResolvedValue({ onlineModeEnabled: false, state: 'disabled' });
    await expect(service.prepare('session-1')).rejects.toThrow('ONLINE_MODE_DISABLED');
    expect(network.markVisitReady).not.toHaveBeenCalled();
  });
});
