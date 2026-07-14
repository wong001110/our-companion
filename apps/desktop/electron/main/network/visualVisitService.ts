import type { CompanionAssetManifestV1, VisualVisitRenderModel, VisualVisitRendererState, VisitSessionSummary } from '@our-companion/shared';
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
  private state: VisualVisitRendererState = { ownerPresenceMode: 'home' };
  private reconcilePromise?: Promise<void>;

  constructor(
    private readonly network: Pick<NetworkConnectionService, 'getStatusSnapshot'>,
    private readonly visits: Pick<VisitService, 'listSessions' | 'listInvitations'>,
    private readonly companions: Pick<PublicCompanionService, 'getLocalCompanionId' | 'getVerifiedVisitVisualManifest' | 'readVerifiedCachedAsset'>,
    private readonly publish: (state: VisualVisitRendererState) => void = () => {},
  ) {}

  getState = (): VisualVisitRendererState => cloneState(this.state);

  /**
   * The protocol handler delegates here so a stale renderer URL cannot read a
   * previously cached Pack after its authoritative Visit becomes terminal.
   */
  readVerifiedCachedAsset = (assetPackId: string, relativePath: string): { bytes: Buffer; mimeType: string } => {
    if (this.state.visitor?.assetPackId !== assetPackId) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    return this.companions.readVerifiedCachedAsset(assetPackId, relativePath);
  };

  /** Renderer failures are local-only: remove this runtime but retain the authoritative Visit Session. */
  reportRendererFailure = (sessionId: string): void => {
    if (this.state.visitor?.sessionId !== sessionId) return;
    this.setState({ ownerPresenceMode: 'home', error: 'VISUAL_VISIT_RENDERER_UNAVAILABLE' });
  };

  reconcile = async (): Promise<void> => {
    if (this.reconcilePromise) return this.reconcilePromise;
    this.reconcilePromise = this.reconcileOnce().finally(() => { this.reconcilePromise = undefined; });
    return this.reconcilePromise;
  };

  async handleSession(session: VisitSessionSummary): Promise<void> {
    const status = this.network.getStatusSnapshot();
    if (session.state !== 'active' || status.state !== 'online' || !status.account || !status.features?.visualVisits) {
      this.stopSession(session.id);
      return;
    }
    if (status.account.id === session.visitorOwnerUserId) {
      const localCompanionId = await this.companions.getLocalCompanionId(session.networkCompanionId);
      if (!localCompanionId) {
        this.setState({ ownerPresenceMode: 'home', error: 'VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE' });
        return;
      }
      this.setState({ ownerPresenceMode: 'away_visiting' });
      return;
    }
    if (status.account.id !== session.hostUserId) {
      this.stopSession(session.id);
      return;
    }
    try {
      const [manifest, invitations] = await Promise.all([
        this.companions.getVerifiedVisitVisualManifest({ sessionId: session.id, assetPackId: session.assetPackId, networkCompanionId: session.networkCompanionId }),
        this.visits.listInvitations(),
      ]);
      const invitation = invitations.find((candidate) => candidate.id === session.invitationId);
      if (!invitation || !supportsVisualManifest(manifest)) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
      this.setState({ ownerPresenceMode: 'home', visitor: createRenderModel(session, invitation.companionName, manifest) });
    } catch {
      this.setState({ ownerPresenceMode: 'home', error: 'VISUAL_VISIT_ASSET_UNAVAILABLE' });
    }
  }

  stopSession = (sessionId: string, _reason?: string): void => {
    if (this.state.visitor?.sessionId !== sessionId && this.state.ownerPresenceMode === 'home') return;
    this.setState({ ownerPresenceMode: 'home' });
  };

  /** A socket gap removes potentially stale host rendering without returning an active owner home. */
  pauseForReconnect = (): void => {
    if (!this.state.visitor) return;
    this.setState({ ownerPresenceMode: this.state.ownerPresenceMode });
  };

  stopAll = (_reason?: string): void => this.setState({ ownerPresenceMode: 'home' });

  /** Test-only state injection, exposed exclusively through the smoke IPC surface. */
  setOwnerPresenceModeForSmoke = (ownerPresenceMode: VisualVisitRendererState['ownerPresenceMode']): void => {
    this.setState({ ownerPresenceMode });
  };

  private async reconcileOnce(): Promise<void> {
    const status = this.network.getStatusSnapshot();
    if (status.state !== 'online' || !status.account || !status.features?.visualVisits) {
      this.stopAll('offline_or_unavailable');
      return;
    }
    const sessions = await this.visits.listSessions();
    const active = sessions.find((session) => session.state === 'active');
    if (!active) {
      this.stopAll('no_active_session');
      return;
    }
    await this.handleSession(active);
  }

  private setState(next: VisualVisitRendererState): void {
    const normalized = cloneState(next);
    if (JSON.stringify(this.state) === JSON.stringify(normalized)) return;
    this.state = normalized;
    this.publish(cloneState(this.state));
  }
}

function supportsVisualManifest(manifest: CompanionAssetManifestV1): boolean {
  const names = new Set(manifest.runtime.animations.map((animation) => animation.name));
  return REQUIRED_ANIMATIONS.every((name) => names.has(name));
}

function createRenderModel(session: VisitSessionSummary, name: string, manifest: CompanionAssetManifestV1): VisualVisitRenderModel {
  const animations = new Map(manifest.runtime.animations.map((animation) => [animation.name, animation]));
  const assetUrls: Record<string, string> = {};
  const frameTiming: VisualVisitRenderModel['frameTiming'] = {};
  for (const [animationName, animation] of animations) {
    const source = animation.files[0];
    if (!source) continue;
    assetUrls[animationName] = `companion-network://${session.assetPackId}/${source}`;
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
    assetUrls,
    frameTiming,
  };
}

function cloneState(state: VisualVisitRendererState): VisualVisitRendererState {
  return JSON.parse(JSON.stringify(state)) as VisualVisitRendererState;
}
