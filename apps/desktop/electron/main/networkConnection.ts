import { randomUUID } from 'node:crypto';
import { safeStorage } from 'electron';
import { io, type Socket } from 'socket.io-client';
import type { DatabaseService } from '@our-companion/database';

export const NETWORK_PROTOCOL_VERSION = '0.1';
export const NETWORK_CLIENT_VERSION = '0.1.0';
export type NetworkConnectionState = 'offline' | 'checking_server' | 'authentication_required' | 'connecting' | 'online' | 'reconnecting' | 'incompatible_client' | 'server_unavailable' | 'authentication_failed' | 'disabled';

export interface NetworkStatus {
  state: NetworkConnectionState;
  onlineModeEnabled: boolean;
  serverUrl: string;
  account?: { id: string; email: string; username: string; friendCode: string };
  message?: string;
}

type Tokens = { accessToken: string; refreshToken: string };
type ApiResponse<T> = { data: T };
type AuthResult = { user: NetworkStatus['account']; accessToken: string; refreshToken: string };

const SESSION_KEY = 'network.secure-session';
const URL_KEY = 'network.server-url';
const DEVICE_KEY = 'network.device-id';
const MODE_KEY = 'network.online-mode-enabled';

export class NetworkConnectionService {
  private socket?: Socket;
  private reconnectTimer?: NodeJS.Timeout;
  private status: NetworkStatus;
  private tokens?: Tokens;

  constructor(private readonly db: DatabaseService, private readonly notify: (status: NetworkStatus) => void = () => {}) {
    this.status = {
      state: this.enabled ? 'offline' : 'disabled',
      onlineModeEnabled: this.enabled,
      serverUrl: this.serverUrl,
    };
    this.tokens = this.readSession();
  }

  getStatus = async (): Promise<NetworkStatus> => ({ ...this.status });

  configureServer = async (serverUrl: string): Promise<NetworkStatus> => {
    this.db.setAppSetting(URL_KEY, normalizeServerUrl(serverUrl));
    this.setStatus({ serverUrl: this.serverUrl });
    return this.getStatus();
  };

  register = async (input: { email: string; username: string; password: string }): Promise<NetworkStatus> => {
    const result = await this.publicRequest<AuthResult>('/api/auth/register', { ...input, deviceId: this.deviceId });
    this.acceptSession(result);
    return this.enableOnlineMode();
  };

  login = async (input: { email: string; password: string }): Promise<NetworkStatus> => {
    const result = await this.publicRequest<AuthResult>('/api/auth/login', { ...input, deviceId: this.deviceId });
    this.acceptSession(result);
    return this.enableOnlineMode();
  };

  enableOnlineMode = async (): Promise<NetworkStatus> => {
    this.db.setAppSetting(MODE_KEY, true);
    this.setStatus({ onlineModeEnabled: true, state: 'checking_server', message: undefined });
    try {
      await this.checkCompatibility();
      if (!this.tokens && !(await this.restoreSession())) {
        this.setStatus({ state: 'authentication_required' });
        return this.getStatus();
      }
      await this.connectSocket();
    } catch (error) {
      this.setStatus({ state: this.statusFor(error), message: userMessage(error) });
    }
    return this.getStatus();
  };

  disableOnlineMode = async (): Promise<NetworkStatus> => {
    this.db.setAppSetting(MODE_KEY, false);
    this.clearReconnect();
    this.socket?.disconnect();
    this.socket = undefined;
    this.setStatus({ onlineModeEnabled: false, state: 'disabled', message: undefined });
    return this.getStatus();
  };

  logout = async (): Promise<NetworkStatus> => {
    try {
      if (this.tokens) await this.authenticatedRequest('/api/auth/logout', { deviceId: this.deviceId });
    } catch { /* logout must still clear the local device session */ }
    this.clearSession();
    await this.disableOnlineMode();
    this.setStatus({ state: 'authentication_required' });
    return this.getStatus();
  };

  retryConnection = async (): Promise<NetworkStatus> => this.enabled ? this.enableOnlineMode() : this.getStatus();

  dispose(): void { this.clearReconnect(); this.socket?.disconnect(); }

  private get enabled(): boolean { return this.db.getAppSetting<boolean>(MODE_KEY) ?? false; }
  private get serverUrl(): string { return this.db.getAppSetting<string>(URL_KEY) ?? 'http://localhost:3001'; }
  private get deviceId(): string {
    const saved = this.db.getAppSetting<string>(DEVICE_KEY);
    if (saved) return saved;
    const id = randomUUID();
    this.db.setAppSetting(DEVICE_KEY, id);
    return id;
  }

  private async checkCompatibility(): Promise<void> {
    const data = await this.request<{ compatible: boolean; reason?: string }>('/api/meta/client-compatibility');
    if (!data.compatible) throw new Error(data.reason ?? 'INCOMPATIBLE_CLIENT');
  }

  private async restoreSession(): Promise<boolean> {
    const tokens = this.readSession();
    if (!tokens) return false;
    this.tokens = tokens;
    try {
      const result = await this.publicRequest<Tokens>('/api/auth/refresh', { refreshToken: tokens.refreshToken, deviceId: this.deviceId });
      this.tokens = result;
      this.writeSession(result);
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  private async connectSocket(): Promise<void> {
    if (!this.enabled || !this.tokens) return;
    this.clearReconnect();
    this.socket?.disconnect();
    this.setStatus({ state: 'connecting' });
    const socket = io(this.serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      auth: { token: this.tokens.accessToken, deviceId: this.deviceId, protocolVersion: NETWORK_PROTOCOL_VERSION },
      reconnection: false,
    });
    this.socket = socket;
    socket.on('connect', () => this.setStatus({ state: 'online', message: undefined }));
    socket.on('connect_error', (error) => this.scheduleReconnect(error));
    socket.on('disconnect', (reason) => { if (this.enabled && reason !== 'io client disconnect') this.scheduleReconnect(new Error(reason)); });
    socket.connect();
  }

  private scheduleReconnect(error: unknown): void {
    if (!this.enabled || this.reconnectTimer) return;
    this.setStatus({ state: 'reconnecting', message: userMessage(error) });
    const attempt = Math.min(6, (this.db.getAppSetting<number>('network.reconnect-attempt') ?? 0) + 1);
    this.db.setAppSetting('network.reconnect-attempt', attempt);
    const delay = Math.min(30_000, 500 * 2 ** attempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.enableOnlineMode();
    }, delay);
  }

  private clearReconnect(): void { if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; this.db.setAppSetting('network.reconnect-attempt', 0); }
  private async authenticatedRequest<T>(path: string, body: unknown): Promise<T> {
    if (!this.tokens && !(await this.restoreSession())) throw new Error('AUTHENTICATION_REQUIRED');
    try { return await this.request<T>(path, body, this.tokens!.accessToken); }
    catch (error) {
      if ((error as Error).message !== 'AUTHENTICATION_FAILED' || !(await this.restoreSession())) throw error;
      return this.request<T>(path, body, this.tokens!.accessToken);
    }
  }
  private publicRequest<T>(path: string, body: unknown): Promise<T> { return this.request<T>(path, body); }
  private async request<T>(path: string, body?: unknown, accessToken?: string): Promise<T> {
    const response = await fetch(`${this.serverUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        'x-our-companion-client-version': NETWORK_CLIENT_VERSION,
        'x-our-companion-protocol-version': NETWORK_PROTOCOL_VERSION,
        'x-our-companion-device-id': this.deviceId,
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json() as ApiResponse<T> | { error?: { code?: string; message?: string } };
    if (!response.ok) throw new Error('error' in payload ? payload.error?.code ?? 'NETWORK_ERROR' : 'NETWORK_ERROR');
    return (payload as ApiResponse<T>).data;
  }
  private acceptSession(result: AuthResult): void { this.tokens = { accessToken: result.accessToken, refreshToken: result.refreshToken }; this.writeSession(this.tokens); this.setStatus({ account: result.user }); }
  private readSession(): Tokens | undefined {
    const encoded = this.db.getAppSetting<string>(SESSION_KEY); if (!encoded || !safeStorage.isEncryptionAvailable()) return undefined;
    try { return JSON.parse(safeStorage.decryptString(Buffer.from(encoded, 'base64'))) as Tokens; } catch { return undefined; }
  }
  private writeSession(tokens: Tokens): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
    this.db.setAppSetting(SESSION_KEY, safeStorage.encryptString(JSON.stringify(tokens)).toString('base64'));
  }
  private clearSession(): void { this.tokens = undefined; this.db.setAppSetting(SESSION_KEY, ''); this.setStatus({ account: undefined }); }
  private setStatus(update: Partial<NetworkStatus>): void { this.status = { ...this.status, ...update, serverUrl: this.serverUrl }; this.notify({ ...this.status }); }
  private statusFor(error: unknown): NetworkConnectionState { const code = (error as Error).message; return code === 'INCOMPATIBLE_CLIENT' || code === 'UNSUPPORTED_PROTOCOL_VERSION' ? 'incompatible_client' : code === 'AUTHENTICATION_FAILED' ? 'authentication_failed' : 'server_unavailable'; }
}

export function normalizeServerUrl(value: string): string {
  const url = new URL(value.trim());
  const development = process.env.NODE_ENV === 'development' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !development) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('INVALID_NETWORK_SERVER_URL');
  return url.origin;
}
function userMessage(error: unknown): string { return (error as Error).message || 'Network connection unavailable'; }
