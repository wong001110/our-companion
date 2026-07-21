import type { DeveloperDebugEvent, DeveloperDebugUploadEvent } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import { buildDeveloperDebugUploadBatch, batchBodyByteSize } from './developerDebugUpload';

export interface FlushDb {
  listDeveloperDebugEvents(opts: { syncStatus?: 'pending' | 'uploading' | 'uploaded'; limit?: number }): DeveloperDebugEvent[];
  countDeveloperDebugEvents(opts: { syncStatus?: 'pending' | 'uploading' | 'uploaded' }): number;
  markDeveloperDebugEventsUploading(ids: string[]): void;
  markDeveloperDebugEventsUploaded(ids: string[]): void;
  markDeveloperDebugEventsPending(ids: string[]): void;
  getAppSetting<T>(key: string): T | undefined;
  setAppSetting(key: string, value: unknown): void;
}

export interface FlushNetwork {
  postBatchDebugEvents(batch: DeveloperDebugUploadEvent[]): Promise<{ accepted: number }>;
  getStatusSnapshot(): { state: string; onlineModeEnabled: boolean; account?: { id: string } | null };
}

export interface FlushConfig {
  isPackaged: boolean;
}

export interface FlushResult {
  uploaded: number;
  failed: number;
}

const MAX_POSTS_PER_DRAIN = 5;
const MAX_BATCH_BYTES = 64 * 1024;

export class DebugFlushWorker {
  private debugFlushPromise?: Promise<FlushResult>;
  private debugFlushRequested = false;
  private debugFlushTimer?: ReturnType<typeof setTimeout>;
  private _postCount = 0;
  private _postBodies: string[] = [];

  get postCount(): number { return this._postCount; }
  get postBodies(): string[] { return this._postBodies; }

  constructor(
    private readonly db: FlushDb,
    private readonly network: FlushNetwork,
    private readonly config: FlushConfig,
  ) {}

  private canUpload(): boolean {
    if (this.config.isPackaged) return false;
    const ns = this.network.getStatusSnapshot();
    if (!ns.onlineModeEnabled || ns.state !== 'online') return false;
    if (!ns.account) return false;
    if (!this.db.getAppSetting<boolean>('developer.debugUploadEnabled')) return false;
    return true;
  }

  async flushPendingDebugEvents(): Promise<FlushResult> {
    if (this.config.isPackaged) return { uploaded: 0, failed: 0 };
    if (this.debugFlushPromise) {
      this.debugFlushRequested = true;
      return this.debugFlushPromise;
    }
    this.debugFlushPromise = this.doFlushPendingDebugEvents();
    try {
      return await this.debugFlushPromise;
    } finally {
      this.debugFlushPromise = undefined;
      if (this.debugFlushRequested) {
        this.debugFlushRequested = false;
        const remaining = this.db.countDeveloperDebugEvents({ syncStatus: 'pending' });
        if (remaining > 0) this.scheduleFlushFollowUp();
      }
    }
  }

  private scheduleFlushFollowUp(): void {
    if (this.debugFlushTimer) return;
    this.debugFlushTimer = setTimeout(() => {
      this.debugFlushTimer = undefined;
      void this.flushPendingDebugEvents();
    }, 1000);
  }

  cleanupFlushTimer(): void {
    if (this.debugFlushTimer) {
      clearTimeout(this.debugFlushTimer);
      this.debugFlushTimer = undefined;
    }
  }

  private async doFlushPendingDebugEvents(): Promise<FlushResult> {
    let postsThisDrain = 0;
    let totalUploaded = 0;
    let totalFailed = 0;

    while (postsThisDrain < MAX_POSTS_PER_DRAIN) {
      if (!this.canUpload()) break;

      const pending = this.db.listDeveloperDebugEvents({ syncStatus: 'pending', limit: 50 });
      if (pending.length === 0) break;

      const batches = buildDeveloperDebugUploadBatch(pending);
      if (batches.length === 0) break;

      const batch = batches[0];
      if (batch.length === 0) break;

      const batchBody = JSON.stringify({ events: batch });
      if (Buffer.byteLength(batchBody, 'utf8') > MAX_BATCH_BYTES) {
        const fallback: DeveloperDebugUploadEvent[] = batch.slice(0, 1).map((e) => ({
          clientEventId: e.clientEventId,
          kind: e.kind,
          operation: e.operation,
          status: e.status,
          errorMessage: e.errorMessage,
          clientCreatedAt: e.clientCreatedAt,
          payload: { uploadTruncated: true, originalPayloadBytes: Buffer.byteLength(JSON.stringify(e.payload), 'utf8') },
        }));
        const fallbackIds = pending.slice(0, 1).map((e) => e.id);
        try {
          this.db.markDeveloperDebugEventsUploading(fallbackIds);
          this._postCount++;
          this._postBodies.push(JSON.stringify({ events: fallback }));
          const result = await this.network.postBatchDebugEvents(fallback);
          postsThisDrain++;
          if (result.accepted !== fallback.length) {
            this.db.markDeveloperDebugEventsPending(fallbackIds);
            const msg = `Batch accepted ${result.accepted}/${fallback.length}`;
            this.db.setAppSetting('developer.lastUploadError', msg);
            totalFailed += fallback.length;
            break;
          }
          this.db.markDeveloperDebugEventsUploaded(fallbackIds);
          totalUploaded += fallback.length;
          if (!this.canUpload()) break;
          continue;
        } catch (error) {
          this.db.markDeveloperDebugEventsPending(fallbackIds);
          const msg = error instanceof Error ? error.message : String(error);
          this.db.setAppSetting('developer.lastUploadError', msg);
          totalFailed += fallback.length;
          break;
        }
      }

      if (!this.canUpload()) break;

      const batchIds = batch.map((e) => e.clientEventId);
      const dbIds = pending.filter((e) => batchIds.includes(e.id)).map((e) => e.id);

      try {
        this.db.markDeveloperDebugEventsUploading(dbIds);
        this._postCount++;
        this._postBodies.push(JSON.stringify({ events: batch }));
        const result = await this.network.postBatchDebugEvents(batch);
        postsThisDrain++;

        if (result.accepted !== batch.length) {
          this.db.markDeveloperDebugEventsPending(dbIds);
          const msg = `Batch accepted ${result.accepted}/${batch.length}`;
          this.db.setAppSetting('developer.lastUploadError', msg);
          totalFailed += batch.length;
          break;
        }

        this.db.markDeveloperDebugEventsUploaded(dbIds);
        totalUploaded += batch.length;
        if (!this.canUpload()) break;
      } catch (error) {
        this.db.markDeveloperDebugEventsPending(dbIds);
        const msg = error instanceof Error ? error.message : String(error);
        this.db.setAppSetting('developer.lastUploadError', msg);
        totalFailed += batch.length;
        break;
      }
    }

    if (totalUploaded > 0) {
      this.db.setAppSetting('developer.lastUploadAt', nowIso());
    }

    if (postsThisDrain >= MAX_POSTS_PER_DRAIN) {
      const remaining = this.db.countDeveloperDebugEvents({ syncStatus: 'pending' });
      if (remaining > 0) this.scheduleFlushFollowUp();
    }

    return { uploaded: totalUploaded, failed: totalFailed };
  }
}
