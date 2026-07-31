import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseService } from '@our-companion/database';
import type { AssetUploadProgress, BuiltAssetPack, CachedAssetPack, CompanionAssetManifest, NetworkAssetPack, PublicCompanionProfile, ShareableTopicInput, ShareableTopicSummary } from '@our-companion/shared';
import type { NetworkConnectionService } from '../networkConnection';
import { buildAssetManifest, canonicalJson } from './assetManifestBuilder';

const CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class PublicCompanionService {
  private publishProgress?: AssetUploadProgress;
  private publishAbort?: AbortController;
  private downloadAbort?: AbortController;
  private readonly activeVisitDownloads = new Map<string, AbortController>();
  private readonly visitDownloadPromises = new Map<string, Promise<CachedAssetPack>>();

  constructor(private readonly db: DatabaseService, private readonly network: NetworkConnectionService, private readonly userDataDir: string) {}

  getMine = () => this.network.getMyCompanions();
  async create(input: { localCompanionId: string; name: string; publicDescription?: string; publicTags?: string[] }) {
    this.requireLocalCompanion(input.localCompanionId);
    const scope = await this.scope();
    const existing = this.db.getNetworkCompanionLink(scope.serverOrigin, scope.networkAccountId, input.localCompanionId);
    if (existing) {
      const companion = await this.network.updateNetworkCompanion(existing.networkCompanionId, { name: input.name, publicDescription: input.publicDescription, publicTags: input.publicTags });
      return { networkCompanionId: existing.networkCompanionId, companion };
    }
    const result = await this.network.createNetworkCompanion({ name: input.name, publicDescription: input.publicDescription, publicTags: input.publicTags });
    this.db.upsertNetworkCompanionLink({ ...scope, localCompanionId: input.localCompanionId, networkCompanionId: result.networkCompanionId });
    return result;
  }
  update = (companionId: string, input: { name: string; publicDescription?: string; publicTags?: string[] }): Promise<PublicCompanionProfile> => this.network.updateNetworkCompanion(companionId, input);
  activate = (companionId: string) => this.network.activateNetworkCompanion(companionId);
  publish = (companionId: string) => this.network.publishNetworkCompanion(companionId);
  unpublish = (companionId: string) => this.network.unpublishNetworkCompanion(companionId);
  updateSocialPolicy = (companionId: string, input: { randomVisitsEnabled?: boolean; randomVisitAudience?: 'friends'; allowJoinRequests?: boolean }): Promise<PublicCompanionProfile> => this.network.updateNetworkCompanionSocialPolicy(companionId, input);
  listShareableTopics = (companionId: string): Promise<ShareableTopicSummary[]> => this.network.listShareableTopics(companionId);
  createShareableTopic = (companionId: string, input: ShareableTopicInput): Promise<ShareableTopicSummary> => this.network.createShareableTopic(companionId, input);
  updateShareableTopic = (companionId: string, topicId: string, input: ShareableTopicInput): Promise<ShareableTopicSummary> => this.network.updateShareableTopic(companionId, topicId, input);
  revokeShareableTopic = (companionId: string, topicId: string): Promise<ShareableTopicSummary> => this.network.revokeShareableTopic(companionId, topicId);
  getFriendCompanion = (friendUserId: string) => this.network.getFriendCompanion(friendUserId);

  inspectLocalPack(input: { localCompanionId: string; includeVoices?: boolean }): BuiltAssetPack {
    const built = this.build(input.localCompanionId, input.includeVoices);
    return { manifest: built.manifest, manifestHash: built.manifestHash, totalFiles: built.totalFiles, totalBytes: built.totalBytes, requiredAnimations: built.requiredAnimations };
  }

  async publishPack(input: { localCompanionId: string; networkCompanionId: string; includeVoices?: boolean }): Promise<NetworkAssetPack> {
    if (this.publishAbort) throw new Error('ASSET_PUBLISH_IN_PROGRESS');
    const abort = new AbortController(); this.publishAbort = abort;
    try {
      this.publishProgress = { completedFiles: 0, totalFiles: 0, uploadedBytes: 0, totalBytes: 0, state: 'preparing' };
      const built = this.build(input.localCompanionId, input.includeVoices);
      this.publishProgress = { ...this.publishProgress, totalFiles: built.totalFiles, totalBytes: built.totalBytes };
      const initiated = await this.network.initiateAssetPack(input.networkCompanionId, { schemaVersion: 1, manifestHash: built.manifestHash, totalFiles: built.totalFiles, totalBytes: built.totalBytes, manifest: built.manifest });
      if (initiated.reused) {
        const reusedPack = initiated.requiresActivation ? { ...initiated.assetPack, status: 'active' as const } : initiated.assetPack;
        if (initiated.requiresActivation) await this.network.activateAssetPack(initiated.assetPack.id);
        this.publishProgress = { ...this.publishProgress, assetPackId: initiated.assetPack.id, completedFiles: built.totalFiles, uploadedBytes: built.totalBytes, state: 'completed' };
        await this.saveLink(input.localCompanionId, input.networkCompanionId, reusedPack, built.manifestHash);
        return reusedPack;
      }
      this.publishProgress = { ...this.publishProgress, assetPackId: initiated.assetPack.id, state: 'uploading' };
      const manifestFiles = built.manifest.files;
      const fileIds = initiated.fileIds;
      if (!fileIds || fileIds.length !== manifestFiles.length) throw new Error('ASSET_PACK_FILE_MISSING');
      for (let offset = 0; offset < fileIds.length; offset += 50) {
        const response = await this.network.getUploadUrls(initiated.assetPack.id, fileIds.slice(offset, offset + 50));
        await this.withConcurrency(response.uploads, 3, async record => {
          const source = built.filePaths.get(record.relativePath);
          if (!source) throw new Error('ASSET_PACK_FILE_MISSING');
          const size = fs.statSync(source).size;
          await this.uploadWithRetry(record, fs.readFileSync(source), abort.signal, async () => (await this.network.getUploadUrls(initiated.assetPack.id, [record.fileId])).uploads[0]);
          this.publishProgress = { ...this.publishProgress!, completedFiles: this.publishProgress!.completedFiles + 1, uploadedBytes: this.publishProgress!.uploadedBytes + size, currentFile: record.relativePath };
        });
      }
      this.publishProgress = { ...this.publishProgress, state: 'verifying' };
      const completed = await this.network.completeAssetPack(initiated.assetPack.id);
      this.publishProgress = { ...this.publishProgress, state: 'completed', completedFiles: built.totalFiles, uploadedBytes: built.totalBytes };
      await this.saveLink(input.localCompanionId, input.networkCompanionId, completed.assetPack, built.manifestHash);
      return completed.assetPack;
    } catch (error) {
      this.publishProgress = { ...(this.publishProgress ?? { completedFiles: 0, totalFiles: 0, uploadedBytes: 0, totalBytes: 0 }), state: abort.signal.aborted ? 'cancelled' : 'failed', failureCode: error instanceof Error ? error.message : 'ASSET_INTEGRITY_FAILED' };
      throw error;
    } finally { this.publishAbort = undefined; }
  }

  cancelPublish = async () => { this.publishAbort?.abort(); };
  cancelDownload = async () => { this.downloadAbort?.abort(); };
  cancelVisitDownload = async (sessionId: string) => { for (const [key, abort] of this.activeVisitDownloads) if (key === sessionId || key.startsWith(`${sessionId}:`)) abort.abort(); };
  cancelTransfers = () => { this.publishAbort?.abort(); this.downloadAbort?.abort(); this.activeVisitDownloads.forEach((abort) => abort.abort()); };
  getPublishStatus = async () => this.publishProgress ? { ...this.publishProgress } : undefined;

  async downloadPack(input: { assetPackId: string; networkCompanionId: string }): Promise<CachedAssetPack> {
    return this.downloadPackFromSource(input, () => this.network.getAssetPackManifest(input.assetPackId), (fileIds) => this.network.getDownloadUrls(input.assetPackId, fileIds));
  }

  async downloadVisitPack(input: { sessionId: string; assetPackId: string; networkCompanionId: string }): Promise<CachedAssetPack> {
    const existing = this.visitDownloadPromises.get(input.sessionId);
    if (existing) return existing;
    const download = this.downloadPackFromSource(input, () => this.network.getVisitSessionManifest(input.sessionId), (fileIds) => this.network.getVisitSessionDownloadUrls(input.sessionId, fileIds), { authorizationFirst: true, sessionId: input.sessionId })
      .finally(() => this.visitDownloadPromises.delete(input.sessionId));
    this.visitDownloadPromises.set(input.sessionId, download);
    return download;
  }

  /** Returns only the verified immutable manifest used to construct a remote visual runtime. */
  async getVerifiedVisitVisualManifest(input: { sessionId: string; assetPackId: string; networkCompanionId: string }): Promise<CompanionAssetManifest> {
    await this.downloadVisitPack(input);
    return this.readVerifiedCachedManifest(input.assetPackId);
  }

  async downloadVisitParticipantPack(input: { sessionId: string; participantId: string; assetPackId: string; networkCompanionId: string }): Promise<CachedAssetPack> {
    const key = `${input.sessionId}:${input.participantId}`;
    const existing = this.visitDownloadPromises.get(key);
    if (existing) return existing;
    const download = this.downloadPackFromSource(input, () => this.network.getVisitParticipantManifest(input.sessionId, input.participantId), (fileIds) => this.network.getVisitParticipantDownloadUrls(input.sessionId, input.participantId, fileIds), { authorizationFirst: true, sessionId: key })
      .finally(() => this.visitDownloadPromises.delete(key));
    this.visitDownloadPromises.set(key, download);
    return download;
  }

  async getVerifiedVisitParticipantVisualManifest(input: { sessionId: string; participantId: string; assetPackId: string; networkCompanionId: string }): Promise<CompanionAssetManifest> {
    await this.downloadVisitParticipantPack(input);
    return this.readVerifiedCachedManifest(input.assetPackId);
  }

  async hasNetworkCompanionMapping(networkCompanionId: string): Promise<boolean> {
    const scope = await this.scope();
    return Boolean(this.db.getNetworkCompanionLinkByNetworkId(scope.serverOrigin, scope.networkAccountId, networkCompanionId));
  }

  async getLocalCompanionId(networkCompanionId: string): Promise<string | undefined> {
    const scope = await this.scope();
    return this.db.getNetworkCompanionLinkByNetworkId(scope.serverOrigin, scope.networkAccountId, networkCompanionId)?.localCompanionId;
  }

  /** Used exclusively by the safe `companion-network:` protocol handler. Never returns a path. */
  readVerifiedCachedAsset(assetPackId: string, relativePath: string): { bytes: Buffer; mimeType: string } {
    const status = this.network.getStatusSnapshot();
    if (!status.account || !status.onlineModeEnabled || status.state !== 'online') throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    const cache = this.db.getCachedNetworkAssetPackWithRoot(status.serverUrl, assetPackId);
    if (!cache?.verified || !this.verifyCache(cache.cacheRoot, cache.manifestHash)) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    const manifest = this.readManifest(cache.cacheRoot);
    const declared = manifest.files.find((file) => file.relativePath === relativePath);
    if (!declared || !declared.mimeType.startsWith('image/')) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    const source = safeDestination(cache.cacheRoot, relativePath);
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    return { bytes: fs.readFileSync(source), mimeType: declared.mimeType };
  }

  private async downloadPackFromSource(
    input: { assetPackId: string; networkCompanionId: string },
    getManifest: () => Promise<{ manifest: import('@our-companion/shared').CompanionAssetManifest; files: Array<{ id: string; relativePath: string; sizeBytes: number; sha256: string; mimeType: string }> }>,
    getDownloadUrls: (fileIds: string[]) => Promise<{ downloads: Array<{ fileId: string; relativePath: string; downloadUrl: string; expiresAt: string; sizeBytes: number; sha256: string; mimeType: string }> }>,
    options?: { authorizationFirst?: boolean; sessionId?: string },
  ): Promise<CachedAssetPack> {
    const isVisitDownload = Boolean(options?.sessionId);
    if (!isVisitDownload && this.downloadAbort) throw new Error('ASSET_DOWNLOAD_IN_PROGRESS');
    const abort = new AbortController();
    if (isVisitDownload && options?.sessionId) this.activeVisitDownloads.set(options.sessionId, abort);
    else this.downloadAbort = abort;
    let partial: string | undefined;
    try {
      const scope = await this.scope();
      const existing = this.db.getCachedNetworkAssetPackWithRoot(scope.serverOrigin, input.assetPackId);
      if (!options?.authorizationFirst && existing && existing.verified && this.verifyCache(existing.cacheRoot, existing.manifestHash)) {
        const refreshed = { ...existing, lastUsedAt: new Date().toISOString() };
        this.db.upsertCachedNetworkAssetPack(refreshed); return withoutRoot(refreshed);
      }
      const payload = await getManifest();
      const manifestHash = createHash('sha256').update(canonicalJson(payload.manifest), 'utf8').digest('hex');
      if (options?.authorizationFirst && existing && existing.verified && existing.manifestHash === manifestHash && this.verifyCache(existing.cacheRoot, manifestHash)) {
        const refreshed = { ...existing, lastUsedAt: new Date().toISOString() };
        this.db.upsertCachedNetworkAssetPack(refreshed); return withoutRoot(refreshed);
      }
      const originHash = createHash('sha256').update(scope.serverOrigin, 'utf8').digest('hex');
      const base = path.join(this.userDataDir, 'network-cache', originHash, 'asset-packs');
      const partialRoot = path.join(base, '.partial', `${input.assetPackId}-${randomUUID()}`);
      partial = partialRoot;
      const finalRoot = path.join(base, input.assetPackId);
      fs.mkdirSync(partialRoot, { recursive: true });
      for (let offset = 0; offset < payload.files.length; offset += 50) {
        const result = await getDownloadUrls(payload.files.slice(offset, offset + 50).map(file => file.id));
        await this.withConcurrency(result.downloads, 3, async record => {
          const file = payload.files.find(item => item.relativePath === record.relativePath);
          if (!file || file.sizeBytes !== record.sizeBytes || file.sha256 !== record.sha256) throw new Error('ASSET_INTEGRITY_FAILED');
          const destination = safeDestination(partialRoot, record.relativePath);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          const bytes = await this.downloadWithRetry(record, abort.signal, async () => (await getDownloadUrls([record.fileId])).downloads[0]);
          if (bytes.byteLength !== record.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('ASSET_INTEGRITY_FAILED');
          fs.writeFileSync(destination, bytes, { flag: 'wx' });
        });
      }
      fs.writeFileSync(path.join(partialRoot, 'manifest.json'), canonicalJson(payload.manifest), { flag: 'wx' });
      if (!this.verifyCache(partialRoot, manifestHash)) throw new Error('ASSET_INTEGRITY_FAILED');
      fs.rmSync(finalRoot, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(finalRoot), { recursive: true }); fs.renameSync(partialRoot, finalRoot);
      const timestamp = new Date().toISOString();
      const cache = { serverOrigin: scope.serverOrigin, assetPackId: input.assetPackId, networkCompanionId: input.networkCompanionId, manifestHash, cacheRoot: finalRoot, totalBytes: payload.files.reduce((sum, file) => sum + file.sizeBytes, 0), downloadedAt: timestamp, lastUsedAt: timestamp, pinned: false, verified: true };
      this.db.upsertCachedNetworkAssetPack(cache);
      return withoutRoot(cache);
    } finally {
      if (partial && fs.existsSync(partial)) fs.rmSync(partial, { recursive: true, force: true });
      if (this.downloadAbort === abort) this.downloadAbort = undefined;
      if (options?.sessionId && this.activeVisitDownloads.get(options.sessionId) === abort) this.activeVisitDownloads.delete(options.sessionId);
    }
  }
  async getCachedPack(assetPackId: string): Promise<CachedAssetPack | undefined> { const scope = await this.scope(); const cache = this.db.getCachedNetworkAssetPackWithRoot(scope.serverOrigin, assetPackId); return cache?.verified && this.verifyCache(cache.cacheRoot, cache.manifestHash) ? withoutRoot(cache) : undefined; }
  async clearUnusedCache() { let removed = 0; let bytesFreed = 0; let total = 0; const now = Date.now(); const records = this.db.listCachedNetworkAssetPacks(); for (const record of records) total += record.totalBytes; for (const record of records) { if (record.pinned || (total <= CACHE_MAX_BYTES && now - Date.parse(record.lastUsedAt) <= CACHE_MAX_AGE_MS)) continue; fs.rmSync(record.cacheRoot, { recursive: true, force: true }); this.db.deleteCachedNetworkAssetPack(record.serverOrigin, record.assetPackId); total -= record.totalBytes; bytesFreed += record.totalBytes; removed++; } return { removed, bytesFreed }; }

  private build(localCompanionId: string, includeVoices?: boolean) { this.requireLocalCompanion(localCompanionId); return buildAssetManifest({ companionId: localCompanionId, includeVoices, pathOptions: { userDataDir: this.userDataDir, companionExists: id => Boolean(this.db.getCompanion(id)) } }); }
  private async scope() { const status = await this.network.getStatus(); if (!status.account || !status.onlineModeEnabled) throw new Error('ONLINE_MODE_DISABLED'); return { serverOrigin: status.serverUrl, networkAccountId: status.account.id }; }
  private requireLocalCompanion(id: string) { if (!this.db.getCompanion(id)) throw new Error('COMPANION_NOT_FOUND'); }
  private async saveLink(localCompanionId: string, networkCompanionId: string, pack: NetworkAssetPack, manifestHash: string) { const scope = await this.scope(); this.db.upsertNetworkCompanionLink({ ...scope, localCompanionId, networkCompanionId, activeAssetPackId: pack.status === 'active' ? pack.id : undefined, lastPublishedManifestHash: manifestHash, lastPublishedAt: new Date().toISOString(), publishStatus: pack.status }); }
  private async uploadWithRetry(record: { uploadUrl: string; requiredHeaders: Record<string, string> }, body: Buffer, signal: AbortSignal, reSign: () => Promise<{ uploadUrl: string; requiredHeaders: Record<string, string> }>) { let current = record; let resigns = 0; const bytes = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer; for (let attempt = 0; attempt < 3; attempt++) { const response = await fetch(current.uploadUrl, { method: 'PUT', headers: current.requiredHeaders, body: bytes, signal }); if (response.ok) return; if ((response.status === 401 || response.status === 403) && resigns++ < 2) { current = await reSign(); continue; } if (response.status >= 400 && response.status < 500) throw new Error('ASSET_INTEGRITY_FAILED'); await waitForRetry(250 * 2 ** attempt, signal); } throw new Error('ASSET_INTEGRITY_FAILED'); }
  private async downloadWithRetry(record: { downloadUrl: string }, signal: AbortSignal, reSign: () => Promise<{ downloadUrl: string }>): Promise<Buffer> { let current = record; let resigns = 0; for (let attempt = 0; attempt < 3; attempt++) { const response = await fetch(current.downloadUrl, { signal }); if (response.ok) return Buffer.from(await response.arrayBuffer()); if ((response.status === 401 || response.status === 403) && resigns++ < 2) { current = await reSign(); continue; } if (response.status >= 400 && response.status < 500) throw new Error('ASSET_INTEGRITY_FAILED'); await waitForRetry(250 * 2 ** attempt, signal); } throw new Error('ASSET_INTEGRITY_FAILED'); }
  private async withConcurrency<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) { let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; await task(items[index]); } })); }
  private readVerifiedCachedManifest(assetPackId: string): CompanionAssetManifest {
    const status = this.network.getStatusSnapshot();
    if (!status.account || !status.onlineModeEnabled) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    const cache = this.db.getCachedNetworkAssetPackWithRoot(status.serverUrl, assetPackId);
    if (!cache?.verified || !this.verifyCache(cache.cacheRoot, cache.manifestHash)) throw new Error('VISUAL_VISIT_ASSET_UNAVAILABLE');
    return this.readManifest(cache.cacheRoot);
  }
  private readManifest(root: string): CompanionAssetManifest {
    return JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')) as CompanionAssetManifest;
  }
  private verifyCache(root: string, expectedManifestHash: string) { try { const manifestPath = path.join(root, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); if (createHash('sha256').update(canonicalJson(manifest), 'utf8').digest('hex') !== expectedManifestHash) return false; for (const file of manifest.files) { const source = safeDestination(root, file.relativePath); const bytes = fs.readFileSync(source); if (bytes.byteLength !== file.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) return false; } return true; } catch { return false; } }
}

function safeDestination(root: string, relativePath: string): string { if (!relativePath || !relativePath.startsWith('assets/') || relativePath.includes('\\') || relativePath.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\0'))) throw new Error('ASSET_PACK_MANIFEST_INVALID'); const target = path.resolve(root, 'files', relativePath); if (!target.startsWith(`${root}${path.sep}`)) throw new Error('ASSET_PACK_MANIFEST_INVALID'); return target; }
function withoutRoot(cache: CachedAssetPack & { cacheRoot: string }): CachedAssetPack { const { cacheRoot: _cacheRoot, ...visible } = cache; return visible; }
function waitForRetry(ms: number, signal: AbortSignal) { return new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true }); }); }
