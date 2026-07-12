import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() } }));

import { NetworkConnectionService, normalizeServerUrl } from './networkConnection';

class TestDb {
  readonly values = new Map<string, unknown>();
  getAppSetting<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  setAppSetting<T>(key: string, value: T): T { this.values.set(key, value); return value; }
}

function response(data: unknown, ok = true, code = 'NETWORK_ERROR') {
  return { ok, json: async () => ok ? { data } : { error: { code } } } as Response;
}

describe('NetworkConnectionService', () => {
  it('does not perform network activity while Online Mode is disabled', async () => {
    const fetch = vi.fn();
    const createSocket = vi.fn();
    const service = new NetworkConnectionService(new TestDb() as never, undefined, { fetch, createSocket, secureStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() }, setTimeout, clearTimeout });
    expect((await service.getStatus()).state).toBe('disabled');
    expect(fetch).not.toHaveBeenCalled();
    expect(createSocket).not.toHaveBeenCalled();
  });

  it('refreshes a stored same-origin session and restores the account before connecting', async () => {
    const db = new TestDb();
    db.setAppSetting('network.online-mode-enabled', true);
    db.setAppSetting('network.device-id', '4ec4643d-b90e-4fe5-9668-1521fb6a0b9d');
    db.setAppSetting('network.secure-session', Buffer.from(JSON.stringify({ serverOrigin: 'http://localhost:3001', accessToken: 'old', refreshToken: 'refresh' })).toString('base64'));
    const listeners = new Map<string, (...args: any[]) => void>();
    const socket = { on: vi.fn((event, listener) => { listeners.set(event, listener); return socket; }), connect: vi.fn(() => socket), disconnect: vi.fn(() => socket) };
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ compatible: true }))
      .mockResolvedValueOnce(response({ accessToken: 'new', refreshToken: 'rotated' }))
      .mockResolvedValueOnce(response({ id: 'u1', email: 'a@example.com', username: 'ann', friendCode: 'ABC' }));
    const service = new NetworkConnectionService(db as never, undefined, { fetch, createSocket: vi.fn(() => socket), secureStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() }, setTimeout, clearTimeout });
    await service.enableOnlineMode();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3001/api/meta/client-compatibility',
      'http://localhost:3001/api/auth/refresh',
      'http://localhost:3001/api/auth/me',
    ]);
    expect((await service.getStatus()).account?.username).toBe('ann');
    expect(socket.connect).toHaveBeenCalledOnce();
  });

  it('clears an origin-mismatched encrypted session without sending credentials', async () => {
    const db = new TestDb();
    db.setAppSetting('network.online-mode-enabled', true);
    db.setAppSetting('network.secure-session', Buffer.from(JSON.stringify({ serverOrigin: 'https://other.example', accessToken: 'old', refreshToken: 'refresh' })).toString('base64'));
    const fetch = vi.fn().mockResolvedValue(response({ compatible: true }));
    const service = new NetworkConnectionService(db as never, undefined, { fetch, createSocket: vi.fn(), secureStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() }, setTimeout, clearTimeout });
    await service.enableOnlineMode();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await service.getStatus()).state).toBe('authentication_required');
  });

  it('does not send login credentials when the server rejects the client version', async () => {
    const db = new TestDb();
    const fetch = vi.fn().mockResolvedValue(response({ compatible: false, reason: 'CLIENT_VERSION_TOO_OLD' }));
    const service = new NetworkConnectionService(db as never, undefined, { fetch, createSocket: vi.fn(), secureStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() }, setTimeout, clearTimeout });
    await expect(service.login({ email: 'a@example.com', password: 'secret' })).rejects.toThrow('CLIENT_VERSION_TOO_OLD');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/api/meta/client-compatibility');
    expect((await service.getStatus()).state).toBe('incompatible_client');
  });

  it('clears the encrypted session when changing server origin', async () => {
    const db = new TestDb();
    db.setAppSetting('network.secure-session', Buffer.from(JSON.stringify({ serverOrigin: 'http://localhost:3001', accessToken: 'old', refreshToken: 'refresh' })).toString('base64'));
    const service = new NetworkConnectionService(db as never, undefined, { fetch: vi.fn(), createSocket: vi.fn(), secureStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() }, setTimeout, clearTimeout });
    await service.configureServer('https://network.example');
    expect(db.getAppSetting('network.secure-session')).toBe('');
    expect((await service.getStatus()).serverUrl).toBe('https://network.example');
  });

  it('keeps Online Mode disabled after logout when that preference is disabled', async () => {
    const db = new TestDb();
    const service = new NetworkConnectionService(db as never, undefined, { fetch: vi.fn(), createSocket: vi.fn(), secureStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() }, setTimeout, clearTimeout });
    const status = await service.logout();
    expect(status.onlineModeEnabled).toBe(false);
    expect(status.state).toBe('disabled');
    expect(db.getAppSetting('network.online-mode-enabled')).toBeUndefined();
  });

  it('keeps Online Mode enabled after logout when that preference is enabled', async () => {
    const db = new TestDb();
    db.setAppSetting('network.online-mode-enabled', true);
    const service = new NetworkConnectionService(db as never, undefined, { fetch: vi.fn(), createSocket: vi.fn(), secureStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() }, setTimeout, clearTimeout });
    const status = await service.logout();
    expect(status.onlineModeEnabled).toBe(true);
    expect(status.state).toBe('authentication_required');
    expect(db.getAppSetting('network.online-mode-enabled')).toBe(true);
  });

  it('normalizes only permitted origins', () => {
    expect(normalizeServerUrl('https://network.example/')).toBe('https://network.example');
    expect(() => normalizeServerUrl('https://user:secret@network.example')).toThrow('INVALID_NETWORK_SERVER_URL');
    expect(() => normalizeServerUrl('https://network.example/?token=x')).toThrow('INVALID_NETWORK_SERVER_URL');
  });
});
