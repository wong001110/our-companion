import { randomUUID } from 'node:crypto';
import { safeStorage } from 'electron';
import { io, type Socket } from 'socket.io-client';
import type { DatabaseService } from '@our-companion/database';

export const NETWORK_PROTOCOL_VERSION = '0.1';
export const NETWORK_CLIENT_VERSION = '0.1.0';
export type NetworkConnectionState = 'offline' | 'checking_server' | 'authentication_required' | 'connecting' | 'online' | 'reconnecting' | 'incompatible_client' | 'server_unavailable' | 'authentication_failed' | 'disabled';
export interface NetworkAccount { id: string; email: string; username: string; friendCode: string; }
export interface NetworkStatus {
  state: NetworkConnectionState;
  onlineModeEnabled: boolean;
  serverUrl: string;
  account?: NetworkAccount;
  message?: string;
  remoteRevocationConfirmed?: boolean;
}
export interface StoredNetworkSession { serverOrigin: string; accessToken: string; refreshToken: string; }

interface ApiResponse<T> { data: T; }
interface AuthResult { user: NetworkAccount; accessToken: string; refreshToken: string; }
interface SocketLike { on(event: string, listener: (...args: any[]) => void): SocketLike; connect(): SocketLike; disconnect(): SocketLike; }
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

  constructor(
    private readonly db: DatabaseService,
    private readonly notify: (status: NetworkStatus) => void = () => {},
    private readonly deps: ServiceDependencies = defaultDependencies,
  ) {
    this.status = { state: this.enabled ? 'offline' : 'disabled', onlineModeEnabled: this.enabled, serverUrl: this.serverUrl };
  }

  getStatus = async (): Promise<NetworkStatus> => ({ ...this.status });

  configureServer = async (serverUrl: string): Promise<NetworkStatus> => {
    const normalized = normalizeServerUrl(serverUrl);
    if (normalized === this.serverUrl) return this.getStatus();
    this.clearReconnectTimer();
    this.socket?.disconnect();
    this.socket = undefined;
    this.clearSession();
    this.db.setAppSetting(URL_KEY, normalized);
    this.setStatus({ state: this.enabled ? 'authentication_required' : 'disabled', serverUrl: normalized, message: undefined, remoteRevocationConfirmed: undefined });
    return this.getStatus();
  };

  register = async (input: { email: string; username: string; password: string }): Promise<NetworkStatus> => {
    await this.checkCompatibility();
    try {
      const result = await this.publicRequest<AuthResult>('/api/auth/register', { ...input, deviceId: this.deviceId });
      await this.acceptAuthentication(result);
      return this.enableAuthenticatedConnection();
    } catch (error) {
      this.setStatus({ state: this.statusFor(error, 'authentication_failed'), message: messageFor(error) });
      throw error;
    }
  };

  login = async (input: { email: string; password: string }): Promise<NetworkStatus> => {
    await this.checkCompatibility();
    try {
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
    this.db.setAppSetting(MODE_KEY, false);
    this.stopSocket();
    this.resetReconnectAttempts();
    this.setStatus({ onlineModeEnabled: false, state: 'disabled', message: undefined });
    return this.getStatus();
  };

  logout = async (): Promise<NetworkStatus> => {
    let remoteRevocationConfirmed = false;
    try {
      if (this.session) {
        await this.authenticatedRequest('/api/auth/logout', { deviceId: this.deviceId });
        remoteRevocationConfirmed = true;
      }
    } catch { /* local logout is allowed, but the result remains explicitly unconfirmed */ }
    this.stopSocket();
    this.clearSession();
    this.resetReconnectAttempts();
    this.setStatus({ onlineModeEnabled: true, state: 'authentication_required', remoteRevocationConfirmed, message: remoteRevocationConfirmed ? undefined : 'Remote session revocation was not confirmed.' });
    return this.getStatus();
  };

  retryConnection = async (): Promise<NetworkStatus> => {
    if (!this.enabled) return this.getStatus();
    this.resetReconnectAttempts();
    return this.enableOnlineMode();
  };

  dispose(): void { this.stopSocket(); }

  private get enabled(): boolean { return this.db.getAppSetting<boolean>(MODE_KEY) ?? false; }
  private get serverUrl(): string { return this.db.getAppSetting<string>(URL_KEY) ?? 'http://localhost:3001'; }
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
    const data = await this.request<{ compatible: boolean; reason?: string }>('/api/meta/client-compatibility');
    if (!data.compatible) throw new Error(data.reason ?? 'INCOMPATIBLE_CLIENT');
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
    catch { this.clearSession(); return false; }
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
      } catch { this.stopSocket(); this.clearSession(); return false; }
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
    if (isAuthenticationError(code) && this.socketRefreshAttempted) { this.stopSocket(); this.clearSession(); this.setStatus({ state: 'authentication_required', message: undefined }); return; }
    this.scheduleReconnect(error);
  }

  private scheduleReconnect(error: unknown): void {
    if (!this.enabled || this.reconnectTimer) return;
    const attempt = Math.min(6, (this.db.getAppSetting<number>(RECONNECT_ATTEMPT_KEY) ?? 0) + 1);
    this.db.setAppSetting(RECONNECT_ATTEMPT_KEY, attempt);
    this.setStatus({ state: 'reconnecting', message: messageFor(error) });
    const delay = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
    this.reconnectTimer = this.deps.setTimeout(() => { this.reconnectTimer = undefined; void this.connectSocket(); }, delay);
  }

  private clearReconnectTimer(): void { if (this.reconnectTimer) this.deps.clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
  private resetReconnectAttempts(): void { this.clearReconnectTimer(); this.db.setAppSetting(RECONNECT_ATTEMPT_KEY, 0); }
  private stopSocket(): void { this.clearReconnectTimer(); this.socket?.disconnect(); this.socket = undefined; }
  private async authenticatedRequest<T>(path: string, body?: unknown): Promise<T> {
    if (!this.session || this.session.serverOrigin !== this.serverUrl) throw new Error('AUTHENTICATION_REQUIRED');
    try { return await this.request<T>(path, body, this.session.accessToken); }
    catch (error) {
      if (!isAuthenticationError(messageFor(error)) || !(await this.refreshSession()) || !this.session) throw error;
      return this.request<T>(path, body, this.session.accessToken);
    }
  }
  private publicRequest<T>(path: string, body: unknown): Promise<T> { return this.request<T>(path, body); }
  private async request<T>(path: string, body?: unknown, accessToken?: string): Promise<T> {
    const response = await this.deps.fetch(`${this.serverUrl}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: {
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
