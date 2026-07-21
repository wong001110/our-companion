import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { DebugFlushWorker, type FlushDb, type FlushNetwork, type FlushConfig } from './debugFlushWorker';
import type { DeveloperDebugEvent } from '@our-companion/shared';
import { batchBodyByteSize, buildDeveloperDebugUploadBatch } from './developerDebugUpload';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => ':memory:' },
  dialog: {},
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (v: string) => Buffer.from(v), decryptString: (v: Buffer) => v.toString() },
}));

function createTestDb(): DatabaseService {
  return new DatabaseService({ path: ':memory:' });
}

function makeEvent(overrides: Partial<DeveloperDebugEvent> = {}): DeveloperDebugEvent {
  return {
    id: `devent_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    kind: 'ai_call',
    createdAt: '2026-01-01T00:00:00.000Z',
    syncStatus: 'pending',
    syncAttemptCount: 0,
    ...overrides,
  };
}

function makeNetwork(overrides: Partial<FlushNetwork> = {}): FlushNetwork {
  return {
    postBatchDebugEvents: vi.fn().mockResolvedValue({ accepted: 1 }),
    getStatusSnapshot: () => ({
      state: 'online',
      onlineModeEnabled: true,
      account: { id: 'user-1' },
    }),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<FlushConfig> = {}): FlushConfig {
  return { isPackaged: false, ...overrides };
}

function setupWorkerDb(db: DatabaseService, uploadEnabled = true): void {
  db.setAppSetting('developer.debugUploadEnabled', uploadEnabled);
}

function insertEvents(db: DatabaseService, count: number): void {
  for (let i = 0; i < count; i++) {
    db.insertDeveloperDebugEvent(makeEvent({
      id: `devent_${i}`,
      payload: { index: i },
    }));
  }
}

function getSyncCounts(db: DatabaseService) {
  return {
    pending: db.countDeveloperDebugEvents({ syncStatus: 'pending' }),
    uploading: db.countDeveloperDebugEvents({ syncStatus: 'uploading' }),
    uploaded: db.countDeveloperDebugEvents({ syncStatus: 'uploaded' }),
  };
}

describe('DebugFlushWorker', () => {
  afterEach(() => { vi.useRealTimers(); });

  describe('concurrent flush dedup', () => {
    it('second flush while first running returns the same promise', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 1);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      let resolveFirst: (() => void) | undefined;
      const firstCall = new Promise<void>((r) => { resolveFirst = r; });
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        firstCall.then(() => ({ accepted: 1 }))
      );

      const p1 = worker.flushPendingDebugEvents();
      const p2 = worker.flushPendingDebugEvents();
      resolveFirst!();
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual(r2);
      expect(r1.uploaded).toBe(1);
    });
  });

  describe('120 events fully uploaded', () => {
    it('all 120 events reach uploaded status', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 120);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      let drainCount = 0;
      async function drainAll(): Promise<{ uploaded: number; failed: number }> {
        let total = { uploaded: 0, failed: 0 };
        for (let i = 0; i < 20; i++) {
          const c = getSyncCounts(db);
          if (c.pending === 0) break;
          const r = await worker.flushPendingDebugEvents();
          total.uploaded += r.uploaded;
          total.failed += r.failed;
          drainCount++;
        }
        return total;
      }

      vi.useFakeTimers();
      const drainPromise = drainAll();
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1100);
      }
      const result = await drainPromise;
      expect(result.uploaded).toBe(120);
      expect(result.failed).toBe(0);
      expect(getSyncCounts(db)).toEqual({ pending: 0, uploading: 0, uploaded: 120 });
    });
  });

  describe('max 5 POSTs per drain', () => {
    it('stops after 5 POSTs and schedules follow-up', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 300);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBeGreaterThan(0);
      expect(network.postBatchDebugEvents).toHaveBeenCalledTimes(5);
      expect(getSyncCounts(db).pending).toBeGreaterThan(0);

      vi.useRealTimers();
      worker.cleanupFlushTimer();
    });
  });

  describe('follow-up after 5 batches', () => {
    it('scheduled follow-up processes remaining events', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 300);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      await worker.flushPendingDebugEvents();
      expect(network.postBatchDebugEvents).toHaveBeenCalledTimes(5);

      await vi.advanceTimersByTimeAsync(1100);
      expect(network.postBatchDebugEvents.mock.calls.length).toBeGreaterThan(5);

      let remaining = getSyncCounts(db).pending;
      while (remaining > 0) {
        await vi.advanceTimersByTimeAsync(1100);
        remaining = getSyncCounts(db).pending;
        if (network.postBatchDebugEvents.mock.calls.length > 20) break;
      }
      expect(getSyncCounts(db).pending).toBe(0);
      worker.cleanupFlushTimer();
    });
  });

  describe('pre-POST network check', () => {
    it('stops when network becomes reconnecting', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 100);
      let networkState = 'online';
      const network = makeNetwork({
        getStatusSnapshot: () => ({
          state: networkState,
          onlineModeEnabled: true,
          account: { id: 'user-1' },
        }),
      });
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      let postCount = 0;
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        postCount++;
        if (postCount === 2) networkState = 'reconnecting';
        return { accepted: 50 };
      });

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBeGreaterThan(0);
      expect(getSyncCounts(db).pending).toBeGreaterThan(0);
    });
  });

  describe('events inserted during upload', () => {
    it('new events are picked up in follow-up', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 100);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      let postCount = 0;
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        postCount++;
        if (postCount === 5) {
          for (let i = 200; i < 210; i++) {
            db.insertDeveloperDebugEvent(makeEvent({ id: `devent_new_${i}`, payload: { i } }));
          }
        }
        return { accepted: 50 };
      });

      vi.useFakeTimers();
      await worker.flushPendingDebugEvents();
      expect(getSyncCounts(db).pending).toBeGreaterThan(0);

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1100);
        if (getSyncCounts(db).pending === 0) break;
      }
      expect(getSyncCounts(db).pending).toBe(0);
      expect(getSyncCounts(db).uploaded).toBeGreaterThanOrEqual(110);
      worker.cleanupFlushTimer();
    });
  });

  describe('accepted count mismatch', () => {
    it('restores pending and records error', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 10);
      const network = makeNetwork();
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockResolvedValue({ accepted: 3 });
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(0);
      expect(result.failed).toBe(10);
      expect(getSyncCounts(db).pending).toBe(10);
      expect(getSyncCounts(db).uploading).toBe(0);
      expect(db.getAppSetting<string>('developer.lastUploadError')).toContain('accepted 3/10');
    });
  });

  describe('POST throws error', () => {
    it('restores pending and records error', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 5);
      const network = makeNetwork();
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NETWORK_FAIL'));
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(0);
      expect(result.failed).toBe(5);
      expect(getSyncCounts(db).pending).toBe(5);
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('NETWORK_FAIL');
    });
  });

  describe('partial success then failure', () => {
    it('records last upload time for successes, error for failure', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 100);
      const network = makeNetwork();
      let callCount = 0;
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) return { accepted: 50 };
        throw new Error('FAIL_AFTER_PARTIAL');
      });
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(100);
      expect(result.failed).toBe(50);
      expect(db.getAppSetting<string>('developer.lastUploadAt')).toBeDefined();
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('FAIL_AFTER_PARTIAL');
    });
  });

  describe('online mode disabled mid-upload', () => {
    it('stops uploading when onlineModeEnabled becomes false', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 100);
      let onlineMode = true;
      const network = makeNetwork({
        getStatusSnapshot: () => ({
          state: 'online',
          onlineModeEnabled: onlineMode,
          account: { id: 'user-1' },
        }),
      });
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      let callCount = 0;
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) onlineMode = false;
        return { accepted: 50 };
      });

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(50);
      expect(getSyncCounts(db).pending).toBe(50);
    });
  });

  describe('account disappears', () => {
    it('stops when account becomes null', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 20);
      let hasAccount = true;
      const network = makeNetwork({
        getStatusSnapshot: () => ({
          state: 'online',
          onlineModeEnabled: true,
          account: hasAccount ? { id: 'user-1' } : null,
        }),
      });
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      let callCount = 0;
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) hasAccount = false;
        return { accepted: 50 };
      });

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(50);
      expect(getSyncCounts(db).pending).toBeGreaterThan(0);
    });
  });

  describe('upload setting disabled mid-upload', () => {
    it('stops when upload setting is turned off', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 20);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      let callCount = 0;
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) db.setAppSetting('developer.debugUploadEnabled', false);
        return { accepted: 50 };
      });

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(50);
      expect(getSyncCounts(db).pending).toBeGreaterThan(0);
    });
  });

  describe('packaged build', () => {
    it('returns immediately without uploading', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 10);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig({ isPackaged: true }));

      const result = await worker.flushPendingDebugEvents();
      expect(result).toEqual({ uploaded: 0, failed: 0 });
      expect(network.postBatchDebugEvents).not.toHaveBeenCalled();
    });
  });

  describe('cleanupFlushTimer', () => {
    it('stops scheduled follow-up from firing', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 300);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      await worker.flushPendingDebugEvents();
      const callsAfterFirst = network.postBatchDebugEvents.mock.calls.length;
      worker.cleanupFlushTimer();
      await vi.advanceTimersByTimeAsync(5000);
      expect(network.postBatchDebugEvents.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  describe('POST body validation', () => {
    it('each batch body is under 64 KiB and contains events', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 120);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      await worker.flushPendingDebugEvents();

      for (const bodyStr of worker.postBodies) {
        const bodySize = Buffer.byteLength(bodyStr, 'utf8');
        expect(bodySize).toBeLessThanOrEqual(64 * 1024);
        const body = JSON.parse(bodyStr);
        expect(body.events).toBeDefined();
        expect(body.events.length).toBeGreaterThan(0);
        expect(body.events.length).toBeLessThanOrEqual(50);
        for (const event of body.events) {
          expect(event.payload).toBeDefined();
          expect(typeof event.payload).toBe('object');
        }
      }
    });
  });

  describe('lastUploadAt and lastUploadError', () => {
    it('records lastUploadAt on success, preserves lastUploadError on failure', async () => {
      const db = createTestDb();
      setupWorkerDb(db);
      insertEvents(db, 5);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      await worker.flushPendingDebugEvents();
      expect(db.getAppSetting<string>('developer.lastUploadAt')).toBeDefined();

      db.insertDeveloperDebugEvent(makeEvent({ id: 'fail_event' }));
      (network.postBatchDebugEvents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NETWORK_ERROR'));
      await worker.flushPendingDebugEvents();
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('NETWORK_ERROR');
      expect(db.getAppSetting<string>('developer.lastUploadAt')).toBeDefined();
    });
  });
});
