import { describe, expect, it, vi, afterEach } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { DebugFlushWorker, type FlushDb, type FlushNetwork, type FlushConfig } from './debugFlushWorker';
import type { DeveloperDebugEvent, DeveloperDebugUploadEvent } from '@our-companion/shared';

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

function acceptWholeBatch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (batch: DeveloperDebugUploadEvent[]) => ({ accepted: batch.length }));
}

function makeNetwork(overrides: Partial<FlushNetwork> = {}): FlushNetwork & { _postFn: ReturnType<typeof vi.fn> } {
  const postFn = acceptWholeBatch();
  const network: FlushNetwork & { _postFn: ReturnType<typeof vi.fn> } = {
    postBatchDebugEvents: postFn,
    getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: true, account: { id: 'user-1' } }),
    ...overrides,
    _postFn: postFn,
  };
  return network;
}

function makeConfig(overrides: Partial<FlushConfig> = {}): FlushConfig {
  return { isPackaged: false, ...overrides };
}

function setupWorkerDb(db: DatabaseService, uploadEnabled = true): void {
  db.setAppSetting('developer.debugUploadEnabled', uploadEnabled);
}

function insertEvents(db: DatabaseService, count: number): void {
  for (let i = 0; i < count; i++) {
    db.insertDeveloperDebugEvent(makeEvent({ id: `devent_${i}`, payload: { index: i } }));
  }
}

function syncCounts(db: DatabaseService) {
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
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 1);
      let resolveFirst: (() => void) | undefined;
      const firstCall = new Promise<void>((r) => { resolveFirst = r; });
      const postFn = vi.fn(() => firstCall.then(() => ({ accepted: 1 })));
      const network: FlushNetwork = { postBatchDebugEvents: postFn, getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: true, account: { id: 'u' } }) };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const p1 = worker.flushPendingDebugEvents();
      const p2 = worker.flushPendingDebugEvents();
      resolveFirst!();
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual(r2);
      expect(r1.uploaded).toBe(1);
    });
  });

  describe('120 events fully uploaded', () => {
    it('all events reach uploaded status via real flush', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 120);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      const flushPromise = worker.flushPendingDebugEvents();
      for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1100);
      const result = await flushPromise;

      expect(result.uploaded).toBe(120);
      expect(result.failed).toBe(0);
      expect(syncCounts(db)).toEqual({ pending: 0, uploading: 0, uploaded: 120 });
      worker.cleanupFlushTimer();
    });
  });

  describe('max 5 POSTs per drain', () => {
    it('stops after 5 POSTs and schedules follow-up', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 300);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      const result = await worker.flushPendingDebugEvents();

      expect(result.uploaded).toBe(250);
      expect(network._postFn).toHaveBeenCalledTimes(5);
      expect(syncCounts(db).pending).toBe(50);
      worker.cleanupFlushTimer();
    });
  });

  describe('follow-up after 5 batches', () => {
    it('scheduled follow-up processes remaining events', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 300);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      await worker.flushPendingDebugEvents();
      expect(network._postFn).toHaveBeenCalledTimes(5);
      expect(syncCounts(db).pending).toBe(50);

      await vi.advanceTimersByTimeAsync(1100);
      expect(syncCounts(db).pending).toBe(0);
      expect(syncCounts(db).uploaded).toBe(300);
      worker.cleanupFlushTimer();
    });
  });

  describe('pre-POST network state check', () => {
    it('stops when network becomes reconnecting mid-drain', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 150);
      let networkState = 'online';
      const postFn = vi.fn(async (batch: DeveloperDebugUploadEvent[]) => {
        if (network._postFn.mock.calls.length === 1) networkState = 'reconnecting';
        return { accepted: batch.length };
      });
      const network: FlushNetwork & { _postFn: ReturnType<typeof vi.fn> } = {
        postBatchDebugEvents: postFn,
        getStatusSnapshot: () => ({ state: networkState, onlineModeEnabled: true, account: { id: 'u' } }),
        _postFn: postFn,
      };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(50);
      expect(result.failed).toBe(0);
      expect(syncCounts(db).pending).toBe(100);
    });
  });

  describe('events inserted during upload', () => {
    it('new events are picked up in follow-up', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 300);
      const network = makeNetwork();
      let postCall = 0;
      (network._postFn as ReturnType<typeof vi.fn>).mockImplementation(async (batch: DeveloperDebugUploadEvent[]) => {
        postCall++;
        if (postCall === 3) {
          for (let i = 0; i < 10; i++) db.insertDeveloperDebugEvent(makeEvent({ id: `new_${i}`, payload: { i } }));
        }
        return { accepted: batch.length };
      });
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      await worker.flushPendingDebugEvents();
      expect(syncCounts(db).pending).toBeGreaterThan(0);

      await vi.advanceTimersByTimeAsync(1100);
      expect(syncCounts(db).pending).toBe(0);
      expect(syncCounts(db).uploaded).toBe(310);
      worker.cleanupFlushTimer();
    });
  });

  describe('promise finally race', () => {
    it('event inserted between last query and promise clear gets picked up', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 50);
      const network = makeNetwork();
      let postCall = 0;
      (network._postFn as ReturnType<typeof vi.fn>).mockImplementation(async (batch: DeveloperDebugUploadEvent[]) => {
        postCall++;
        if (postCall === 1) {
          for (let i = 0; i < 10; i++) db.insertDeveloperDebugEvent(makeEvent({ id: `race_${i}`, payload: { i } }));
        }
        return { accepted: batch.length };
      });
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      const p1 = worker.flushPendingDebugEvents();
      await vi.advanceTimersByTimeAsync(100);
      const r1 = await p1;
      expect(r1.uploaded).toBeGreaterThanOrEqual(50);

      if (syncCounts(db).pending > 0) {
        const p2 = worker.flushPendingDebugEvents();
        await vi.advanceTimersByTimeAsync(100);
        const r2 = await p2;
        expect(r2.uploaded).toBeGreaterThanOrEqual(10);
      }
      expect(syncCounts(db).pending).toBe(0);
      worker.cleanupFlushTimer();
    });
  });

  describe('accepted count mismatch', () => {
    it('restores pending and records error', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 10);
      const postFn = vi.fn(async () => ({ accepted: 3 }));
      const network: FlushNetwork = { postBatchDebugEvents: postFn, getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: true, account: { id: 'u' } }) };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(0);
      expect(result.failed).toBe(10);
      expect(syncCounts(db).pending).toBe(10);
      expect(syncCounts(db).uploading).toBe(0);
      expect(db.getAppSetting<string>('developer.lastUploadError')).toContain('accepted 3/10');
    });
  });

  describe('POST throws error', () => {
    it('restores pending and records error', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 5);
      const postFn = vi.fn(async () => { throw new Error('NETWORK_FAIL'); });
      const network: FlushNetwork = { postBatchDebugEvents: postFn, getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: true, account: { id: 'u' } }) };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(0);
      expect(result.failed).toBe(5);
      expect(syncCounts(db).pending).toBe(5);
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('NETWORK_FAIL');
    });
  });

  describe('partial success then failure', () => {
    it('records uploadAt for successes, error for failure', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 150);
      const postFn = vi.fn(async (batch: DeveloperDebugUploadEvent[]) => {
        if (postFn.mock.calls.length <= 2) return { accepted: batch.length };
        throw new Error('FAIL_AFTER_PARTIAL');
      });
      const network: FlushNetwork = { postBatchDebugEvents: postFn, getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: true, account: { id: 'u' } }) };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(100);
      expect(result.failed).toBe(50);
      expect(syncCounts(db).pending).toBe(50);
      expect(db.getAppSetting<string>('developer.lastUploadAt')).toBeDefined();
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('FAIL_AFTER_PARTIAL');
    });
  });

  describe('online mode disabled mid-upload', () => {
    it('stops uploading when onlineModeEnabled becomes false', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 150);
      let onlineMode = true;
      const postFn = vi.fn(async (batch: DeveloperDebugUploadEvent[]) => {
        if (postFn.mock.calls.length === 1) onlineMode = false;
        return { accepted: batch.length };
      });
      const network: FlushNetwork & { _postFn: typeof postFn } = {
        postBatchDebugEvents: postFn,
        getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: onlineMode, account: { id: 'u' } }),
        _postFn: postFn,
      };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(50);
      expect(syncCounts(db).pending).toBe(100);
    });
  });

  describe('account disappears', () => {
    it('stops when account becomes null', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 150);
      let hasAccount = true;
      const postFn = vi.fn(async (batch: DeveloperDebugUploadEvent[]) => {
        if (postFn.mock.calls.length === 1) hasAccount = false;
        return { accepted: batch.length };
      });
      const network: FlushNetwork & { _postFn: typeof postFn } = {
        postBatchDebugEvents: postFn,
        getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: true, account: hasAccount ? { id: 'u' } : null }),
        _postFn: postFn,
      };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(50);
      expect(syncCounts(db).pending).toBe(100);
    });
  });

  describe('upload setting disabled mid-upload', () => {
    it('stops when upload setting is turned off', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 150);
      const postFn = vi.fn(async (batch: DeveloperDebugUploadEvent[]) => {
        if (postFn.mock.calls.length === 1) db.setAppSetting('developer.debugUploadEnabled', false);
        return { accepted: batch.length };
      });
      const network: FlushNetwork & { _postFn: typeof postFn } = {
        postBatchDebugEvents: postFn,
        getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: true, account: { id: 'u' } }),
        _postFn: postFn,
      };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      const result = await worker.flushPendingDebugEvents();
      expect(result.uploaded).toBe(50);
      expect(syncCounts(db).pending).toBe(100);
    });
  });

  describe('packaged build', () => {
    it('returns immediately without uploading', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 10);
      const postFn = vi.fn();
      const network: FlushNetwork = { postBatchDebugEvents: postFn, getStatusSnapshot: () => ({ state: 'online', onlineModeEnabled: true, account: { id: 'u' } }) };
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig({ isPackaged: true }));

      const result = await worker.flushPendingDebugEvents();
      expect(result).toEqual({ uploaded: 0, failed: 0 });
      expect(postFn).not.toHaveBeenCalled();
    });
  });

  describe('cleanupFlushTimer', () => {
    it('stops scheduled follow-up from firing', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 300);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      vi.useFakeTimers();
      await worker.flushPendingDebugEvents();
      const calls = network._postFn.mock.calls.length;
      worker.cleanupFlushTimer();
      await vi.advanceTimersByTimeAsync(5000);
      expect(network._postFn.mock.calls.length).toBe(calls);
    });
  });

  describe('POST body validation', () => {
    it('each batch body is under 64 KiB and contains events with payload', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 120);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      await worker.flushPendingDebugEvents();

      for (const bodyStr of worker.postBodies) {
        const size = Buffer.byteLength(bodyStr, 'utf8');
        expect(size).toBeLessThanOrEqual(64 * 1024);
        const body = JSON.parse(bodyStr);
        expect(body.events.length).toBeGreaterThan(0);
        expect(body.events.length).toBeLessThanOrEqual(50);
        for (const evt of body.events) {
          expect(evt.payload).toBeDefined();
          expect(typeof evt.payload).toBe('object');
        }
      }
    });
  });

  describe('lastUploadAt and lastUploadError', () => {
    it('records lastUploadAt on success, preserves lastUploadError on failure', async () => {
      const db = createTestDb(); setupWorkerDb(db); insertEvents(db, 5);
      const network = makeNetwork();
      const worker = new DebugFlushWorker(db as unknown as FlushDb, network, makeConfig());

      await worker.flushPendingDebugEvents();
      expect(db.getAppSetting<string>('developer.lastUploadAt')).toBeDefined();

      db.insertDeveloperDebugEvent(makeEvent({ id: 'fail_event' }));
      (network._postFn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NETWORK_ERROR'));
      await worker.flushPendingDebugEvents();
      expect(db.getAppSetting<string>('developer.lastUploadError')).toBe('NETWORK_ERROR');
      expect(db.getAppSetting<string>('developer.lastUploadAt')).toBeDefined();
    });
  });
});
