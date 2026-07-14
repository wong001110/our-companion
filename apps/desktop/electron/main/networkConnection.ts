import { randomUUID } from 'node:crypto';
import { safeStorage } from 'electron';
import { io, type Socket } from 'socket.io-client';
import type { DatabaseService } from '@our-companion/database';
import { hashSmokeDeviceId, isSmokeTestRuntime } from './platform/smokeRuntime';
import type { BlockedUserSummary, CompanionAssetManifestV1, CompleteAssetPackResult, FriendPresence, FriendRequestSummary, FriendSummary, NetworkAssetPack, PublicCompanionProfile, VisitInvitationStatus, VisitInvitationSummary, VisitRuntimeConfig, VisitSessionSummary, VisitSessionState } from '@our-companion/shared';

export const NETWORK_PROTOCOL_VERSION = '0.4';
export const NETWORK_CLIENT_VERSION = '0.4.0';
export type NetworkConnectionState = 'offline' | 'checking_server' | 'authentication_required' | 'connecting' | 'online' | 'reconnecting' | 'incompatible_client' | 'server_unavailable' | 'authentication_failed' | 'disabled';
export interface NetworkAccount { id: string; email: string; username: string; friendCode: string; }
export type SocialInvalidation =
  | { type: 'friends' }
  | { type: 'presence'; userId: string; status: FriendPresence; updatedAt: string | null }
  | { type: 'companion_profile'; ownerUserId: string; companionId: string; unpublished?: boolean }
  | { type: 'companion_asset_pack'; ownerUserId: string; companionId: string; assetPackId: string }
  | { type: 'visit_invitation'; invitationId: string }
  | { type: 'visit_session'; sessionId: string; state?: VisitSessionState };
export interface NetworkStatus {
  state: NetworkConnectionState;
  onlineModeEnabled: boolean;
  serverUrl: string;
  account?: NetworkAccount;
  message?: string;
  remoteRevocationConfirmed?: boolean;
  socialRevision?: number;
  socialInvalidation?: SocialInvalidation;
  features?: { visitInvitations: boolean; visitSessions: boolean; [feature: string]: boolean };
  visit?: VisitRuntimeConfig;
}
export interface StoredNetworkSession { serverOrigin: string; accessToken: string; refreshToken: string; }

interface ApiResponse<T> { data: T; }
interface AuthResult { user: NetworkAccount; accessToken: string; refreshToken: string; }
interface SocketLike { on(event: string, listener: (...args: any[]) => void): SocketLike; emit?(event: string, ...args: any[]): SocketLike; connect(): SocketLike; disconnect(): SocketLike; }
interface ServiceDependencies {
  fetch: typeof fetch;
  createSocket: (url: string, options: Record<string, unknown>) => SocketLike;
  secureStorage: Pick<typeof safeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'>;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

const SESSION_KEY = 'network.secure-session';
const URL_KEY = 'network.server-url';
const DEVICE_KEY = 'network.device-id';
const MODE_KEY = 'network.online-mode-enabled';
const RECONNECT_ATTEMPT_KEY = 'network.reconnect-attempt';
const unavailableSecureStorage: ServiceDependencies['secureStorage'] = {
  isEncryptionAvailable: () => false,
  encryptString: () => { throw new Error('SECURE_STORAGE_UNAVAILABLE'); },
  decryptString: () => { throw new Error('SECURE_STORAGE_UNAVAILABLE'); },
};
const defaultSecureStorage = (() => {
  try { return safeStorage; } catch { return unavailableSecureStorage; }
})();
const defaultDependencies: ServiceDependencies = { fetch, createSocket: (url, options) => io(url, options as Parameters<typeof io>[1]), secureStorage: defaultSecureStorage, setTimeout, clearTimeout };

export class NetworkConnectionService {
  private socket?: SocketLike;
  private reconnectTimer?: NodeJS.Timeout;
  private status: NetworkStatus;
  private session?: StoredNetworkSession;
  private refreshPromise?: Promise<boolean>;
  private enablePromise?: Promise<NetworkStatus>;
  private socketRefreshAttempted = false;
  private socialRevision = 0;
  private lastPresenceActivityAt = 0;
  private transferLifecycleHandler?: (reason: string) => void;

  constructor(
    private readonly db: DatabaseService,
    private readonly notify: (status: NetworkStatus) => void = () => {},
    private readonly deps: ServiceDependencies = defaultDependencies,
  ) {
    this.status = { state: this.enabled ? 'offline' : 'disabled', onlineModeEnabled: this.enabled, serverUrl: this.serverUrl };
  }

  getStatus = async (): Promise<NetworkStatus> => ({ ...this.status });
  getStatusSnapshot = (): NetworkStatus => ({ ...this.status });

  getSmokeDeviceIdHash = (): string => {
    if (!isSmokeTestRuntime()) throw new Error('SMOKE_TEST_UNAVAILABLE');
    return hashSmokeDeviceId(this.deviceId);
  };

  /** Exercises the same compatibility-refresh reconnect path as an unexpected transport drop. */
  disconnectSocketForSmoke = (): void => {
    if (!isSmokeTestRuntime()) throw new Error('SMOKE_TEST_UNAVAILABLE');
    this.socket?.disconnect();
    this.scheduleReconnect(new Error('smoke_socket_disconnect'));
  };

  configureServer = async (serverUrl: string): Promise<NetworkStatus> => {
    const normalized = normalizeServerUrl(serverUrl);
    if (normalized === this.serverUrl) return this.getStatus();
    this.transferLifecycleHandler?.('server_changed');
    this.clearReconnectTimer();
    this.socket?.disconnect();
    this.socket = undefined;
    this.clearSession();
    this.db.setAppSetting(URL_KEY, normalized);
    this.setStatus({ state: this.enabled ? 'authentication_required' : 'disabled', serverUrl: normalized, message: undefined, remoteRevocationConfirmed: undefined });
    return this.getStatus();
  };

  register = async (input: { email: string; username: string; password: string }): Promise<NetworkStatus> => {
    try {
      await this.checkCompatibility();
      const result = await this.publicRequest<AuthResult>('/api/auth/register', { ...input, deviceId: this.deviceId });
      await this.acceptAuthentication(result);
      return this.enableAuthenticatedConnection();
    } catch (error) {
      this.setStatus({ state: this.statusFor(error, 'authentication_failed'), message: messageFor(error) });
      throw error;
    }
  };

  login = async (input: { email: string; password: string }): Promise<NetworkStatus> => {
    try {
      await this.checkCompatibility();
      const result = await this.publicRequest<AuthResult>('/api/auth/login', { ...input, deviceId: this.deviceId });
      await this.acceptAuthentication(result);
      return this.enableAuthenticatedConnection();
    } catch (error) {
      this.setStatus({ state: this.statusFor(error, 'authentication_failed'), message: messageFor(error) });
      throw error;
    }
  };

  enableOnlineMode = async (): Promise<NetworkStatus> => {
    if (this.enablePromise) return this.enablePromise;
    this.enablePromise = this.enableOnlineModeInternal().finally(() => { this.enablePromise = undefined; });
    return this.enablePromise;
  };

  private async enableOnlineModeInternal(): Promise<NetworkStatus> {
    this.db.setAppSetting(MODE_KEY, true);
    this.setStatus({ onlineModeEnabled: true, state: 'checking_server', message: undefined });
    try {
      await this.checkCompatibility();
      if (!(await this.restoreSession())) {
        this.setStatus({ state: 'authentication_required', message: undefined });
        return this.getStatus();
      }
      await this.connectSocket();
    } catch (error) {
      this.setStatus({ state: this.statusFor(error, 'server_unavailable'), message: messageFor(error) });
    }
    return this.getStatus();
  }

  disableOnlineMode = async (): Promise<NetworkStatus> => {
    this.transferLifecycleHandler?.('online_mode_disabled');
    this.db.setAppSetting(MODE_KEY, false);
    this.stopSocket();
    this.resetReconnectAttempts();
    this.setStatus({ onlineModeEnabled: false, state: 'disabled', message: undefined });
    return this.getStatus();
  };

  logout = async (): Promise<NetworkStatus> => {
    this.transferLifecycleHandler?.('logout');
    let remoteRevocationConfirmed = false;
    try {
      if (this.session) {
        await this.authenticatedRequest('/api/auth/logout', { body: { deviceId: this.deviceId } });
        remoteRevocationConfirmed = true;
      }
    } catch { /* local logout is allowed, but the result remains explicitly unconfirmed */ }
    this.stopSocket();
    this.clearSession();
    this.resetReconnectAttempts();
    const onlineModeEnabled = this.enabled;
    this.setStatus({
      onlineModeEnabled,
      state: onlineModeEnabled ? 'authentication_required' : 'disabled',
      remoteRevocationConfirmed,
      message: remoteRevocationConfirmed ? undefined : 'Remote session revocation was not confirmed.',
    });
    return this.getStatus();
  };

  retryConnection = async (): Promise<NetworkStatus> => {
    if (!this.enabled) return this.getStatus();
    this.resetReconnectAttempts();
    return this.enableOnlineMode();
  };

  lookupFriend = (friendCode: string) => this.socialRequest<{ id: string; username: string; friendCode: string; relationship: string }>(`/api/friends/lookup/${encodeURIComponent(friendCode)}`);
  getFriends = async (): Promise<FriendSummary[]> => (await this.socialRequest<Array<{ id: string; username: string; friendCode: string; hasPublishedCompanion: boolean }>>('/api/friends')).map((friend) => ({ userId: friend.id, username: friend.username, friendCode: friend.friendCode, presence: 'offline', hasPublishedCompanion: friend.hasPublishedCompanion }));
  getIncomingRequests = async (): Promise<FriendRequestSummary[]> => (await this.socialRequest<Array<any>>('/api/friends/requests/incoming')).map((request) => ({ id: request.id, direction: 'incoming', userId: request.sender.id, username: request.sender.username, friendCode: request.sender.friendCode, status: 'pending', createdAt: request.createdAt }));
  getOutgoingRequests = async (): Promise<FriendRequestSummary[]> => (await this.socialRequest<Array<any>>('/api/friends/requests/outgoing')).map((request) => ({ id: request.id, direction: 'outgoing', userId: request.receiver.id, username: request.receiver.username, friendCode: request.receiver.friendCode, status: 'pending', createdAt: request.createdAt }));
  sendFriendRequest = (userId: string) => this.socialRequest('/api/friends/requests', { receiverId: userId });
  acceptFriendRequest = (requestId: string) => this.socialRequest(`/api/friends/requests/${requestId}/accept`, {});
  rejectFriendRequest = (requestId: string) => this.socialRequest(`/api/friends/requests/${requestId}/reject`, {});
  cancelFriendRequest = (requestId: string) => this.socialRequest(`/api/friends/requests/${requestId}/cancel`, {});
  removeFriend = (userId: string) => this.socialRequest(`/api/friends/${userId}`, undefined, 'DELETE');
  getBlocks = () => this.socialRequest<BlockedUserSummary[]>('/api/blocks');
  blockUser = (userId: string) => this.socialRequest('/api/blocks', { userId });
  unblockUser = (userId: string) => this.socialRequest(`/api/blocks/${userId}`, undefined, 'DELETE');
  getFriendPresence = () => this.socialRequest<Array<{ userId: string; status: FriendPresence; updatedAt?: string | null }>>('/api/presence/friends');
  sendPresenceActivity = async (): Promise<void> => {
    const now = Date.now();
    if (!this.enabled || this.status.state !== 'online' || now - this.lastPresenceActivityAt < 10_000) return;
    this.lastPresenceActivityAt = now;
    this.socket?.emit?.('presence.activity');
  };
  getMyCompanions = () => this.socialRequest<{ activeNetworkCompanionId?: string; companions: Array<PublicCompanionProfile & { assetPacks: NetworkAssetPack[] }> }>('/api/companions/mine');
  createNetworkCompanion = (input: { name: string; publicDescription?: string; publicTags?: string[] }) => this.socialRequest<{ networkCompanionId: string; companion: PublicCompanionProfile }>('/api/companions', input);
  updateNetworkCompanion = (companionId: string, input: { name: string; publicDescription?: string; publicTags?: string[] }) => this.socialRequest<PublicCompanionProfile>(`/api/companions/${companionId}`, input, 'PATCH');
  activateNetworkCompanion = (companionId: string) => this.socialRequest<{ activeNetworkCompanionId: string; changed: boolean }>(`/api/companions/${companionId}/activate`, {});
  publishNetworkCompanion = (companionId: string) => this.socialRequest<PublicCompanionProfile>(`/api/companions/${companionId}/publish`, {});
  unpublishNetworkCompanion = (companionId: string) => this.socialRequest<PublicCompanionProfile>(`/api/companions/${companionId}/unpublish`, {});
  getFriendCompanion = (friendUserId: string) => this.socialRequest<PublicCompanionProfile>(`/api/friends/${friendUserId}/companion`);
  initiateAssetPack = (companionId: string, input: { schemaVersion: 1; manifestHash: string; totalFiles: number; totalBytes: number; manifest: CompanionAssetManifestV1 }) => this.socialRequest<{ reused: boolean; resumed?: boolean; requiresActivation?: boolean; assetPack: NetworkAssetPack; fileIds?: string[] }>(`/api/companions/${companionId}/asset-packs`, input);
  getUploadUrls = (assetPackId: string, fileIds: string[]) => this.socialRequest<{ uploads: Array<{ fileId: string; relativePath: string; uploadUrl: string; expiresAt: string; requiredHeaders: { 'content-type': string; 'x-amz-meta-sha256': string } }> }>(`/api/asset-packs/${assetPackId}/upload-urls`, { fileIds });
  completeAssetPack = (assetPackId: string) => this.socialRequest<CompleteAssetPackResult>(`/api/asset-packs/${assetPackId}/complete`, {});
  activateAssetPack = (assetPackId: string) => this.socialRequest<PublicCompanionProfile>(`/api/asset-packs/${assetPackId}/activate`, {});
  getAssetPackManifest = (assetPackId: string) => this.socialRequest<{ manifest: CompanionAssetManifestV1; files: Array<{ id: string; relativePath: string; sizeBytes: number; sha256: string; mimeType: string }> }>(`/api/asset-packs/${assetPackId}/manifest`);
  getDownloadUrls = (assetPackId: string, fileIds: string[]) => this.socialRequest<{ downloads: Array<{ fileId: string; relativePath: string; downloadUrl: string; expiresAt: string; sizeBytes: number; sha256: string; mimeType: string }> }>(`/api/asset-packs/${assetPackId}/download-urls`, { fileIds });
  listVisitInvitations = (input: { direction?: 'incoming' | 'outgoing'; status?: VisitInvitationStatus } = {}) => {
    const params = new URLSearchParams(); if (input.direction) params.set('direction', input.direction); if (input.status) params.set('status', input.status);
    return this.socialRequest<VisitInvitationSummary[]>(`/api/visit-invitations${params.size ? `?${params}` : ''}`);
  };
  createVisitInvitation = (hostUserId: string) => this.socialRequest<VisitInvitationSummary>('/api/visit-invitations', { hostUserId });
  acceptVisitInvitation = (invitationId: string) => this.socialRequest<{ invitation: VisitInvitationSummary; session: VisitSessionSummary }>(`/api/visit-invitations/${invitationId}/accept`, {});
  declineVisitInvitation = (invitationId: string) => this.socialRequest<VisitInvitationSummary>(`/api/visit-invitations/${invitationId}/decline`, {});
  cancelVisitInvitation = (invitationId: string) => this.socialRequest<VisitInvitationSummary>(`/api/visit-invitations/${invitationId}/cancel`, {});
  listVisitSessions = () => this.socialRequest<VisitSessionSummary[]>('/api/visit-sessions');
  getVisitSession = (sessionId: string) => this.socialRequest<VisitSessionSummary>(`/api/visit-sessions/${sessionId}`);
  markVisitReady = (sessionId: string) => this.socialRequest<VisitSessionSummary>(`/api/visit-sessions/${sessionId}/ready`, {});
  startVisitSession = (sessionId: string) => this.socialRequest<VisitSessionSummary>(`/api/visit-sessions/${sessionId}/start`, {});
  endVisitSession = (sessionId: string) => this.socialRequest<VisitSessionSummary>(`/api/visit-sessions/${sessionId}/end`, {});
  heartbeatVisitSession = (sessionId: string) => this.socialRequest<VisitSessionSummary>(`/api/visit-sessions/${sessionId}/heartbeat`, {});
  getVisitSessionManifest = (sessionId: string) => this.socialRequest<{ manifest: CompanionAssetManifestV1; files: Array<{ id: string; relativePath: string; sizeBytes: number; sha256: string; mimeType: string }> }>(`/api/visit-sessions/${sessionId}/assets/manifest`);
  getVisitSessionDownloadUrls = (sessionId: string, fileIds: string[]) => this.socialRequest<{ downloads: Array<{ fileId: string; relativePath: string; downloadUrl: string; expiresAt: string; sizeBytes: number; sha256: string; mimeType: string }> }>(`/api/visit-sessions/${sessionId}/assets/download-urls`, { fileIds });

  setTransferLifecycleHandler(handler: (reason: string) => void) { this.transferLifecycleHandler = handler; }
  dispose(): void { this.transferLifecycleHandler?.('app_shutdown'); this.stopSocket(); }

  private get enabled(): boolean { return this.db.getAppSetting<boolean>(MODE_KEY) ?? false; }
  private get serverUrl(): string {
    const stored = this.db.getAppSetting<string>(URL_KEY);
    if (stored) return stored;
    const smokeUrl = isSmokeTestRuntime() ? process.env.OUR_COMPANION_SMOKE_SERVER_URL : undefined;
    return smokeUrl ? normalizeServerUrl(smokeUrl) : 'http://localhost:3001';
  }
  private get deviceId(): string {
    const saved = this.db.getAppSetting<string>(DEVICE_KEY);
    if (saved) return saved;
    const id = randomUUID(); this.db.setAppSetting(DEVICE_KEY, id); return id;
  }

  private async enableAuthenticatedConnection(): Promise<NetworkStatus> {
    this.db.setAppSetting(MODE_KEY, true);
    this.setStatus({ onlineModeEnabled: true });
    await this.connectSocket();
    return this.getStatus();
  }

  private async checkCompatibility(): Promise<void> {
    const data = await this.request<{ compatible: boolean; reason?: string; features?: NetworkStatus['features']; visit?: unknown }>('/api/meta/client-compatibility');
    if (!data.compatible) throw new Error(data.reason ?? 'INCOMPATIBLE_CLIENT');
    this.setStatus({ features: data.features, visit: sanitizeVisitRuntimeConfig(data.visit) });
  }

  private async acceptAuthentication(result: AuthResult): Promise<void> {
    this.session = { serverOrigin: this.serverUrl, accessToken: result.accessToken, refreshToken: result.refreshToken };
    this.writeSession(this.session);
    this.setStatus({ account: result.user, remoteRevocationConfirmed: undefined, message: undefined });
    await this.loadAccount();
  }

  private async restoreSession(): Promise<boolean> {
    const session = this.readSession();
    if (!session || session.serverOrigin !== this.serverUrl) {
      if (session) this.clearSession();
      return false;
    }
    this.session = session;
    if (!(await this.refreshSession())) return false;
    try { await this.loadAccount(); return true; }
    catch { this.handleAuthenticationLoss('session_restoration_rejected'); return false; }
  }

  private async refreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      if (!this.session || this.session.serverOrigin !== this.serverUrl) return false;
      try {
        const result = await this.publicRequest<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', { refreshToken: this.session.refreshToken, deviceId: this.deviceId });
        this.session = { ...this.session, ...result };
        this.writeSession(this.session);
        return true;
      } catch { this.handleAuthenticationLoss('session_refresh_failed'); return false; }
    })().finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }

  private async loadAccount(): Promise<void> {
    const account = await this.authenticatedRequest<NetworkAccount>('/api/auth/me');
    this.setStatus({ account });
  }

  private async connectSocket(): Promise<void> {
    if (!this.enabled || !this.session || this.session.serverOrigin !== this.serverUrl) return;
    this.clearReconnectTimer();
    this.socket?.disconnect();
    this.setStatus({ state: 'connecting', message: undefined });
    const socket = this.deps.createSocket(this.serverUrl, {
      autoConnect: false, transports: ['websocket'], reconnection: false,
      auth: { token: this.session.accessToken, deviceId: this.deviceId, protocolVersion: NETWORK_PROTOCOL_VERSION },
    });
    this.socket = socket;
    socket.on('connect', () => { this.socketRefreshAttempted = false; this.resetReconnectAttempts(); this.setStatus({ state: 'online', message: undefined }); });
    socket.on('connect_error', (error) => { void this.handleSocketFailure(error); });
    socket.on('disconnect', (reason) => { if (this.enabled && reason !== 'io client disconnect') void this.handleSocketFailure(new Error(String(reason))); });
    for (const event of ['friend.request.created', 'friend.request.updated', 'friendship.created', 'friendship.removed', 'block.created', 'block.removed']) {
      socket.on(event, () => this.setStatus({ socialRevision: ++this.socialRevision, socialInvalidation: { type: 'friends' } }));
    }
    socket.on('presence.updated', (payload: Partial<{ userId: string; status: FriendPresence; updatedAt: string }>) => {
      if (!payload.userId || !payload.status) return;
      this.setStatus({ socialRevision: ++this.socialRevision, socialInvalidation: { type: 'presence', userId: payload.userId, status: payload.status, updatedAt: payload.updatedAt ?? null } });
    });
    socket.on('companion.profile.updated', (payload: Partial<{ ownerUserId: string; companionId: string }>) => {
      if (!payload.ownerUserId || !payload.companionId) return;
      this.setStatus({ socialRevision: ++this.socialRevision, socialInvalidation: { type: 'companion_profile', ownerUserId: payload.ownerUserId, companionId: payload.companionId } });
    });
    socket.on('companion.profile.unpublished', (payload: Partial<{ ownerUserId: string; companionId: string }>) => {
      if (!payload.ownerUserId || !payload.companionId) return;
      this.setStatus({ socialRevision: ++this.socialRevision, socialInvalidation: { type: 'companion_profile', ownerUserId: payload.ownerUserId, companionId: payload.companionId, unpublished: true } });
    });
    socket.on('companion.asset_pack.activated', (payload: Partial<{ ownerUserId: string; companionId: string; assetPackId: string }>) => {
      if (!payload.ownerUserId || !payload.companionId || !payload.assetPackId) return;
      this.setStatus({ socialRevision: ++this.socialRevision, socialInvalidation: { type: 'companion_asset_pack', ownerUserId: payload.ownerUserId, companionId: payload.companionId, assetPackId: payload.assetPackId } });
    });
    for (const event of ['visit.invitation.created', 'visit.invitation.updated']) {
      socket.on(event, (payload: Partial<{ invitationId: string }>) => { if (payload.invitationId) this.setStatus({ socialRevision: ++this.socialRevision, socialInvalidation: { type: 'visit_invitation', invitationId: payload.invitationId } }); });
    }
    for (const event of ['visit.session.created', 'visit.session.updated', 'visit.session.ended']) {
      socket.on(event, (payload: Partial<{ sessionId: string; state: VisitSessionState }>) => { if (payload.sessionId) this.setStatus({ socialRevision: ++this.socialRevision, socialInvalidation: { type: 'visit_session', sessionId: payload.sessionId, state: payload.state } }); });
    }
    socket.connect();
  }

  private async handleSocketFailure(error: unknown): Promise<void> {
    if (!this.enabled) return;
    const code = messageFor(error);
    if (isAuthenticationError(code) && !this.socketRefreshAttempted) {
      this.socketRefreshAttempted = true;
      if (await this.refreshSession()) { await this.connectSocket(); return; }
      this.setStatus({ state: 'authentication_required', message: undefined });
      return;
    }
    if (isAuthenticationError(code) && this.socketRefreshAttempted) { this.handleAuthenticationLoss('socket_authentication_rejected'); return; }
    this.scheduleReconnect(error);
  }

  private scheduleReconnect(error: unknown): void {
    if (!this.enabled || this.reconnectTimer) return;
    const attempt = Math.min(6, (this.db.getAppSetting<number>(RECONNECT_ATTEMPT_KEY) ?? 0) + 1);
    this.db.setAppSetting(RECONNECT_ATTEMPT_KEY, attempt);
    this.setStatus({ state: 'reconnecting', message: messageFor(error) });
    const delay = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
    this.reconnectTimer = this.deps.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.reconnectWithCompatibility();
    }, delay);
  }

  /**
   * Re-read server metadata before every automatic reconnect.  VisitService
   * recreates its heartbeat timers after the socket reports online, so the
   * fresh runtime configuration is already available at that point.
   */
  private async reconnectWithCompatibility(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.checkCompatibility();
      await this.connectSocket();
    } catch (error) {
      this.scheduleReconnect(error);
    }
  }

  private clearReconnectTimer(): void { if (this.reconnectTimer) this.deps.clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
  private resetReconnectAttempts(): void { this.clearReconnectTimer(); this.db.setAppSetting(RECONNECT_ATTEMPT_KEY, 0); }
  private stopSocket(): void { this.clearReconnectTimer(); this.socket?.disconnect(); this.socket = undefined; }
  private handleAuthenticationLoss(reason = 'authentication_lost'): void {
    this.transferLifecycleHandler?.(reason);
    this.stopSocket();
    this.clearSession();
    this.resetReconnectAttempts();
    this.setStatus({ state: 'authentication_required', message: undefined });
  }
  private async authenticatedRequest<T>(path: string, options: { method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'; body?: unknown } = {}): Promise<T> {
    if (!this.session || this.session.serverOrigin !== this.serverUrl) throw new Error('AUTHENTICATION_REQUIRED');
    const { method, body } = options;
    try { return await this.request<T>(path, body, this.session.accessToken, method); }
    catch (error) {
      if (!isAuthenticationError(messageFor(error))) throw error;
      if (!(await this.refreshSession()) || !this.session) throw new Error('AUTHENTICATION_REQUIRED');
      try { return await this.request<T>(path, body, this.session.accessToken, method); }
      catch (retryError) {
        if (isAuthenticationError(messageFor(retryError))) { this.handleAuthenticationLoss('rest_authentication_rejected'); throw new Error('AUTHENTICATION_REQUIRED'); }
        throw retryError;
      }
    }
  }
  private async socialRequest<T = unknown>(path: string, body?: unknown, method?: 'DELETE' | 'PATCH'): Promise<T> {
    if (!this.enabled || !this.session || this.status.state === 'disabled') throw new Error('ONLINE_MODE_DISABLED');
    return this.authenticatedRequest<T>(path, { method, body });
  }
  private publicRequest<T>(path: string, body: unknown): Promise<T> { return this.request<T>(path, body); }
  private async request<T>(path: string, body?: unknown, accessToken?: string, method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'): Promise<T> {
    const response = await this.deps.fetch(`${this.serverUrl}${path}`, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: {
      'content-type': 'application/json', 'x-our-companion-client-version': NETWORK_CLIENT_VERSION, 'x-our-companion-protocol-version': NETWORK_PROTOCOL_VERSION, 'x-our-companion-device-id': this.deviceId, ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = await response.json() as ApiResponse<T> | { error?: { code?: string; message?: string } };
    if (!response.ok) throw new Error('error' in payload ? payload.error?.code ?? 'NETWORK_ERROR' : 'NETWORK_ERROR');
    return (payload as ApiResponse<T>).data;
  }
  private readSession(): StoredNetworkSession | undefined {
    const encoded = this.db.getAppSetting<string>(SESSION_KEY); if (!encoded || !this.deps.secureStorage.isEncryptionAvailable()) return undefined;
    try { return JSON.parse(this.deps.secureStorage.decryptString(Buffer.from(encoded, 'base64'))) as StoredNetworkSession; } catch { return undefined; }
  }
  private writeSession(session: StoredNetworkSession): void {
    if (!this.deps.secureStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
    this.db.setAppSetting(SESSION_KEY, this.deps.secureStorage.encryptString(JSON.stringify(session)).toString('base64'));
  }
  private clearSession(): void { this.session = undefined; this.db.setAppSetting(SESSION_KEY, ''); this.setStatus({ account: undefined }); }
  private setStatus(update: Partial<NetworkStatus>): void { this.status = { ...this.status, ...update, serverUrl: this.serverUrl }; this.notify({ ...this.status }); }
  private statusFor(error: unknown, fallback: NetworkConnectionState): NetworkConnectionState { const code = messageFor(error); return isIncompatible(code) ? 'incompatible_client' : code === 'AUTHENTICATION_FAILED' ? 'authentication_failed' : fallback; }
}

export function normalizeServerUrl(value: string): string {
  const url = new URL(value.trim());
  const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !(process.env.NODE_ENV === 'development' || localhost)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('INVALID_NETWORK_SERVER_URL');
  return url.origin;
}
function isIncompatible(code: string): boolean { return ['INCOMPATIBLE_CLIENT', 'UNSUPPORTED_PROTOCOL_VERSION', 'CLIENT_VERSION_TOO_OLD'].includes(code); }
function isAuthenticationError(code: string): boolean { return ['AUTHENTICATION_FAILED', 'AUTHENTICATION_REQUIRED', 'TOKEN_EXPIRED'].includes(code); }
function messageFor(error: unknown): string { return error instanceof Error ? error.message : 'NETWORK_ERROR'; }
export function sanitizeVisitRuntimeConfig(input: unknown): VisitRuntimeConfig | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = input as Partial<VisitRuntimeConfig>;
  const interval = value.heartbeatIntervalSeconds;
  const timeout = value.heartbeatTimeoutSeconds;
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 5 || interval > 60 || typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < Math.max(30, interval * 2, interval + 5) || timeout > 300) return undefined;
  return { heartbeatIntervalSeconds: interval, heartbeatTimeoutSeconds: timeout };
}
