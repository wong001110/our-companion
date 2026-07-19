import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { COMPANION_ANIMATION_MANIFEST, type BuiltAssetPack, type CompanionAssetManifest } from '@our-companion/shared';
import { resolveCompanionAssetPath, getCompanionAssetMimeType, type ResolveCompanionAssetPathOptions } from '../platform/companionAssetPaths';

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.json', '.mp3', '.wav', '.ogg']);
const VOICE = new Set(['.mp3', '.wav', '.ogg']);
const DEFAULT_LIMITS = { maxFileBytes: 20 * 1024 * 1024, maxPackBytes: 500 * 1024 * 1024, maxFiles: 1000 };

export function buildAssetManifest(input: { companionId: string; includeVoices?: boolean; pathOptions: ResolveCompanionAssetPathOptions; limits?: Partial<typeof DEFAULT_LIMITS> }): BuiltAssetPack & { filePaths: Map<string, string> } {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const root = resolveCompanionAssetPath({ companionId: input.companionId, relativePath: 'assets', mustExist: true }, input.pathOptions);
  if (!fs.lstatSync(root.target).isDirectory()) throw new Error('ASSET_PACK_MANIFEST_INVALID');
  const files = new Map<string, string>();
  collectFiles(root.target, root.target, files);
  if (!files.size || files.size > limits.maxFiles) throw new Error('ASSET_PACK_LIMIT_EXCEEDED');
  const lower = new Set<string>();
  const entries: CompanionAssetManifest['files'] = [];
  let totalBytes = 0;
  for (const [relativePath, filePath] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const normalized = `assets/${relativePath}`;
    const key = normalized.toLowerCase();
    if (lower.has(key)) throw new Error('ASSET_PACK_MANIFEST_INVALID');
    lower.add(key);
    const extension = path.extname(normalized).toLowerCase();
    if (VOICE.has(extension) && !input.includeVoices) continue;
    if (!ALLOWED.has(extension) || extension === '.svg') throw new Error('ASSET_PACK_FILE_INVALID');
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > limits.maxFileBytes) throw new Error('ASSET_PACK_LIMIT_EXCEEDED');
    const mimeType = getCompanionAssetMimeType(normalized);
    if (!mimeType) throw new Error('ASSET_PACK_FILE_INVALID');
    if (extension === '.json') {
      try { JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { throw new Error('ASSET_PACK_FILE_INVALID'); }
    }
    totalBytes += stat.size;
    if (totalBytes > limits.maxPackBytes) throw new Error('ASSET_PACK_LIMIT_EXCEEDED');
    entries.push({ relativePath: normalized, category: categoryFor(normalized), mimeType, sizeBytes: stat.size, sha256: hashFile(filePath) });
  }
  const byPath = new Set(entries.map(entry => entry.relativePath));
  const animations = COMPANION_ANIMATION_MANIFEST
    .map(definition => ({ definition, relativePath: `assets/animations/${definition.fileName}` }))
    .filter(({ relativePath }) => byPath.has(relativePath))
    .map(({ definition, relativePath }) => {
      const source = files.get(relativePath.slice('assets/'.length));
      if (!source) throw new Error('ASSET_PACK_FILE_MISSING');
      const sprite = readPngSpriteMetadata(source);
      return { name: definition.key, format: 'sprite_sheet' as const, files: [relativePath], frameWidth: sprite.frameWidth, frameHeight: sprite.frameHeight, frameCount: sprite.frameCount, frameDurationMs: definition.frameDurationMs, loop: definition.loop };
    });
  const animationNames = new Set(animations.map(animation => animation.name));
  const requiredVisitorAnimations = COMPANION_ANIMATION_MANIFEST
    .filter((definition) => definition.requiredForNetworkVisitor)
    .map((definition) => definition.key);
  for (const required of requiredVisitorAnimations) {
    if (!animationNames.has(required)) throw new Error('ASSET_PACK_MANIFEST_INVALID');
  }
  const portraitPath = entries.find(entry => entry.category === 'portrait')?.relativePath;
  const iconPath = entries.find(entry => entry.category === 'icon')?.relativePath;
  const manifest: CompanionAssetManifest = {
    format: 'our-companion-asset-pack', schemaVersion: 1,
    runtime: { defaultAnimation: 'Idle_Neutral', ...(portraitPath ? { portraitPath } : {}), ...(iconPath ? { iconPath } : {}), animations: animations.sort((a, b) => a.name.localeCompare(b.name)) },
    files: entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
  };
  const canonical = canonicalJson(manifest);
  const requiredAnimations = Object.fromEntries(
    requiredVisitorAnimations.map((name) => [name, true]),
  ) as BuiltAssetPack['requiredAnimations'];
  return { manifest, manifestHash: createHash('sha256').update(canonical, 'utf8').digest('hex'), totalFiles: entries.length, totalBytes, requiredAnimations, filePaths: new Map(entries.map(entry => [entry.relativePath, path.join(root.target, entry.relativePath.slice('assets/'.length))])) };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function collectFiles(root: string, directory: string, files: Map<string, string>): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '.DS_Store') throw new Error('ASSET_PACK_MANIFEST_INVALID');
    const target = path.join(directory, entry.name);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error('ASSET_PACK_MANIFEST_INVALID');
    if (stat.isDirectory()) collectFiles(root, target, files);
    else if (stat.isFile()) files.set(path.relative(root, target).split(path.sep).join('/'), target);
    else throw new Error('ASSET_PACK_FILE_INVALID');
  }
}
function categoryFor(relativePath: string): CompanionAssetManifest['files'][number]['category'] { if (relativePath.startsWith('assets/animations/')) return 'animation'; if (relativePath.startsWith('assets/portraits/')) return 'portrait'; if (relativePath.startsWith('assets/icons/')) return 'icon'; if (relativePath.startsWith('assets/voices/')) return 'voice'; return 'metadata'; }
function hashFile(filePath: string): string { return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function readPngSpriteMetadata(filePath: string) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('ASSET_PACK_FILE_INVALID');
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (!width || !height || width % height !== 0 || height < 300 || height > 4096) throw new Error('ASSET_PACK_MANIFEST_INVALID');
  const frameCount = width / height;
  if (frameCount < 1 || frameCount > 120) throw new Error('ASSET_PACK_MANIFEST_INVALID');
  return { frameWidth: height, frameHeight: height, frameCount };
}
