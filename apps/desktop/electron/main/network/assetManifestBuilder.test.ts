import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAssetManifest } from './assetManifestBuilder';

function withAssets(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's3-pack-'));
  const assets = path.join(root, 'companions', 'companion-1', 'assets', 'animations'); fs.mkdirSync(assets, { recursive: true });
  for (const name of ['Idle_Neutral', 'Enter', 'Leave']) fs.writeFileSync(path.join(assets, `${name}.png`), name);
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const options = (root: string) => ({ userDataDir: root, companionExists: (id: string) => id === 'companion-1' });

describe('S3 asset manifest builder', () => {
  it('is deterministic and creates explicit required animation mappings', () => withAssets(root => {
    const first = buildAssetManifest({ companionId: 'companion-1', pathOptions: options(root) });
    const second = buildAssetManifest({ companionId: 'companion-1', pathOptions: options(root) });
    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.manifest.runtime.animations.map(animation => animation.name)).toEqual(['Enter', 'Idle_Neutral', 'Leave']);
  }));
  it('rejects symlinked and unsupported files', () => withAssets(root => {
    const animations = path.join(root, 'companions', 'companion-1', 'assets', 'animations');
    try { fs.symlinkSync(path.join(root, 'outside.png'), path.join(animations, 'escape.png')); } catch { return; }
    expect(() => buildAssetManifest({ companionId: 'companion-1', pathOptions: options(root) })).toThrow('ASSET_PACK_MANIFEST_INVALID');
  }));
});
