import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseService } from '@our-companion/database';
import type { AssetUploadProgress, BuiltAssetPack, CachedAssetPack, NetworkAssetPack, PublicCompanionProfile } from '@our-companion/shared';
import type { NetworkConnectionService } from '../networkConnection';
import { buildAssetManifest, canonicalJson } from './assetManifestBuilder';

const CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class PublicCompanionService {
  private publishProgress?: AssetUploadProgress;
  private publishAbort?: AbortController;
  private downloadAbort?: AbortController;

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
        this.publishProgress = { ...this.publishProgress, assetPackId: initiated.assetPack.id, completedFiles: built.totalFiles, uploadedBytes: built.totalBytes, state: 'completed' };
        await this.saveLink(input.localCompanionId, input.networkCompanionId, initiated.assetPack, built.manifestHash);
        return initiated.assetPack;
      }
      this.publishProgress = { ...this.publishProgress, assetPackId: initiated.assetPack.id, state: 'uploading' };
      const manifestFiles = built.manifest.files;
      const fileIds = initiated.fileIds;
      if (!fileIds || fileIds.length !== manifestFiles.length) throw new Error('ASSET_PACK_FILE_MISSING');
      const uploadRecords: Array<{ relativePath: string; uploadUrl: string; requiredHeaders: { 'content-type': string; 'x-amz-meta-sha256': string } }> = [];
      for (let offset = 0; offset < fileIds.length; offset += 50) {
        const response = await this.network.getUploadUrls(initiated.assetPack.id, fileIds.slice(offset, offset + 50));
        uploadRecords.push(...response.uploads);
      }
      await this.withConcurrency(uploadRecords, 3, async record => {
        const source = built.filePaths.get(record.relativePath);
        if (!source) throw new Error('ASSET_PACK_FILE_MISSING');
        const size = fs.statSync(source).size;
        await this.uploadWithRetry(record.uploadUrl, fs.readFileSync(source), record.requiredHeaders, abort.signal);
        this.publishProgress = { ...this.publishProgress!, completedFiles: this.publishProgress!.completedFiles + 1, uploadedBytes: this.publishProgress!.uploadedBytes + size, currentFile: record.relativePath };
      });
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
  getPublishStatus = async () => this.publishProgress ? { ...this.publishProgress } : undefined;

  async downloadPack(input: { assetPackId: string; networkCompanionId: string }): Promise<CachedAssetPack> {
    const scope = await this.scope();
    const existing = this.db.getCachedNetworkAssetPackWithRoot(scope.serverOrigin, input.assetPackId);
    if (existing && existing.verified && this.verifyCache(existing.cacheRoot, existing.manifestHash)) {
      const refreshed = { ...existing, lastUsedAt: new Date().toISOString() };
      this.db.upsertCachedNetworkAssetPack(refreshed); return withoutRoot(refreshed);
    }
    const abort = new AbortController(); this.downloadAbort = abort;
    const payload = await this.network.getAssetPackManifest(input.assetPackId);
    const manifestHash = createHash('sha256').update(canonicalJson(payload.manifest), 'utf8').digest('hex');
    const originHash = createHash('sha256').update(scope.serverOrigin, 'utf8').digest('hex');
    const base = path.join(this.userDataDir, 'network-cache', originHash, 'asset-packs');
    const partial = path.join(base, '.partial', `${input.assetPackId}-${randomUUID()}`);
    const finalRoot = path.join(base, input.assetPackId);
    try {
      fs.mkdirSync(partial, { recursive: true });
      const downloads: Array<{ relativePath: string; downloadUrl: string; sizeBytes: number; sha256: string }> = [];
      for (let offset = 0; offset < payload.files.length; offset += 50) {
        const result = await this.network.getDownloadUrls(input.assetPackId, payload.files.slice(offset, offset + 50).map(file => file.id));
        downloads.push(...result.downloads);
      }
      await this.withConcurrency(downloads, 3, async record => {
        const file = payload.files.find(item => item.relativePath === record.relativePath);
        if (!file || file.sizeBytes !== record.sizeBytes || file.sha256 !== record.sha256) throw new Error('ASSET_INTEGRITY_FAILED');
        const destination = safeDestination(partial, record.relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const response = await fetch(record.downloadUrl, { signal: abort.signal });
        if (!response.ok) throw new Error('ASSET_INTEGRITY_FAILED');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength !== record.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('ASSET_INTEGRITY_FAILED');
        fs.writeFileSync(destination, bytes, { flag: 'wx' });
      });
      fs.writeFileSync(path.join(partial, 'manifest.json'), canonicalJson(payload.manifest), { flag: 'wx' });
      if (!this.verifyCache(partial, manifestHash)) throw new Error('ASSET_INTEGRITY_FAILED');
      fs.rmSync(finalRoot, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(finalRoot), { recursive: true }); fs.renameSync(partial, finalRoot);
      const timestamp = new Date().toISOString();
      const cache = { serverOrigin: scope.serverOrigin, assetPackId: input.assetPackId, networkCompanionId: input.networkCompanionId, manifestHash, cacheRoot: finalRoot, totalBytes: payload.files.reduce((sum, file) => sum + file.sizeBytes, 0), downloadedAt: timestamp, lastUsedAt: timestamp, pinned: false, verified: true };
      this.db.upsertCachedNetworkAssetPack(cache);
      return withoutRoot(cache);
    } finally { if (fs.existsSync(partial)) fs.rmSync(partial, { recursive: true, force: true }); this.downloadAbort = undefined; }
  }
  async getCachedPack(assetPackId: string): Promise<CachedAssetPack | undefined> { const scope = await this.scope(); const cache = this.db.getCachedNetworkAssetPackWithRoot(scope.serverOrigin, assetPackId); return cache?.verified && this.verifyCache(cache.cacheRoot, cache.manifestHash) ? withoutRoot(cache) : undefined; }
  async clearUnusedCache() { let removed = 0; let bytesFreed = 0; let total = 0; const now = Date.now(); const records = this.db.listCachedNetworkAssetPacks(); for (const record of records) total += record.totalBytes; for (const record of records) { if (record.pinned || (total <= CACHE_MAX_BYTES && now - Date.parse(record.lastUsedAt) <= CACHE_MAX_AGE_MS)) continue; fs.rmSync(record.cacheRoot, { recursive: true, force: true }); this.db.deleteCachedNetworkAssetPack(record.serverOrigin, record.assetPackId); total -= record.totalBytes; bytesFreed += record.totalBytes; removed++; } return { removed, bytesFreed }; }

  private build(localCompanionId: string, includeVoices?: boolean) { this.requireLocalCompanion(localCompanionId); return buildAssetManifest({ companionId: localCompanionId, includeVoices, pathOptions: { userDataDir: this.userDataDir, companionExists: id => Boolean(this.db.getCompanion(id)) } }); }
  private async scope() { const status = await this.network.getStatus(); if (!status.account || !status.onlineModeEnabled) throw new Error('ONLINE_MODE_DISABLED'); return { serverOrigin: status.serverUrl, networkAccountId: status.account.id }; }
  private requireLocalCompanion(id: string) { if (!this.db.getCompanion(id)) throw new Error('COMPANION_NOT_FOUND'); }
  private async saveLink(localCompanionId: string, networkCompanionId: string, pack: NetworkAssetPack, manifestHash: string) { const scope = await this.scope(); this.db.upsertNetworkCompanionLink({ ...scope, localCompanionId, networkCompanionId, activeAssetPackId: pack.status === 'active' ? pack.id : undefined, lastPublishedManifestHash: manifestHash, lastPublishedAt: new Date().toISOString(), publishStatus: pack.status }); }
  private async uploadWithRetry(url: string, body: Buffer, headers: Record<string, string>, signal: AbortSignal) { const bytes = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer; for (let attempt = 0; attempt < 3; attempt++) { const response = await fetch(url, { method: 'PUT', headers, body: bytes, signal }); if (response.ok) return; if (response.status >= 400 && response.status < 500) throw new Error('ASSET_INTEGRITY_FAILED'); await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt)); } throw new Error('ASSET_INTEGRITY_FAILED'); }
  private async withConcurrency<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) { let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; await task(items[index]); } })); }
  private verifyCache(root: string, expectedManifestHash: string) { try { const manifestPath = path.join(root, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); if (createHash('sha256').update(canonicalJson(manifest), 'utf8').digest('hex') !== expectedManifestHash) return false; for (const file of manifest.files) { const source = safeDestination(root, file.relativePath); const bytes = fs.readFileSync(source); if (bytes.byteLength !== file.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) return false; } return true; } catch { return false; } }
}

function safeDestination(root: string, relativePath: string): string { if (!relativePath || !relativePath.startsWith('assets/') || relativePath.includes('\\') || relativePath.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\0'))) throw new Error('ASSET_PACK_MANIFEST_INVALID'); const target = path.resolve(root, 'files', relativePath); if (!target.startsWith(`${root}${path.sep}`)) throw new Error('ASSET_PACK_MANIFEST_INVALID'); return target; }
function withoutRoot(cache: CachedAssetPack & { cacheRoot: string }): CachedAssetPack { const { cacheRoot: _cacheRoot, ...visible } = cache; return visible; }
