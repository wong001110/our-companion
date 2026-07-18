import type {
  CompanionAssetManifest,
  VisualVisitRenderModel,
  VisualVisitRendererError,
  VisualVisitRendererState,
  VisitSessionSummary
} from '@our-companion/shared';
import type { NetworkConnectionService } from '../networkConnection';
import type { PublicCompanionService } from './publicCompanionService';
import type { VisitService } from './visitService';

const REQUIRED_ANIMATIONS = ['Idle_Neutral', 'Enter', 'Leave', 'Walk_Left', 'Walk_Right', 'Walk_Up', 'Walk_Down'] as const;

/**
 * Main-process S5 coordinator. It owns only Visit lifecycle and the sanitized
 * render contract; all position updates and movement remain local to the host
 * renderer and are never sent through the network.
 */
export class VisualVisitService {
  private readonly capacity: number;
  private state: VisualVisitRendererState;
  private reconcilePromise?: Promise<void>;
  private reconcileRequested = false;

  constructor(
    private readonly network: Pick<NetworkConnectionService, 'getStatusSnapshot'>,
    private readonly visits: Pick<VisitService, 'listSessions' | 'listInvitations'>,
    private readonly companions: Pick<PublicCompanionService, 'getLocalCompanionId' | 'getVerifiedVisitVisualManifest' | 'readVerifiedCachedAsset'>,
    private readonly publish: (state: VisualVisitRendererState) => void = () => {},
    capacity = 2,
  ) {
    this.capacity = clampPositiveInt(capacity, 2);
    this.state = this.emptyState();
  }

  getState = (): VisualVisitRendererState => cloneState(this.state);

  /**
   * The protocol handler delegates here so a stale renderer URL cannot read a
   * previously cached Pack after its authoritative Visit becomes terminal.
   */
  readVerifiedCachedAsset = (sessionId: string, assetPackId: string, relativePath: string): { bytes: Buffer; mimeType: string } => {
    const visitor = this.state.visitors[sessionId] ?? this.state.departingVisitors[sessionId];
    if (!visitor || visitor.assetPackId !== assetPackId) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    return this.companions.readVerifiedCachedAsset(assetPackId, relativePath);
  };

  /** Renderer failures are local-only: remove this runtime but retain the authoritative Visit session. */
  reportRendererFailure = (sessionId: string): void => {
    if (!(sessionId in this.state.visitors)) return;
    const next = cloneState(this.state);
    delete next.visitors[sessionId];
    next.visitorOrder = next.visitorOrder.filter((id) => id !== sessionId);
    next.errors = { ...next.errors, [sessionId]: 'VISUAL_VISIT_RENDERER_UNAVAILABLE' };
    this.setState(next);
  };

  completeRendererDeparture = (sessionId: string): void => {
    if (!(sessionId in this.state.departingVisitors)) return;
    const next = cloneState(this.state);
    delete next.departingVisitors[sessionId];
    this.setState(next);
  };

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
      await this.reconcileOnce();
    } while (this.reconcileRequested);
  };

  stopSession = (sessionId: string, _reason?: string): void => {
    if (!(sessionId in this.state.visitors) && !(sessionId in this.state.errors)) return;
    const next = cloneState(this.state);
    delete next.visitors[sessionId];
    next.visitorOrder = next.visitorOrder.filter((id) => id !== sessionId);
    delete next.errors[sessionId];
    this.setState(next);
  };

  /** A socket gap removes potentially stale host rendering without returning an active owner home. */
  pauseForReconnect = (): void => {
    if (
      this.state.visitorOrder.length === 0
      && Object.keys(this.state.departingVisitors).length === 0
      && Object.keys(this.state.errors).length === 0
    ) return;
    // A reconnect has no authority to continue serving a prior Visitor's
    // Pack, including its Leave animation. Reconciliation will restore only
    // the sessions that remain authoritatively active.
    this.setState({ ...this.state, visitors: {}, departingVisitors: {}, visitorOrder: [], errors: {} });
  };

  stopAll = (_reason?: string): void => this.setState(this.emptyState());

  /** Test-only state injection, exposed exclusively through the smoke IPC surface. */
  setOwnerPresenceModeForSmoke = (ownerPresenceMode: VisualVisitRendererState['ownerPresenceMode']): void => {
    this.setState({ ...this.state, ownerPresenceMode });
  };

  private async reconcileOnce(): Promise<void> {
    const status = this.network.getStatusSnapshot();
    if (status.state !== 'online' || !status.account || !status.features?.visualVisits) {
      this.stopAll('offline_or_unavailable');
      return;
    }
    const account = status.account;

    const sessions = await this.visits.listSessions();
    const allHostSessions = sessions
      .filter((session) => session.state === 'active' && session.hostUserId === account.id)
      .sort((left, right) => {
        const leftTime = Date.parse(left.startedAt ?? left.createdAt);
        const rightTime = Date.parse(right.startedAt ?? right.createdAt);
        if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return left.id.localeCompare(right.id);
        if (Number.isNaN(leftTime)) return 1;
        if (Number.isNaN(rightTime)) return -1;
        if (leftTime !== rightTime) return leftTime - rightTime;
        return left.id.localeCompare(right.id);
      });
    const hostSessions = allHostSessions.slice(0, this.capacity);

    const ownerSessions = sessions.filter((session) => session.state === 'active' && session.visitorOwnerUserId === account.id);

    if (!hostSessions.length && !ownerSessions.length) {
      const next = this.emptyState();
      // Preserve departures already being animated while adding each newly
      // terminal Visitor. A second server event must not revoke the first
      // Visitor's Leave asset before its renderer acknowledgement.
      next.departingVisitors = { ...this.state.departingVisitors, ...this.state.visitors };
      this.setState(next);
      return;
    }

    const invitations = await this.visits.listInvitations();
    const next = this.emptyState();
    next.departingVisitors = cloneState(this.state).departingVisitors;

    for (const overflow of allHostSessions.slice(this.capacity)) {
      next.errors[overflow.id] = 'VISUAL_VISIT_CAPACITY_REACHED';
    }

    for (const ownerSession of ownerSessions) {
      try {
        const localCompanionId = await this.companions.getLocalCompanionId(ownerSession.networkCompanionId);
        if (localCompanionId) {
          next.ownerPresenceMode = 'away_visiting';
        } else {
          next.errors[ownerSession.id] = 'VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE';
        }
      } catch {
        next.errors[ownerSession.id] = 'VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE';
      }
    }

    // A local Companion cannot be away and host guests at the same time. The
    // network must prevent this race, but the renderer must never show it.
    if (next.ownerPresenceMode === 'away_visiting' && hostSessions.length) {
      for (const hostSession of hostSessions) next.errors[hostSession.id] = 'VISUAL_VISIT_HOST_AWAY_CONFLICT';
      this.setState(next);
      return;
    }

    const hostResults = await Promise.all(hostSessions.map((session, slotIndex) =>
      this.buildHostVisitRenderModel(session, slotIndex, invitations)
    ));
    const activeHostSessionIds: string[] = [];
    for (const result of hostResults) {
      if (result.visitor) {
        next.visitors[result.sessionId] = result.visitor;
        activeHostSessionIds.push(result.sessionId);
      } else if (result.error) {
        next.errors[result.sessionId] = result.error;
      }
    }

    next.visitorOrder = activeHostSessionIds;
    for (const [sessionId, visitor] of Object.entries(this.state.visitors)) {
      if (!next.visitors[sessionId]) next.departingVisitors[sessionId] = visitor;
    }
    // A session that became active again owns a live runtime, not a stale
    // departure runtime with the same identity.
    for (const sessionId of activeHostSessionIds) delete next.departingVisitors[sessionId];
    this.setState(next);
  }

  private async buildHostVisitRenderModel(
    session: VisitSessionSummary,
    slotIndex: number,
    invitations: Array<{ id: string; companionName: string }>,
  ): Promise<{ sessionId: string; visitor?: VisualVisitRenderModel; error?: VisualVisitRendererError }> {
    try {
      const [manifest] = await Promise.all([
        this.companions.getVerifiedVisitVisualManifest({ sessionId: session.id, assetPackId: session.assetPackId, networkCompanionId: session.networkCompanionId }),
      ]);
      const invitation = invitations.find((candidate) => candidate.id === session.invitationId);
      if (!invitation || !supportsVisualManifest(manifest)) {
        return { sessionId: session.id, error: 'VISUAL_VISIT_ASSET_UNAVAILABLE' };
      }

      const current = this.state.visitors[session.id];
      const model = createRenderModel(session, invitation.companionName, manifest, slotIndex);
      if (current) {
        model.x = current.x;
        model.y = current.y;
        model.facing = current.facing;
        model.state = current.state;
        model.animationName = current.animationName;
      }
      return { sessionId: session.id, visitor: model };
    } catch {
      return { sessionId: session.id, error: 'VISUAL_VISIT_ASSET_UNAVAILABLE' };
    }
  }

  private setState(next: VisualVisitRendererState): void {
    const normalized = cloneState({ ...this.emptyState(), ...next, capacity: this.capacity });
    if (JSON.stringify(this.state) === JSON.stringify(normalized)) return;
    this.state = normalized;
    this.publish(cloneState(this.state));
  }

  private emptyState(): VisualVisitRendererState {
    return {
      ownerPresenceMode: 'home',
      capacity: this.capacity,
      visitors: {},
      departingVisitors: {},
      visitorOrder: [],
      errors: {},
    };
  }
}

function supportsVisualManifest(manifest: CompanionAssetManifest): boolean {
  const names = new Set(manifest.runtime.animations.map((animation) => animation.name));
  return REQUIRED_ANIMATIONS.every((name) => names.has(name));
}

function createRenderModel(
  session: VisitSessionSummary,
  name: string,
  manifest: CompanionAssetManifest,
  sceneSlotIndex: number,
): VisualVisitRenderModel {
  const animations = new Map(manifest.runtime.animations.map((animation) => [animation.name, animation]));
  const assetUrls: Record<string, string> = {};
  const frameTiming: VisualVisitRenderModel['frameTiming'] = {};
  for (const [animationName, animation] of animations) {
    const source = animation.files[0];
    if (!source) continue;
    assetUrls[animationName] = `companion-network://${session.id}/${session.assetPackId}/${source}`;
    if (typeof animation.frameDurationMs === 'number' && animation.frameDurationMs > 0) {
      frameTiming[animationName] = { frameDurationMs: animation.frameDurationMs, loop: animation.loop };
    }
  }
  for (const required of REQUIRED_ANIMATIONS) {
    if (!assetUrls[required] || !frameTiming[required]) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
  }

  return {
    runtimeId: `visit:${session.id}`,
    sessionId: session.id,
    networkCompanionId: session.networkCompanionId,
    assetPackId: session.assetPackId,
    name: name.slice(0, 120),
    role: 'remote_visitor',
    state: 'entering',
    animationName: 'Enter',
    x: 0,
    y: 0,
    facing: 'left',
    sceneSlotIndex,
    assetUrls,
    frameTiming,
  };
}

function clampPositiveInt(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function cloneState(state: VisualVisitRendererState): VisualVisitRendererState {
  return JSON.parse(JSON.stringify(state)) as VisualVisitRendererState;
}
