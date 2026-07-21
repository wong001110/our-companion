import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => ':memory:' },
  dialog: {},
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() },
}));

import { AppServices } from './services';
import { DatabaseService } from '@our-companion/database';

function createTestServices() {
  const db = new DatabaseService({ path: ':memory:' });
  return { db, services: null as unknown as AppServices };
}

describe('debug upload worker', () => {
  describe('stale uploading recovery', () => {
    it('resets uploading events to pending on construction', () => {
      const { db } = createTestServices();
      const event: import('@our-companion/shared').DeveloperDebugEvent = {
        id: 'devent_stale_1',
        kind: 'ai_call',
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'uploading',
        syncAttemptCount: 3,
      };
      db.insertDeveloperDebugEvent(event);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(1);

      const resetCount = db.resetUploadingDeveloperDebugEventsToPending();
      expect(resetCount).toBe(1);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(0);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'pending' })).toHaveLength(1);
    });

    it('returns 0 when no uploading events exist', () => {
      const { db } = createTestServices();
      const resetCount = db.resetUploadingDeveloperDebugEventsToPending();
      expect(resetCount).toBe(0);
    });
  });

  describe('database countDeveloperDebugEvents', () => {
    it('counts events by sync status', () => {
      const { db } = createTestServices();
      db.insertDeveloperDebugEvent({
        id: 'devent_p1', kind: 'ai_call', createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending', syncAttemptCount: 0,
      } as import('@our-companion/shared').DeveloperDebugEvent);
      db.insertDeveloperDebugEvent({
        id: 'devent_p2', kind: 'ai_call', createdAt: '2026-01-01T00:00:01.000Z',
        syncStatus: 'pending', syncAttemptCount: 0,
      } as import('@our-companion/shared').DeveloperDebugEvent);
      db.insertDeveloperDebugEvent({
        id: 'devent_u1', kind: 'ai_call', createdAt: '2026-01-01T00:00:02.000Z',
        syncStatus: 'uploaded', syncAttemptCount: 1,
      } as import('@our-companion/shared').DeveloperDebugEvent);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'pending' })).toBe(2);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'uploaded' })).toBe(1);
      expect(db.countDeveloperDebugEvents()).toBe(3);
    });
  });

  describe('database markDeveloperDebugEvents lifecycle', () => {
    it('transitions events through pending -> uploading -> uploaded', () => {
      const { db } = createTestServices();
      db.insertDeveloperDebugEvent({
        id: 'devent_lifecycle', kind: 'ai_call', createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending', syncAttemptCount: 0,
      } as import('@our-companion/shared').DeveloperDebugEvent);

      expect(db.listDeveloperDebugEvents({ syncStatus: 'pending' })).toHaveLength(1);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(0);

      db.markDeveloperDebugEventsUploading(['devent_lifecycle']);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'pending' })).toHaveLength(0);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(1);

      db.markDeveloperDebugEventsUploaded(['devent_lifecycle']);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(0);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploaded' })).toHaveLength(1);
    });

    it('can restore uploading events back to pending on failure', () => {
      const { db } = createTestServices();
      db.insertDeveloperDebugEvent({
        id: 'devent_fail', kind: 'ai_call', createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending', syncAttemptCount: 0,
      } as import('@our-companion/shared').DeveloperDebugEvent);

      db.markDeveloperDebugEventsUploading(['devent_fail']);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(1);

      db.markDeveloperDebugEventsPending(['devent_fail']);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(0);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'pending' })).toHaveLength(1);
    });
  });

  describe('developer upload settings', () => {
    it('defaults upload enabled to false', () => {
      const { db } = createTestServices();
      expect(db.getAppSetting<boolean>('developer.debugUploadEnabled')).toBeUndefined();
    });

    it('persists upload enabled setting', () => {
      const { db } = createTestServices();
      db.setAppSetting('developer.debugUploadEnabled', true);
      expect(db.getAppSetting<boolean>('developer.debugUploadEnabled')).toBe(true);
    });

    it('persists last upload error', () => {
      const { db } = createTestServices();
      db.setAppSetting('developer.lastUploadError', 'Test error');
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('Test error');
    });
  });

  describe('app setting persistence', () => {
    it('stores and retrieves app settings', () => {
      const { db } = createTestServices();
      db.setAppSetting('test.key', { nested: 'value' });
      expect(db.getAppSetting<{ nested: string }>('test.key')).toEqual({ nested: 'value' });
    });

    it('returns undefined for missing keys', () => {
      const { db } = createTestServices();
      expect(db.getAppSetting('nonexistent.key')).toBeUndefined();
    });
  });
});
