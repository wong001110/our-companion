import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisitService } from './visitService';

const owner = 'owner';
const host = 'host';
const session = (state: 'preparing' | 'ready' | 'active' | 'ended' = 'preparing') => ({
  id: 'session-1', invitationId: 'invitation-1', visitorOwnerUserId: owner, hostUserId: host,
  networkCompanionId: 'companion-1', assetPackId: 'pack-1', state,
  visitorOwnerReady: false, hostReady: false, createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z',
});

function dependencies(accountId = owner, visit?: { heartbeatIntervalSeconds: number; heartbeatTimeoutSeconds: number }) {
  const network = {
    getStatus: vi.fn().mockResolvedValue({ onlineModeEnabled: true, state: 'online', account: { id: accountId }, visit }),
    getStatusSnapshot: vi.fn(() => ({ onlineModeEnabled: true, state: 'online', account: { id: accountId }, visit })),
    getVisitSession: vi.fn().mockResolvedValue(session()),
    markVisitReady: vi.fn().mockResolvedValue({ ...session(), visitorOwnerReady: true }),
    startVisitSession: vi.fn(), endVisitSession: vi.fn(), heartbeatVisitSession: vi.fn().mockResolvedValue(session()),
    listVisitSessions: vi.fn().mockResolvedValue([]), listVisitInvitations: vi.fn(), createVisitInvitation: vi.fn(), acceptVisitInvitation: vi.fn(), declineVisitInvitation: vi.fn(), cancelVisitInvitation: vi.fn(),
  };
  const companions = { hasNetworkCompanionMapping: vi.fn().mockResolvedValue(true), downloadVisitPack: vi.fn().mockResolvedValue({ verified: true }), cancelVisitDownload: vi.fn().mockResolvedValue(undefined) };
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

  it('reconciles a restored session once after reconnect and resumes its heartbeat', async () => {
    vi.useFakeTimers();
    const { service, network } = dependencies(owner);
    network.listVisitSessions.mockResolvedValue([session('ready')]);
    await Promise.all([service.reconcile(), service.reconcile()]);
    expect(network.listVisitSessions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(network.heartbeatVisitSession).toHaveBeenCalledWith('session-1');
  });

  it('refuses preparation while Online Mode is unavailable', async () => {
    const { service, network } = dependencies(owner);
    network.getStatus.mockResolvedValue({ onlineModeEnabled: false, state: 'disabled' });
    await expect(service.prepare('session-1')).rejects.toThrow('ONLINE_MODE_DISABLED');
    expect(network.markVisitReady).not.toHaveBeenCalled();
  });

  it('coalesces concurrent prepare calls and does not repeat work after this participant is ready', async () => {
    const { service, network, companions } = dependencies(host);
    await Promise.all([service.prepare('session-1'), service.prepare('session-1')]);
    expect(companions.downloadVisitPack).toHaveBeenCalledTimes(1);
    expect(network.markVisitReady).toHaveBeenCalledTimes(1);
    network.getVisitSession.mockResolvedValue({ ...session(), hostReady: true });
    await service.prepare('session-1');
    expect(companions.downloadVisitPack).toHaveBeenCalledTimes(1);
    expect(network.markVisitReady).toHaveBeenCalledTimes(1);
  });

  it('keeps heartbeat ownership for a transient failure, but stops on an authoritative terminal error', async () => {
    vi.useFakeTimers();
    const { service, network } = dependencies(owner);
    network.listVisitSessions.mockResolvedValue([session('preparing')]);
    network.heartbeatVisitSession.mockRejectedValueOnce(new Error('network timeout')).mockRejectedValueOnce(new Error('VISIT_SESSION_STATE_CHANGED'));
    await service.listSessions();
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(network.heartbeatVisitSession).toHaveBeenCalledTimes(2);
  });

  it.each([
    [5, 5_000, 1],
    [30, 15_000, 0],
    [30, 30_000, 1],
  ])('uses the server heartbeat cadence of %is', async (interval, elapsed, expected) => {
    vi.useFakeTimers();
    const { service, network } = dependencies(owner, { heartbeatIntervalSeconds: interval, heartbeatTimeoutSeconds: Math.max(30, interval * 2) });
    network.listVisitSessions.mockResolvedValue([session('preparing')]);
    await service.listSessions();
    await vi.advanceTimersByTimeAsync(elapsed);
    expect(network.heartbeatVisitSession).toHaveBeenCalledTimes(expected);
  });

  it('falls back to fifteen seconds when runtime timing is missing or invalid', async () => {
    vi.useFakeTimers();
    const { service, network } = dependencies(owner);
    network.getStatusSnapshot.mockReturnValue({ onlineModeEnabled: true, state: 'online', account: { id: owner }, visit: { heartbeatIntervalSeconds: 4, heartbeatTimeoutSeconds: 8 } });
    network.listVisitSessions.mockResolvedValue([session('preparing')]);
    await service.listSessions();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(network.heartbeatVisitSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(network.heartbeatVisitSession).toHaveBeenCalledTimes(1);
  });

  it('recreates heartbeat timers with the current server cadence after reconciliation', async () => {
    vi.useFakeTimers();
    const { service, network } = dependencies(owner, { heartbeatIntervalSeconds: 15, heartbeatTimeoutSeconds: 30 });
    network.listVisitSessions.mockResolvedValue([session('preparing')]);
    await service.reconcile();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(network.heartbeatVisitSession).not.toHaveBeenCalled();
    service.stopAll();
    network.getStatusSnapshot.mockReturnValue({ onlineModeEnabled: true, state: 'online', account: { id: owner }, visit: { heartbeatIntervalSeconds: 5, heartbeatTimeoutSeconds: 30 } });
    await service.reconcile();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(network.heartbeatVisitSession).toHaveBeenCalledTimes(1);
  });
});
