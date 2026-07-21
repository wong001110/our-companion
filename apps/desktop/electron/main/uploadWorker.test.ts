import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import type { DeveloperDebugEvent, DeveloperDebugUploadEvent } from '@our-companion/shared';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => ':memory:' },
  dialog: {},
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() },
}));

import { buildDeveloperDebugUploadBatch, buildDeveloperDebugUploadEvent, batchBodyByteSize } from './developerDebugUpload';

function createTestDb(): DatabaseService {
  return new DatabaseService({ path: ':memory:' });
}

function createDebugEvent(overrides: Partial<DeveloperDebugEvent> = {}): DeveloperDebugEvent {
  return {
    id: `devent_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    kind: 'ai_call',
    createdAt: '2026-01-01T00:00:00.000Z',
    syncStatus: 'pending',
    syncAttemptCount: 0,
    ...overrides,
  };
}

describe('debug upload worker', () => {
  describe('stale uploading recovery', () => {
    it('resets uploading events to pending on construction', () => {
      const db = createTestDb();
      const event = createDebugEvent({ id: 'devent_stale_1', syncStatus: 'uploading', syncAttemptCount: 3 });
      db.insertDeveloperDebugEvent(event);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(1);

      const resetCount = db.resetUploadingDeveloperDebugEventsToPending();
      expect(resetCount).toBe(1);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(0);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'pending' })).toHaveLength(1);
    });

    it('returns 0 when no uploading events exist', () => {
      const db = createTestDb();
      const resetCount = db.resetUploadingDeveloperDebugEventsToPending();
      expect(resetCount).toBe(0);
    });
  });

  describe('database countDeveloperDebugEvents', () => {
    it('counts events by sync status', () => {
      const db = createTestDb();
      db.insertDeveloperDebugEvent(createDebugEvent({ id: 'devent_p1', syncStatus: 'pending' }));
      db.insertDeveloperDebugEvent(createDebugEvent({ id: 'devent_p2', syncStatus: 'pending' }));
      db.insertDeveloperDebugEvent(createDebugEvent({ id: 'devent_u1', syncStatus: 'uploaded', syncAttemptCount: 1 }));
      expect(db.countDeveloperDebugEvents({ syncStatus: 'pending' })).toBe(2);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'uploaded' })).toBe(1);
      expect(db.countDeveloperDebugEvents()).toBe(3);
    });
  });

  describe('database markDeveloperDebugEvents lifecycle', () => {
    it('transitions events through pending -> uploading -> uploaded', () => {
      const db = createTestDb();
      db.insertDeveloperDebugEvent(createDebugEvent({ id: 'devent_lifecycle' }));

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
      const db = createTestDb();
      db.insertDeveloperDebugEvent(createDebugEvent({ id: 'devent_fail' }));

      db.markDeveloperDebugEventsUploading(['devent_fail']);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(1);

      db.markDeveloperDebugEventsPending(['devent_fail']);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'uploading' })).toHaveLength(0);
      expect(db.listDeveloperDebugEvents({ syncStatus: 'pending' })).toHaveLength(1);
    });
  });

  describe('developer upload settings', () => {
    it('defaults upload enabled to false', () => {
      const db = createTestDb();
      expect(db.getAppSetting<boolean>('developer.debugUploadEnabled')).toBeUndefined();
    });

    it('persists upload enabled setting', () => {
      const db = createTestDb();
      db.setAppSetting('developer.debugUploadEnabled', true);
      expect(db.getAppSetting<boolean>('developer.debugUploadEnabled')).toBe(true);
    });

    it('persists last upload error', () => {
      const db = createTestDb();
      db.setAppSetting('developer.lastUploadError', 'Test error');
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('Test error');
    });
  });

  describe('batch building with real events', () => {
    it('120 events are batched correctly with payload in every event', () => {
      const events = Array.from({ length: 120 }, (_, i) => createDebugEvent({
        id: `devent_${i}`,
        kind: 'ai_call',
        payload: { index: i, data: 'test' },
      }));
      const batches = buildDeveloperDebugUploadBatch(events);
      expect(batches.length).toBeGreaterThanOrEqual(3);
      let totalEvents = 0;
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(50);
        for (const event of batch) {
          expect(event.payload).toBeDefined();
          expect(typeof event.payload).toBe('object');
          totalEvents++;
        }
      }
      expect(totalEvents).toBe(120);
    });

    it('each batch body byte size is under 64 KiB', () => {
      const events = Array.from({ length: 50 }, (_, i) => createDebugEvent({
        id: `devent_${i}`,
        kind: 'ai_call',
        payload: { data: 'x'.repeat(500) },
      }));
      const batches = buildDeveloperDebugUploadBatch(events);
      for (const batch of batches) {
        const size = batchBodyByteSize(batch);
        expect(size).toBeLessThanOrEqual(64 * 1024);
      }
    });

    it('events without payload get empty payload object', () => {
      const events = [createDebugEvent({ id: 'devent_no_payload', kind: 'ai_call' })];
      const batches = buildDeveloperDebugUploadBatch(events);
      expect(batches.length).toBe(1);
      expect(batches[0][0].payload).toEqual({});
    });
  });

  describe('upload simulation with real db', () => {
    it('full lifecycle: insert -> batch -> mark uploading -> mark uploaded', () => {
      const db = createTestDb();
      const events = Array.from({ length: 10 }, (_, i) => createDebugEvent({
        id: `devent_${i}`,
        kind: 'ai_call',
        payload: { index: i },
      }));
      for (const event of events) {
        db.insertDeveloperDebugEvent(event);
      }

      expect(db.countDeveloperDebugEvents({ syncStatus: 'pending' })).toBe(10);

      const pending = db.listDeveloperDebugEvents({ syncStatus: 'pending', limit: 50 });
      const batches = buildDeveloperDebugUploadBatch(pending);
      expect(batches.length).toBeGreaterThanOrEqual(1);

      const batch = batches[0];
      const batchIds = batch.map((e) => e.clientEventId);
      const dbIds = pending.filter((e) => batchIds.includes(e.id)).map((e) => e.id);

      db.markDeveloperDebugEventsUploading(dbIds);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'uploading' })).toBe(batch.length);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'pending' })).toBe(10 - batch.length);

      db.markDeveloperDebugEventsUploaded(dbIds);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'uploaded' })).toBe(batch.length);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'uploading' })).toBe(0);
    });

    it('failure restores pending and records error', () => {
      const db = createTestDb();
      db.insertDeveloperDebugEvent(createDebugEvent({ id: 'devent_fail_1' }));

      const pending = db.listDeveloperDebugEvents({ syncStatus: 'pending', limit: 50 });
      const batches = buildDeveloperDebugUploadBatch(pending);
      const batch = batches[0];
      const batchIds = batch.map((e) => e.clientEventId);
      const dbIds = pending.filter((e) => batchIds.includes(e.id)).map((e) => e.id);

      db.markDeveloperDebugEventsUploading(dbIds);
      db.markDeveloperDebugEventsPending(dbIds);
      db.setAppSetting('developer.lastUploadError', 'Batch failed');

      expect(db.countDeveloperDebugEvents({ syncStatus: 'pending' })).toBe(1);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'uploading' })).toBe(0);
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('Batch failed');
    });

    it('accepted count mismatch restores pending', () => {
      const db = createTestDb();
      db.insertDeveloperDebugEvent(createDebugEvent({ id: 'devent_mismatch_1' }));
      db.insertDeveloperDebugEvent(createDebugEvent({ id: 'devent_mismatch_2' }));

      const pending = db.listDeveloperDebugEvents({ syncStatus: 'pending', limit: 50 });
      const batches = buildDeveloperDebugUploadBatch(pending);
      const batch = batches[0];
      const batchIds = batch.map((e) => e.clientEventId);
      const dbIds = pending.filter((e) => batchIds.includes(e.id)).map((e) => e.id);

      db.markDeveloperDebugEventsUploading(dbIds);
      const accepted = 1;
      if (accepted !== batch.length) {
        db.markDeveloperDebugEventsPending(dbIds);
      }

      expect(db.countDeveloperDebugEvents({ syncStatus: 'pending' })).toBe(2);
      expect(db.countDeveloperDebugEvents({ syncStatus: 'uploading' })).toBe(0);
    });
  });

  describe('app setting persistence', () => {
    it('stores and retrieves app settings', () => {
      const db = createTestDb();
      db.setAppSetting('test.key', { nested: 'value' });
      expect(db.getAppSetting<{ nested: string }>('test.key')).toEqual({ nested: 'value' });
    });

    it('returns undefined for missing keys', () => {
      const db = createTestDb();
      expect(db.getAppSetting('nonexistent.key')).toBeUndefined();
    });
  });
});
