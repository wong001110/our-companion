import type { VisitInvitationStatus, VisitInvitationSummary, VisitSessionSummary } from '@our-companion/shared';
import type { NetworkConnectionService } from '../networkConnection';
import type { PublicCompanionService } from './publicCompanionService';

const HEARTBEAT_MS = 15_000;
const LIVE_STATES = new Set<VisitSessionSummary['state']>(['preparing', 'ready', 'active']);

/** Main-process-only S4 coordinator. It deliberately returns only sanitized REST summaries. */
export class VisitService {
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly heartbeatFailures = new Map<string, number>();
  private readonly preparePromises = new Map<string, Promise<VisitSessionSummary>>();
  private reconcilePromise?: Promise<void>;

  constructor(private readonly network: NetworkConnectionService, private readonly companions: PublicCompanionService) {}

  listInvitations = (input?: { direction?: 'incoming' | 'outgoing'; status?: VisitInvitationStatus }): Promise<VisitInvitationSummary[]> => this.network.listVisitInvitations(input);
  sendInvitation = (hostUserId: string): Promise<VisitInvitationSummary> => this.network.createVisitInvitation(hostUserId);
  acceptInvitation = async (invitationId: string) => {
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
    if (this.reconcilePromise) return this.reconcilePromise;
    this.reconcilePromise = this.listSessions().then(() => undefined).finally(() => { this.reconcilePromise = undefined; });
    return this.reconcilePromise;
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
      await this.companions.downloadVisitPack({ sessionId, assetPackId: session.assetPackId, networkCompanionId: session.networkCompanionId });
    } else {
      throw new Error('VISIT_SESSION_NOT_PARTICIPANT');
    }
    const updated = await this.network.markVisitReady(sessionId);
    this.track(updated);
    return updated;
  };

  start = async (sessionId: string): Promise<VisitSessionSummary> => {
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
    this.heartbeatTimers.set(session.id, setInterval(() => void heartbeat(), HEARTBEAT_MS));
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
}
