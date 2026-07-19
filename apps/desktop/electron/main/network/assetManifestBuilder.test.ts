import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANION_ANIMATION_MANIFEST } from '@our-companion/shared';
import { buildAssetManifest } from './assetManifestBuilder';

function withAssets(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's3-pack-'));
  const assets = path.join(root, 'companions', 'companion-1', 'assets', 'animations'); fs.mkdirSync(assets, { recursive: true });
  for (const name of ['Idle_Neutral', 'Enter', 'Leave']) fs.writeFileSync(path.join(assets, `${name}.png`), pngHeader(300, 300));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function pngHeader(width: number, height: number) { const bytes = Buffer.alloc(24); bytes.write('\x89PNG', 0, 'binary'); bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12, 'ascii'); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); return bytes; }
const options = (root: string) => ({ userDataDir: root, companionExists: (id: string) => id === 'companion-1' });

describe('S3 asset manifest builder', () => {
  it('is deterministic and creates explicit required animation mappings', () => withAssets(root => {
    const first = buildAssetManifest({ companionId: 'companion-1', pathOptions: options(root) });
    const second = buildAssetManifest({ companionId: 'companion-1', pathOptions: options(root) });
    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.manifest.runtime.animations.map(animation => animation.name)).toEqual(['Enter', 'Idle_Neutral', 'Leave']);
    expect(first.requiredAnimations).toEqual({ Idle_Neutral: true, Enter: true, Leave: true });
    expect(COMPANION_ANIMATION_MANIFEST.filter(entry => entry.requiredForNetworkVisitor).map(entry => entry.key))
      .toEqual(['Idle_Neutral', 'Enter', 'Leave']);
    expect(first.manifest.runtime.animations.find(animation => animation.name === 'Idle_Neutral')?.frameDurationMs).toBe(520);
  }));
  it('rejects a pack missing any shared visitor-required animation', () => {
    for (const missing of ['Idle_Neutral', 'Enter', 'Leave'] as const) {
      withAssets(root => {
        fs.unlinkSync(path.join(root, 'companions', 'companion-1', 'assets', 'animations', `${missing}.png`));
        expect(() => buildAssetManifest({ companionId: 'companion-1', pathOptions: options(root) }))
          .toThrow('ASSET_PACK_MANIFEST_INVALID');
      });
    }
  });
  it('rejects symlinked and unsupported files', () => withAssets(root => {
    const animations = path.join(root, 'companions', 'companion-1', 'assets', 'animations');
    try { fs.symlinkSync(path.join(root, 'outside.png'), path.join(animations, 'escape.png')); } catch { return; }
    expect(() => buildAssetManifest({ companionId: 'companion-1', pathOptions: options(root) })).toThrow('ASSET_PACK_MANIFEST_INVALID');
  }));
  it('uses the shared Walk timing in portable metadata', () => withAssets(root => {
    const animations = path.join(root, 'companions', 'companion-1', 'assets', 'animations');
    fs.writeFileSync(path.join(animations, 'Walk_Right.png'), pngHeader(600, 300));
    const pack = buildAssetManifest({ companionId: 'companion-1', pathOptions: options(root) });
    const walk = pack.manifest.runtime.animations.find(animation => animation.name === 'Walk_Right');
    expect(walk).toMatchObject({ frameCount: 2, frameDurationMs: 180, loop: true });
  }));
});
