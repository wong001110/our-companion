import type { VisitInvitationStatus, VisitInvitationSummary, VisitSessionSummary } from '@our-companion/shared';
import type { NetworkConnectionService } from '../networkConnection';
import type { PublicCompanionService } from './publicCompanionService';

const LIVE_STATES = new Set<VisitSessionSummary['state']>(['preparing', 'ready', 'active', 'ending']);
const HOST_CAPACITY = 2;

/** Main-process-only S4 coordinator. It deliberately returns only sanitized REST summaries. */
export class VisitService {
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly heartbeatFailures = new Map<string, number>();
  private readonly preparePromises = new Map<string, Promise<VisitSessionSummary>>();
  private reconcilePromise?: Promise<void>;
  private reconcileRequested = false;

  constructor(private readonly network: NetworkConnectionService, private readonly companions: PublicCompanionService) {}

  listInvitations = (input?: { direction?: 'incoming' | 'outgoing'; status?: VisitInvitationStatus }): Promise<VisitInvitationSummary[]> => this.network.listVisitInvitations(input);
  sendInvitation = async (hostUserId: string): Promise<VisitInvitationSummary> => {
    await this.assertCanStartOutgoingVisit();
    return this.network.createVisitInvitation(hostUserId);
  };
  acceptInvitation = async (invitationId: string) => {
    await this.assertCanAcceptIncomingInvitation(invitationId);
    const result = await this.network.acceptVisitInvitation(invitationId);
    this.track(result.session);
    return result;
  };
  declineInvitation = (invitationId: string): Promise<VisitInvitationSummary> => this.network.declineVisitInvitation(invitationId);
  cancelInvitation = (invitationId: string): Promise<VisitInvitationSummary> => this.network.cancelVisitInvitation(invitationId);

  listSessions = async (): Promise<VisitSessionSummary[]> => {
    const sessions = await this.network.listVisitSessions();
    sessions.forEach((session) => this.track(session));
    return sessions;
  };

  /** Restores heartbeat ownership after an app reconnect without involving a renderer window. */
  reconcile = async (): Promise<void> => {
    if (this.reconcilePromise) {
      this.reconcileRequested = true;
      return this.reconcilePromise;
    }
    this.reconcilePromise = this.reconcileLoop().finally(() => { this.reconcilePromise = undefined; });
    return this.reconcilePromise;
  };

  private reconcileLoop = async (): Promise<void> => {
    do {
      this.reconcileRequested = false;
      await this.listSessions();
    } while (this.reconcileRequested);
  };
  getSession = async (sessionId: string): Promise<VisitSessionSummary> => {
    const session = await this.network.getVisitSession(sessionId);
    this.track(session);
    return session;
  };

  prepare = (sessionId: string): Promise<VisitSessionSummary> => {
    const existing = this.preparePromises.get(sessionId);
    if (existing) return existing;
    const prepared = this.prepareOnce(sessionId).finally(() => this.preparePromises.delete(sessionId));
    this.preparePromises.set(sessionId, prepared);
    return prepared;
  };

  private prepareOnce = async (sessionId: string): Promise<VisitSessionSummary> => {
    const session = await this.network.getVisitSession(sessionId);
    const status = await this.network.getStatus();
    if (!status.onlineModeEnabled || status.state !== 'online' || !status.account) throw new Error('ONLINE_MODE_DISABLED');
    const alreadyReady = status.account.id === session.visitorOwnerUserId ? session.visitorOwnerReady : status.account.id === session.hostUserId ? session.hostReady : undefined;
    if (alreadyReady) { this.track(session); return session; }
    if (status.account.id === session.visitorOwnerUserId) {
      if (!(await this.companions.hasNetworkCompanionMapping(session.networkCompanionId))) throw new Error('VISIT_PARTICIPANT_UNAVAILABLE');
    } else if (status.account.id === session.hostUserId) {
      await this.assertHostSessionAllowed(session);
      await this.companions.downloadVisitPack({ sessionId, assetPackId: session.assetPackId, networkCompanionId: session.networkCompanionId });
    } else {
      throw new Error('VISIT_SESSION_NOT_PARTICIPANT');
    }
    const updated = await this.network.markVisitReady(sessionId);
    this.track(updated);
    return updated;
  };

  start = async (sessionId: string): Promise<VisitSessionSummary> => {
    await this.assertHostSessionAllowed(await this.network.getVisitSession(sessionId));
    const updated = await this.network.startVisitSession(sessionId);
    this.track(updated);
    return updated;
  };
  end = async (sessionId: string): Promise<VisitSessionSummary> => {
    const updated = await this.network.endVisitSession(sessionId);
    this.track(updated);
    return updated;
  };

  stopAll = (): void => {
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer);
    this.heartbeatTimers.clear();
    this.heartbeatFailures.clear();
  };

  /** Desktop-side authority; the server remains responsible for atomic cross-device capacity enforcement. */
  assertCanSwitchLocalCompanion = async (): Promise<void> => {
    const status = await this.network.getStatus();
    // Offline mode has no authoritative host session to preserve, so it must
    // not prevent normal local Companion selection/onboarding flows.
    if (!status.onlineModeEnabled || status.state !== 'online' || !status.account) return;
    // A stale optimistic status can briefly report online before an
    // authenticated transport exists (notably during local onboarding). It
    // cannot represent an authoritative hosted Visit, so retain local switch
    // behavior until a real Session list is available.
    const sessions = await this.network.listVisitSessions().catch((error: unknown) => {
      const code = error instanceof Error ? error.message : String(error);
      if (code.includes('ONLINE_MODE_DISABLED')) return undefined;
      throw error;
    });
    if (!sessions) return;
    sessions.forEach((session) => this.track(session));
    if (this.hostOccupancy(sessions, status.account.id) > 0) throw new Error('VISIT_HOST_COMPANION_SWITCH_BLOCKED');
  };

  private assertCanStartOutgoingVisit = async (): Promise<void> => {
    const context = await this.currentContext();
    if (this.hostOccupancy(context.sessions, context.accountId) > 0) throw new Error('VISIT_HOST_HAS_ACTIVE_GUESTS');
  };

  private assertCanAcceptIncomingInvitation = async (invitationId: string): Promise<void> => {
    const context = await this.currentContext();
    const invitations = await this.network.listVisitInvitations({ direction: 'incoming', status: 'pending' });
    const invitation = invitations.find((candidate) => candidate.id === invitationId);
    if (!invitation || invitation.hostUserId !== context.accountId) throw new Error('VISIT_INVITATION_NOT_FOUND');
    this.assertHostAdmission(context.sessions, context.accountId);
  };

  private assertHostSessionAllowed = async (session: VisitSessionSummary): Promise<void> => {
    const context = await this.currentContext();
    if (session.hostUserId !== context.accountId) return;
    this.assertHostAdmission(context.sessions, context.accountId, session.id);
  };

  private assertHostAdmission(sessions: VisitSessionSummary[], accountId: string, existingSessionId?: string): void {
    if (sessions.some((session) => LIVE_STATES.has(session.state) && session.visitorOwnerUserId === accountId)) {
      throw new Error('VISIT_HOST_COMPANION_AWAY');
    }
    const occupancy = this.hostOccupancy(sessions, accountId);
    if (occupancy > HOST_CAPACITY || (!existingSessionId && occupancy >= HOST_CAPACITY)) throw new Error('VISIT_HOST_CAPACITY_REACHED');
  }

  private hostOccupancy(sessions: VisitSessionSummary[], accountId: string): number {
    return sessions.filter((session) => LIVE_STATES.has(session.state) && session.hostUserId === accountId).length;
  }

  private currentContext = async (): Promise<{ accountId: string; sessions: VisitSessionSummary[] }> => {
    const status = await this.network.getStatus();
    if (!status.onlineModeEnabled || status.state !== 'online' || !status.account) throw new Error('ONLINE_MODE_DISABLED');
    const sessions = await this.network.listVisitSessions();
    sessions.forEach((session) => this.track(session));
    return { accountId: status.account.id, sessions };
  };

  private track(session: VisitSessionSummary): void {
    if (!LIVE_STATES.has(session.state)) {
      const timer = this.heartbeatTimers.get(session.id);
      if (timer) clearInterval(timer);
      this.heartbeatTimers.delete(session.id);
      this.heartbeatFailures.delete(session.id);
      void this.companions.cancelVisitDownload(session.id);
      return;
    }
    if (this.heartbeatTimers.has(session.id)) return;
    const heartbeat = async () => {
      try {
        this.heartbeatFailures.delete(session.id);
        this.track(await this.network.heartbeatVisitSession(session.id));
      } catch (error) {
        if (this.isTerminalHeartbeatError(error)) { this.stop(session.id); return; }
        const failures = (this.heartbeatFailures.get(session.id) ?? 0) + 1;
        this.heartbeatFailures.set(session.id, failures);
        if (failures >= 3) void this.reconcile().catch(() => undefined);
      }
    };
    this.heartbeatTimers.set(session.id, setInterval(() => void heartbeat(), this.heartbeatIntervalMs()));
  }

  private stop(sessionId: string): void {
    const timer = this.heartbeatTimers.get(sessionId);
    if (timer) clearInterval(timer);
    this.heartbeatTimers.delete(sessionId);
    this.heartbeatFailures.delete(sessionId);
    void this.companions.cancelVisitDownload(sessionId);
  }

  private isTerminalHeartbeatError(error: unknown): boolean {
    const code = error instanceof Error ? error.message : String(error);
    return ['VISIT_SESSION_NOT_FOUND', 'VISIT_SESSION_NOT_PARTICIPANT', 'VISIT_SESSION_STATE_CHANGED', 'AUTHENTICATION_REQUIRED', 'ONLINE_MODE_DISABLED'].some(value => code.includes(value));
  }

  private heartbeatIntervalMs(): number {
    const interval = this.network.getStatusSnapshot().visit?.heartbeatIntervalSeconds;
    return typeof interval === 'number' && Number.isInteger(interval) && interval >= 5 && interval <= 60 ? interval * 1_000 : 15_000;
  }
}
