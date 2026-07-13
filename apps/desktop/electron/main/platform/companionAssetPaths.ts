import fs from 'node:fs';
import path from 'node:path';

export const COMPANION_ASSET_SUBFOLDERS = ['animations', 'portraits', 'icons', 'voices'] as const;
export type CompanionAssetSubfolder = typeof COMPANION_ASSET_SUBFOLDERS[number];

const ASSET_EXTENSION_MIME = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.json', 'application/json'],
]);

export interface ResolveCompanionAssetPathInput {
  companionId: string;
  subfolder?: string;
  fileName?: string;
  relativePath?: string;
  mustExist?: boolean;
}

export interface ResolveCompanionAssetPathOptions {
  userDataDir: string;
  companionExists: (companionId: string) => boolean;
}

export interface ResolvedCompanionAssetPath {
  companionId: string;
  root: string;
  target: string;
  relativePath: string;
}

export class CompanionAssetPathError extends Error {
  constructor(message: string, readonly code: 'bad_request' | 'not_found' | 'forbidden' | 'unsupported') {
    super(message);
  }
}

export function getCompanionAssetMimeType(fileName: string): string | null {
  return ASSET_EXTENSION_MIME.get(path.extname(fileName).toLowerCase()) ?? null;
}

export function isSupportedCompanionAssetExtension(fileName: string): boolean {
  return getCompanionAssetMimeType(fileName) !== null;
}

export function resolveCompanionAssetPath(
  input: ResolveCompanionAssetPathInput,
  options: ResolveCompanionAssetPathOptions
): ResolvedCompanionAssetPath {
  const companionId = validateCompanionId(input.companionId);
  if (!options.companionExists(companionId)) {
    throw new CompanionAssetPathError('Companion not found.', 'not_found');
  }

  const relativePath = input.relativePath !== undefined
    ? normalizeRelativePath(input.relativePath)
    : buildAssetRelativePath(input.subfolder, input.fileName);

  const root = path.resolve(options.userDataDir, 'companions', companionId);
  const target = path.resolve(root, relativePath);
  assertContained(root, target);
  assertNoSymlinkEscape(root, target, Boolean(input.mustExist));

  if (input.mustExist && !fs.existsSync(target)) {
    throw new CompanionAssetPathError('Asset not found.', 'not_found');
  }

  return { companionId, root, target, relativePath };
}

function validateCompanionId(companionId: string): string {
  if (!companionId || companionId.includes('\0')) {
    throw new CompanionAssetPathError('Invalid Companion ID.', 'bad_request');
  }
  if (companionId.includes('/') || companionId.includes('\\') || companionId !== path.basename(companionId)) {
    throw new CompanionAssetPathError('Invalid Companion ID.', 'bad_request');
  }
  return companionId;
}

function buildAssetRelativePath(subfolder?: string, fileName?: string): string {
  if (!subfolder || !COMPANION_ASSET_SUBFOLDERS.includes(subfolder as CompanionAssetSubfolder)) {
    throw new CompanionAssetPathError('Unsupported Companion asset subfolder.', 'bad_request');
  }
  if (!fileName) {
    throw new CompanionAssetPathError('Asset file name is required.', 'bad_request');
  }
  const cleanName = decodePathSegment(fileName);
  if (
    cleanName.includes('\0') ||
    cleanName.includes('/') ||
    cleanName.includes('\\') ||
    cleanName === '..' ||
    cleanName === '.' ||
    cleanName !== path.basename(cleanName) ||
    path.isAbsolute(cleanName)
  ) {
    throw new CompanionAssetPathError('Invalid asset file name.', 'bad_request');
  }
  return path.join('assets', subfolder, cleanName);
}

function normalizeRelativePath(relativePath: string): string {
  const decoded = decodePathSegment(relativePath);
  if (!decoded || decoded.includes('\0') || path.isAbsolute(decoded) || /^[a-zA-Z]:/.test(decoded)) {
    throw new CompanionAssetPathError('Invalid asset path.', 'bad_request');
  }
  const unified = decoded.replaceAll('\\', '/');
  if (unified.split('/').some((part) => part === '..')) {
    throw new CompanionAssetPathError('Asset path escapes Companion root.', 'forbidden');
  }
  const normalized = path.normalize(unified);
  if (normalized === '.' || normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new CompanionAssetPathError('Asset path escapes Companion root.', 'forbidden');
  }
  return normalized;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new CompanionAssetPathError('Malformed asset path encoding.', 'bad_request');
  }
}

function assertContained(root: string, target: string): void {
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new CompanionAssetPathError('Asset path escapes Companion root.', 'forbidden');
  }
}

function assertNoSymlinkEscape(root: string, target: string, mustExist: boolean): void {
  if (!fs.existsSync(root)) return;
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CompanionAssetPathError('Asset path escapes Companion root.', 'forbidden');
  }

  let current = root;
  for (const part of relative.split(path.sep)) {
    if (!part) continue;
    current = path.join(current, part);
    let stat: fs.Stats;
    try {
      // `existsSync` follows links and treats a dangling symlink as absent.
      // Inspect the directory entry itself so every symbolic-link path is rejected.
      stat = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (mustExist) throw new CompanionAssetPathError('Asset not found.', 'not_found');
      continue;
    }
    if (stat.isSymbolicLink()) {
      throw new CompanionAssetPathError('Companion asset paths cannot include symbolic links.', 'forbidden');
    }
  }
}
