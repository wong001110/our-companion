import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CompanionAssetPathError, getCompanionAssetMimeType, resolveCompanionAssetPath } from './companionAssetPaths';

function withTempRoot(fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-assets-'));
  try {
    fs.mkdirSync(path.join(root, 'companions', 'companion_1', 'assets', 'animations'), { recursive: true });
    fs.mkdirSync(path.join(root, 'companions', 'companion_1', 'assets', 'portraits'), { recursive: true });
    fs.writeFileSync(path.join(root, 'companions', 'companion_1', 'assets', 'animations', 'Idle_Neutral.png'), 'png');
    fs.writeFileSync(path.join(root, 'companions', 'companion_1', 'assets', 'animations', 'nested.json'), '{}');
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('companion asset path resolver', () => {
  const companionExists = (id: string) => id === 'companion_1';

  it('resolves valid animation and portrait asset paths inside the Companion root', () => withTempRoot((root) => {
    const animation = resolveCompanionAssetPath({
      companionId: 'companion_1',
      subfolder: 'animations',
      fileName: 'Idle_Neutral.png',
      mustExist: true,
    }, { userDataDir: root, companionExists });
    expect(animation.target).toBe(path.join(root, 'companions', 'companion_1', 'assets', 'animations', 'Idle_Neutral.png'));

    const portrait = resolveCompanionAssetPath({
      companionId: 'companion_1',
      subfolder: 'portraits',
      fileName: 'profile.webp',
    }, { userDataDir: root, companionExists });
    expect(portrait.target).toBe(path.join(root, 'companions', 'companion_1', 'assets', 'portraits', 'profile.webp'));
  }));

  it('rejects unsupported subfolders, basename traversal, encoded traversal, absolute paths, null bytes, and unknown Companions', () => withTempRoot((root) => {
    const options = { userDataDir: root, companionExists };
    expect(() => resolveCompanionAssetPath({ companionId: 'companion_1', subfolder: 'secrets', fileName: 'x.png' }, options)).toThrow(CompanionAssetPathError);
    expect(() => resolveCompanionAssetPath({ companionId: 'companion_1', subfolder: 'animations', fileName: '../x.png' }, options)).toThrow(CompanionAssetPathError);
    expect(() => resolveCompanionAssetPath({ companionId: 'companion_1', relativePath: 'assets/%2e%2e/x.png' }, options)).toThrow(CompanionAssetPathError);
    expect(() => resolveCompanionAssetPath({ companionId: 'companion_1', relativePath: path.resolve(root, 'outside.png') }, options)).toThrow(CompanionAssetPathError);
    expect(() => resolveCompanionAssetPath({ companionId: 'companion_1', subfolder: 'animations', fileName: 'bad\0.png' }, options)).toThrow(CompanionAssetPathError);
    expect(() => resolveCompanionAssetPath({ companionId: 'missing', subfolder: 'animations', fileName: 'x.png' }, options)).toThrow(CompanionAssetPathError);
  }));

  it('blocks directory targets, symlink escapes where supported, and unsupported extensions at the call site', () => withTempRoot((root) => {
    const options = { userDataDir: root, companionExists };
    const directory = resolveCompanionAssetPath({
      companionId: 'companion_1',
      relativePath: 'assets/animations',
      mustExist: true,
    }, options);
    expect(fs.lstatSync(directory.target).isDirectory()).toBe(true);
    expect(getCompanionAssetMimeType('payload.exe')).toBeNull();

    try {
      fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'companions', 'companion_1', 'assets', 'animations', 'escape.png'));
    } catch {
      return;
    }
    expect(() => resolveCompanionAssetPath({
      companionId: 'companion_1',
      subfolder: 'animations',
      fileName: 'escape.png',
      mustExist: true,
    }, options)).toThrow(CompanionAssetPathError);
  }));
});
