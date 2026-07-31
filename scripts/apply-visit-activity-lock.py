from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'anchor not found in {path}: {old[:180]!r}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


# Shared reservation contract.
replace_once(
    'packages/shared/src/index.ts',
    '''export type VisitInvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type VisitSessionState = 'preparing' | 'ready' | 'active' | 'ending' | 'ended' | 'cancelled' | 'failed';''',
    '''export type VisitInvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type VisitSessionState = 'preparing' | 'ready' | 'active' | 'ending' | 'ended' | 'cancelled' | 'failed';
export interface VisitReservationSummary {
  locked: boolean;
  kind?: 'outgoing_invitation' | 'session_participant' | 'join_request';
  networkCompanionId?: string;
  invitationId?: string;
  sessionId?: string;
  joinRequestId?: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}''',
)

# Network client: new endpoint plus rolling-deployment fallback signal.
replace_once(
    'apps/desktop/electron/main/networkConnection.ts',
    '''VisitRuntimeConfig, VisitSessionSummary, VisitSessionState } from '@our-companion/shared';''',
    '''VisitReservationSummary, VisitRuntimeConfig, VisitSessionSummary, VisitSessionState } from '@our-companion/shared';''',
)
replace_once(
    'apps/desktop/electron/main/networkConnection.ts',
    '''  listVisitInvitations = (input: { direction?: 'incoming' | 'outgoing'; status?: VisitInvitationStatus } = {}) => {''',
    '''  getVisitReservation = async (): Promise<VisitReservationSummary | undefined> => {
    try {
      return await this.socialRequest<VisitReservationSummary>('/api/visit-reservation');
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      // A pre-reservation Network server returns a generic 404 envelope. The
      // VisitService then derives the lock from bounded legacy Visit records.
      if (code === 'NETWORK_ERROR' || code === 'NOT_FOUND') return undefined;
      throw error;
    }
  };
  listVisitInvitations = (input: { direction?: 'incoming' | 'outgoing'; status?: VisitInvitationStatus } = {}) => {''',
)

# VisitService owns a cached, main-process-only activity lock.
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''import type { VisitInvitationStatus, VisitInvitationSummary, VisitSessionSummary } from '@our-companion/shared';''',
    '''import type { VisitInvitationStatus, VisitInvitationSummary, VisitReservationSummary, VisitSessionSummary } from '@our-companion/shared';''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''  private reconcilePromise?: Promise<void>;
  private reconcileRequested = false;''',
    '''  private reconcilePromise?: Promise<void>;
  private reconcileRequested = false;
  private activityLock: VisitReservationSummary = { locked: false };''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''  sendInvitation = async (hostUserId: string): Promise<VisitInvitationSummary> => {
    await this.assertCanStartOutgoingVisit();
    return this.network.createVisitInvitation(hostUserId);
  };''',
    '''  sendInvitation = async (hostUserId: string): Promise<VisitInvitationSummary> => {
    await this.assertCanStartOutgoingVisit();
    const invitation = await this.network.createVisitInvitation(hostUserId);
    await this.refreshActivityLock();
    return invitation;
  };''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''  acceptInvitation = async (invitationId: string) => {
    await this.assertCanAcceptIncomingInvitation(invitationId);
    const result = await this.network.acceptVisitInvitation(invitationId);
    this.track(result.session);
    return result;
  };
  declineInvitation = (invitationId: string): Promise<VisitInvitationSummary> => this.network.declineVisitInvitation(invitationId);
  cancelInvitation = (invitationId: string): Promise<VisitInvitationSummary> => this.network.cancelVisitInvitation(invitationId);''',
    '''  acceptInvitation = async (invitationId: string) => {
    await this.assertCanAcceptIncomingInvitation(invitationId);
    const result = await this.network.acceptVisitInvitation(invitationId);
    this.track(result.session);
    await this.refreshActivityLock();
    return result;
  };
  declineInvitation = async (invitationId: string): Promise<VisitInvitationSummary> => {
    const invitation = await this.network.declineVisitInvitation(invitationId);
    await this.refreshActivityLock();
    return invitation;
  };
  cancelInvitation = async (invitationId: string): Promise<VisitInvitationSummary> => {
    const invitation = await this.network.cancelVisitInvitation(invitationId);
    await this.refreshActivityLock();
    return invitation;
  };''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''      await this.listSessions();
    } while (this.reconcileRequested);''',
    '''      await Promise.all([this.listSessions(), this.refreshActivityLock()]);
    } while (this.reconcileRequested);''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''  end = async (sessionId: string): Promise<VisitSessionSummary> => {
    const updated = await this.network.endVisitSession(sessionId);
    this.track(updated);
    return updated;
  };''',
    '''  end = async (sessionId: string): Promise<VisitSessionSummary> => {
    const updated = await this.network.endVisitSession(sessionId);
    this.track(updated);
    await this.refreshActivityLock();
    return updated;
  };''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''  stopAll = (): void => {
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer);
    this.heartbeatTimers.clear();
    this.heartbeatFailures.clear();
  };

  /** Desktop-side authority; the server remains responsible for atomic cross-device capacity enforcement. */''',
    '''  stopAll = (): void => {
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer);
    this.heartbeatTimers.clear();
    this.heartbeatFailures.clear();
    this.activityLock = { locked: false };
  };

  isActivityLocked = (): boolean => this.activityLock.locked;
  getActivityLock = (): VisitReservationSummary => ({ ...this.activityLock });

  refreshActivityLock = async (): Promise<VisitReservationSummary> => {
    const status = await this.network.getStatus();
    if (!status.onlineModeEnabled || status.state !== 'online' || !status.account) {
      this.activityLock = { locked: false };
      return this.getActivityLock();
    }
    const serverReservation = await this.network.getVisitReservation();
    if (serverReservation) {
      this.activityLock = sanitizeReservation(serverReservation);
      return this.getActivityLock();
    }
    // Rolling-deployment compatibility: before /visit-reservation exists, a
    // pending outgoing invitation or live two-person session is the lock.
    const [outgoing, sessions] = await Promise.all([
      this.network.listVisitInvitations({ direction: 'outgoing', status: 'pending' }),
      this.network.listVisitSessions(),
    ]);
    const session = sessions.find((candidate) => LIVE_STATES.has(candidate.state));
    const invitation = outgoing.find((candidate) => candidate.status === 'pending');
    this.activityLock = session
      ? { locked: true, kind: 'session_participant', networkCompanionId: session.networkCompanionId, sessionId: session.id, updatedAt: session.updatedAt }
      : invitation
        ? { locked: true, kind: 'outgoing_invitation', networkCompanionId: invitation.networkCompanionId, invitationId: invitation.id, expiresAt: invitation.expiresAt, updatedAt: invitation.updatedAt }
        : { locked: false };
    return this.getActivityLock();
  };

  /** Desktop-side authority; the server remains responsible for atomic cross-device capacity enforcement. */''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''  assertCanSwitchLocalCompanion = async (): Promise<void> => {
    const status = await this.network.getStatus();''',
    '''  assertCanSwitchLocalCompanion = async (): Promise<void> => {
    if ((await this.refreshActivityLock()).locked) throw new Error('VISIT_COMPANION_RESERVED');
    const status = await this.network.getStatus();''',
)
# Add response validation at file end before approvedShareInput.
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''function approvedShareInput(input: PendingShare): VisitShareInput {''',
    '''function sanitizeReservation(input: VisitReservationSummary): VisitReservationSummary {
  if (!input || typeof input !== 'object' || typeof input.locked !== 'boolean') return { locked: false };
  if (!input.locked) return { locked: false };
  if (!input.kind || !['outgoing_invitation', 'session_participant', 'join_request'].includes(input.kind)) return { locked: false };
  return {
    locked: true,
    kind: input.kind,
    ...(typeof input.networkCompanionId === 'string' ? { networkCompanionId: input.networkCompanionId } : {}),
    ...(typeof input.invitationId === 'string' ? { invitationId: input.invitationId } : {}),
    ...(typeof input.sessionId === 'string' ? { sessionId: input.sessionId } : {}),
    ...(typeof input.joinRequestId === 'string' ? { joinRequestId: input.joinRequestId } : {}),
    ...(typeof input.expiresAt === 'string' ? { expiresAt: input.expiresAt } : {}),
    ...(typeof input.createdAt === 'string' ? { createdAt: input.createdAt } : {}),
    ...(typeof input.updatedAt === 'string' ? { updatedAt: input.updatedAt } : {}),
  };
}

function approvedShareInput(input: PendingShare): VisitShareInput {''',
)

# Discovery scheduler skips before any refresh or presentation work.
replace_once(
    'apps/desktop/electron/main/discoveryScheduler.ts',
    '''  presentationGateway: DiscoveryPresentationGateway;
  setTimer?: typeof setTimeout;''',
    '''  presentationGateway: DiscoveryPresentationGateway;
  isCompanionReserved?: () => boolean;
  setTimer?: typeof setTimeout;''',
)
replace_once(
    'apps/desktop/electron/main/discoveryScheduler.ts',
    '''    if (this.stopped) return { status: 'skipped', reason: 'stopped' };
    if (this.deps.presentationGateway.isBusy() || this.deps.presentationGateway.hasPending()) {''',
    '''    if (this.stopped) return { status: 'skipped', reason: 'stopped' };
    if (this.deps.isCompanionReserved?.()) return { status: 'skipped', reason: 'visit_reserved' };
    if (this.deps.presentationGateway.isBusy() || this.deps.presentationGateway.hasPending()) {''',
)

# Main-process IPC gate and proactive Discovery suppression.
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''let smokeUiBetaFixture: UiBetaSmokeFixture | undefined;

const isDev''',
    '''let smokeUiBetaFixture: UiBetaSmokeFixture | undefined;

const VISIT_RESERVED_ACTIVITY_CHANNELS = new Set([
  'character:triggerBehavior',
  'discovery:refresh',
  'discovery:runBaseNow',
  'discovery:exploreChannelNow',
  'discovery:generateNow',
  'discovery:presentNext',
  'autonomy:startExploration',
  'tool:execute',
  'action:plan',
  'action:executePlan',
]);

const isDev''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''      if (!onboardingAllowed && !services.hasActiveCompanion()) {
        throw new Error('NO_ACTIVE_COMPANION: No active Companion. Complete Companion creation first.');
      }
      const result = await (handler as (input: unknown) => Promise<unknown>)(input);''',
    '''      if (!onboardingAllowed && !services.hasActiveCompanion()) {
        throw new Error('NO_ACTIVE_COMPANION: No active Companion. Complete Companion creation first.');
      }
      if (VISIT_RESERVED_ACTIVITY_CHANNELS.has(channel) && services.visits.isActivityLocked()) {
        throw new Error('VISIT_COMPANION_RESERVED');
      }
      const result = await (handler as (input: unknown) => Promise<unknown>)(input);''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''    canAnnounce: () => services.canAnnounceDiscovery(),''',
    '''    canAnnounce: () => !services.visits.isActivityLocked() && services.canAnnounceDiscovery(),''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''    presentationGateway: {
      isBusy: () => services.isDiscoveryPresentationBusy(),''',
    '''    isCompanionReserved: () => services.visits.isActivityLocked(),
    presentationGateway: {
      isBusy: () => services.isDiscoveryPresentationBusy(),''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''    services.attachNetworkStatusBroadcaster((status) => {
      for (const win of [companionWindow, panelWindow]) {''',
    '''    services.attachNetworkStatusBroadcaster((status) => {
      if (status.state === 'online' && (
        !status.socialInvalidation
        || status.socialInvalidation.type === 'visit_invitation'
        || status.socialInvalidation.type === 'visit_session'
      )) void services.visits.refreshActivityLock();
      for (const win of [companionWindow, panelWindow]) {''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''    const networkStatus = await services.network.getStatus();
    if (networkStatus.onlineModeEnabled) void services.network.enableOnlineMode();''',
    '''    const networkStatus = await services.network.getStatus();
    if (networkStatus.onlineModeEnabled) {
      void services.network.enableOnlineMode().then(() => services.visits.reconcile());
    }''',
)

# Static + behavioral regression contracts.
Path('apps/desktop/electron/main/visitActivityLock.test.ts').write_text('''import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DiscoveryScheduler } from './discoveryScheduler';

const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const visitSource = readFileSync(new URL('./network/visitService.ts', import.meta.url), 'utf8');
const connectionSource = readFileSync(new URL('./networkConnection.ts', import.meta.url), 'utf8');

describe('Visit activity lock', () => {
  it('skips Discovery before refresh while a Companion is reserved', async () => {
    const refresh = vi.fn();
    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 50,
      countAnnouncedToday: () => 0,
      getOldestQueuedDiscovery: vi.fn(),
      isCompanionReserved: () => true,
      presentationGateway: { isBusy: () => false, hasPending: () => false, requestPresentation: vi.fn() },
    });
    await expect(scheduler.runOnce()).resolves.toEqual({ status: 'skipped', reason: 'visit_reserved' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('locks immediately after invitation creation and retains a legacy fallback', () => {
    expect(connectionSource).toContain('/api/visit-reservation');
    expect(visitSource).toContain('await this.refreshActivityLock()');
    expect(visitSource).toContain("kind: 'outgoing_invitation'");
    expect(visitSource).toContain("kind: 'session_participant'");
    expect(visitSource).toContain('VISIT_COMPANION_RESERVED');
  });

  it('blocks autonomous execution and proactive Discovery but keeps read/chat paths outside the blocklist', () => {
    expect(indexSource).toContain('VISIT_RESERVED_ACTIVITY_CHANNELS');
    expect(indexSource).toContain("'autonomy:startExploration'");
    expect(indexSource).toContain("'discovery:generateNow'");
    expect(indexSource).toContain('!services.visits.isActivityLocked() && services.canAnnounceDiscovery()');
    expect(indexSource).not.toContain("VISIT_RESERVED_ACTIVITY_CHANNELS = new Set([\n  'companion:turn'");
  });
});
''', encoding='utf-8')
