import type {
  CompanionAssetManifest,
  SocialVisitPresentation,
  SocialVisitState,
  VisualVisitRenderModel,
  VisualVisitRendererError,
  VisualVisitRendererState,
  VisitRoomParticipant,
  VisitRoomState,
  VisitSessionSummary,
} from '@our-companion/shared';
import type { NetworkConnectionService } from '../networkConnection';
import type { PublicCompanionService } from './publicCompanionService';
import type { VisitService } from './visitService';

const REQUIRED_ANIMATIONS = ['Idle_Neutral', 'Enter', 'Leave', 'Walk_Left', 'Walk_Right', 'Walk_Up', 'Walk_Down'] as const;

/** Main-process coordinator for sanitized, room-aware remote Companion rendering. */
export class VisualVisitService {
  private readonly capacity: number;
  private state: VisualVisitRendererState;
  private reconcilePromise?: Promise<void>;
  private reconcileRequested = false;
  private readonly acknowledgedTurnIds = new Set<string>();

  constructor(
    private readonly network: Pick<NetworkConnectionService, 'getStatusSnapshot'>,
    private readonly visits: Pick<VisitService, 'listSessions' | 'listInvitations' | 'getRoom' | 'getSocialState'>,
    private readonly companions: Pick<PublicCompanionService, 'getLocalCompanionId' | 'getVerifiedVisitVisualManifest' | 'getVerifiedVisitParticipantVisualManifest' | 'readVerifiedCachedAsset'>,
    private readonly publish: (state: VisualVisitRendererState) => void = () => {},
    capacity = 2,
  ) {
    this.capacity = clampPositiveInt(capacity, 2);
    this.state = this.emptyState();
  }

  getState = (): VisualVisitRendererState => cloneState(this.state);

  readVerifiedCachedAsset = (sessionId: string, assetPackId: string, relativePath: string): { bytes: Buffer; mimeType: string } => {
    const activeVisitor = Object.values(this.state.visitors).find((visitor) => visitor.sessionId === sessionId && visitor.assetPackId === assetPackId);
    const departingVisitor = Object.values(this.state.departingVisitors).find((visitor) => visitor.sessionId === sessionId && visitor.assetPackId === assetPackId);
    const visitor = activeVisitor ?? departingVisitor;
    if (!visitor || (departingVisitor && !activeVisitor && !isDepartureAsset(visitor, relativePath))) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    return this.companions.readVerifiedCachedAsset(assetPackId, relativePath);
  };

  reportRendererFailure = (runtimeId: string): void => {
    const visitor = this.state.visitors[runtimeId];
    if (!visitor) return;
    const next = cloneState(this.state);
    delete next.visitors[runtimeId];
    next.visitorOrder = next.visitorOrder.filter((id) => id !== runtimeId);
    next.errors = { ...next.errors, [visitor.sessionId]: 'VISUAL_VISIT_RENDERER_UNAVAILABLE' };
    this.setState(next);
  };

  completeRendererDeparture = (runtimeId: string): void => {
    if (!(runtimeId in this.state.departingVisitors)) return;
    const next = cloneState(this.state);
    delete next.departingVisitors[runtimeId];
    this.setState(next);
  };

  acknowledgePresentation = (turnId: string): void => {
    this.acknowledgedTurnIds.add(turnId);
    const next = cloneState(this.state);
    if (next.localPresentation?.turnId === turnId) delete next.localPresentation;
    for (const visitor of Object.values(next.visitors)) if (visitor.presentation?.turnId === turnId) delete visitor.presentation;
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
    const next = cloneState(this.state);
    let changed = false;
    for (const [runtimeId, visitor] of Object.entries(next.visitors)) {
      if (visitor.sessionId !== sessionId) continue;
      delete next.visitors[runtimeId];
      next.visitorOrder = next.visitorOrder.filter((id) => id !== runtimeId);
      changed = true;
    }
    delete next.errors[sessionId];
    if (next.localPresentation?.sessionId === sessionId) delete next.localPresentation;
    if (changed) this.setState(next);
  };

  pauseForReconnect = (): void => {
    if (!this.state.visitorOrder.length && !Object.keys(this.state.departingVisitors).length && !Object.keys(this.state.errors).length && !this.state.localPresentation) return;
    this.setState({ ...this.state, visitors: {}, departingVisitors: {}, visitorOrder: [], errors: {}, localPresentation: undefined });
  };

  stopAll = (_reason?: string): void => this.setState(this.emptyState());

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
    const sessions = (await this.visits.listSessions()).filter((session) => session.state === 'active');
    if (!sessions.length) {
      const next = this.emptyState();
      next.departingVisitors = { ...this.state.departingVisitors, ...this.state.visitors };
      this.setState(next);
      return;
    }

    const roomResults = await Promise.all(sessions.map(async (session) => ({
      session,
      room: typeof this.visits.getRoom === 'function'
        ? await this.visits.getRoom(session.id).catch(() => legacyRoom(session, account.id))
        : legacyRoom(session, account.id),
      social: typeof this.visits.getSocialState === 'function'
        ? await this.visits.getSocialState(session.id).catch(() => undefined)
        : undefined,
    })));
    const next = this.emptyState();
    next.departingVisitors = cloneState(this.state).departingVisitors;
    const renderCandidates: Array<{ session: VisitSessionSummary; participant: VisitRoomParticipant; social?: SocialVisitState }> = [];

    for (const result of roomResults) {
      const me = result.room.participants.find((participant) => participant.userId === account.id && participant.state !== 'left');
      if (!me) continue;
      const latestTurn = result.social?.turns.at(-1);
      if (latestTurn && latestTurn.senderUserId === account.id && !this.acknowledgedTurnIds.has(latestTurn.id)) {
        next.localPresentation = presentationFromTurn(result.session.id, latestTurn, 'Talk_Neutral');
      }
      if (me.role !== 'host') {
        try {
          if (await this.companions.getLocalCompanionId(me.networkCompanionId)) next.ownerPresenceMode = 'away_visiting';
          else next.errors[result.session.id] = 'VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE';
        } catch {
          next.errors[result.session.id] = 'VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE';
        }
        continue;
      }
      for (const participant of result.room.participants) {
        if (participant.userId === account.id || participant.state === 'left' || !participant.assetPackId) continue;
        renderCandidates.push({ session: result.session, participant, social: result.social });
      }
    }

    if (next.ownerPresenceMode === 'away_visiting' && renderCandidates.length) {
      for (const candidate of renderCandidates) next.errors[candidate.session.id] = 'VISUAL_VISIT_HOST_AWAY_CONFLICT';
      this.setState(next);
      return;
    }

    const acceptedCandidates = renderCandidates.slice(0, this.capacity);
    for (const overflow of renderCandidates.slice(this.capacity)) next.errors[overflow.session.id] = 'VISUAL_VISIT_CAPACITY_REACHED';
    const results = await Promise.all(acceptedCandidates.map((candidate, slotIndex) => this.buildParticipantRenderModel(candidate.session, candidate.participant, candidate.social, slotIndex)));
    for (const result of results) {
      if (result.visitor) {
        next.visitors[result.runtimeId] = result.visitor;
        next.visitorOrder.push(result.runtimeId);
        delete next.departingVisitors[result.runtimeId];
      } else if (result.error) next.errors[result.sessionId] = result.error;
    }

    for (const [runtimeId, visitor] of Object.entries(this.state.visitors)) {
      if (!next.visitors[runtimeId]) next.departingVisitors[runtimeId] = visitor;
    }
    this.setState(next);
  }

  private async buildParticipantRenderModel(
    session: VisitSessionSummary,
    participant: VisitRoomParticipant,
    social: SocialVisitState | undefined,
    slotIndex: number,
  ): Promise<{ runtimeId: string; sessionId: string; visitor?: VisualVisitRenderModel; error?: VisualVisitRendererError }> {
    const runtimeId = runtimeIdFor(session.id, participant.id);
    try {
      const manifest = typeof this.companions.getVerifiedVisitParticipantVisualManifest === 'function'
        ? await this.companions.getVerifiedVisitParticipantVisualManifest({ sessionId: session.id, participantId: participant.id, assetPackId: participant.assetPackId!, networkCompanionId: participant.networkCompanionId })
        : await this.companions.getVerifiedVisitVisualManifest({ sessionId: session.id, assetPackId: participant.assetPackId!, networkCompanionId: participant.networkCompanionId });
      if (!supportsVisualManifest(manifest)) return { runtimeId, sessionId: session.id, error: 'VISUAL_VISIT_ASSET_UNAVAILABLE' };
      const latestTurn = social?.turns.at(-1);
      const presentation = latestTurn && latestTurn.senderUserId === participant.userId && !this.acknowledgedTurnIds.has(latestTurn.id)
        ? presentationFromTurn(session.id, latestTurn, preferredTalkAnimation(latestTurn.emotion, manifest))
        : undefined;
      const current = this.state.visitors[runtimeId];
      const model = createRenderModel(session, participant, manifest, slotIndex, presentation);
      if (current) {
        model.x = current.x;
        model.y = current.y;
        model.facing = current.facing;
        model.state = presentation ? 'talking' : current.state === 'talking' || current.state === 'reacting' ? 'idle' : current.state;
        model.animationName = presentation?.animationName ?? current.animationName;
      }
      return { runtimeId, sessionId: session.id, visitor: model };
    } catch {
      return { runtimeId, sessionId: session.id, error: 'VISUAL_VISIT_ASSET_UNAVAILABLE' };
    }
  }

  private setState(next: VisualVisitRendererState): void {
    const normalized = cloneState({ ...this.emptyState(), ...next, capacity: this.capacity });
    if (JSON.stringify(this.state) === JSON.stringify(normalized)) return;
    this.state = normalized;
    this.publish(cloneState(this.state));
  }

  private emptyState(): VisualVisitRendererState {
    return { ownerPresenceMode: 'home', capacity: this.capacity, visitors: {}, departingVisitors: {}, visitorOrder: [], errors: {} };
  }
}

function legacyRoom(session: VisitSessionSummary, accountId: string): VisitRoomState {
  const localIsHost = session.hostUserId === accountId;
  return {
    session: { id: session.id, state: session.state, hostUserId: session.hostUserId, roomCapacity: 3, currentTopicSequence: 1, createdAt: session.createdAt, updatedAt: session.updatedAt },
    participants: [
      { id: `${session.id}:host`, userId: session.hostUserId, networkCompanionId: session.hostNetworkCompanionId ?? '', role: 'host', state: 'active', joinedAt: session.createdAt },
      { id: `${session.id}:visitor`, userId: session.visitorOwnerUserId, networkCompanionId: session.networkCompanionId, companionName: localIsHost ? undefined : 'Host Companion', assetPackId: session.assetPackId, role: 'visitor', state: 'active', joinedAt: session.createdAt },
    ],
    topics: [],
    pendingJoinRequests: [],
  };
}

function runtimeIdFor(sessionId: string, participantId: string): string { return `visit:${sessionId}:${participantId}`; }

function isDepartureAsset(visitor: VisualVisitRenderModel, relativePath: string): boolean {
  const leaveUrl = visitor.assetUrls.Leave;
  if (!leaveUrl) return false;
  try {
    const url = new URL(leaveUrl);
    return url.hostname === visitor.sessionId && url.pathname.slice(1) === `${visitor.assetPackId}/${relativePath}`;
  } catch { return false; }
}

function supportsVisualManifest(manifest: CompanionAssetManifest): boolean {
  const names = new Set(manifest.runtime.animations.map((animation) => animation.name));
  return REQUIRED_ANIMATIONS.every((name) => names.has(name));
}

function preferredTalkAnimation(emotion: string | undefined, manifest: CompanionAssetManifest): string {
  const available = new Set(manifest.runtime.animations.map((animation) => animation.name));
  const preferred = emotion === 'happy' ? 'Talk_Happy' : emotion === 'thoughtful' ? 'Talk_Thinking' : emotion === 'concerned' ? 'Talk_Concerned' : 'Talk_Neutral';
  return available.has(preferred) ? preferred : available.has('Talk_Neutral') ? 'Talk_Neutral' : 'Idle_Neutral';
}

function presentationFromTurn(sessionId: string, turn: SocialVisitState['turns'][number], animationName: string): SocialVisitPresentation {
  return { turnId: turn.id, sessionId, senderUserId: turn.senderUserId, message: turn.message, intent: turn.intent, emotion: turn.emotion, animationName };
}

function createRenderModel(
  session: VisitSessionSummary,
  participant: VisitRoomParticipant,
  manifest: CompanionAssetManifest,
  sceneSlotIndex: number,
  presentation?: SocialVisitPresentation,
): VisualVisitRenderModel {
  const animations = new Map(manifest.runtime.animations.map((animation) => [animation.name, animation]));
  const assetUrls: Record<string, string> = {};
  const frameTiming: VisualVisitRenderModel['frameTiming'] = {};
  for (const [animationName, animation] of animations) {
    const source = animation.files[0];
    if (!source) continue;
    assetUrls[animationName] = `companion-network://${session.id}/${participant.assetPackId}/${source}`;
    if (typeof animation.frameDurationMs === 'number' && animation.frameDurationMs > 0) frameTiming[animationName] = { frameDurationMs: animation.frameDurationMs, loop: animation.loop };
  }
  for (const required of REQUIRED_ANIMATIONS) if (!assetUrls[required] || !frameTiming[required]) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
  return {
    runtimeId: runtimeIdFor(session.id, participant.id),
    sessionId: session.id,
    participantId: participant.id,
    userId: participant.userId,
    participantRole: participant.role,
    networkCompanionId: participant.networkCompanionId,
    assetPackId: participant.assetPackId!,
    name: (participant.companionName ?? 'Friend Companion').slice(0, 120),
    role: 'remote_visitor',
    state: presentation ? 'talking' : 'entering',
    animationName: presentation?.animationName ?? 'Enter',
    presentation,
    x: 0,
    y: 0,
    facing: 'left',
    sceneSlotIndex,
    assetUrls,
    frameTiming,
  };
}

function clampPositiveInt(value: number, fallback: number): number { return Number.isInteger(value) && value > 0 ? value : fallback; }
function cloneState(state: VisualVisitRendererState): VisualVisitRendererState { return JSON.parse(JSON.stringify(state)) as VisualVisitRendererState; }
