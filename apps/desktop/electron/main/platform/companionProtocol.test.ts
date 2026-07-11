import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleCompanionProtocolRequest } from './companionProtocol';

async function withProtocolFixture(fn: (root: string) => void | Promise<void>): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-protocol-'));
  try {
    const assets = path.join(root, 'companions', 'companion_1', 'assets', 'animations');
    fs.mkdirSync(path.join(assets, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(assets, 'Idle_Neutral.png'), 'png');
    fs.writeFileSync(path.join(assets, 'nested', 'frames.json'), '{}');
    fs.writeFileSync(path.join(assets, 'payload.exe'), 'no');
    await fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('companion protocol handler', () => {
  const companionExists = (id: string) => id === 'companion_1';

  it('serves valid supported files, including nested asset paths', async () => withProtocolFixture(async (root) => {
    const png = handleCompanionProtocolRequest('companion://companion_1/assets/animations/Idle_Neutral.png', { userDataDir: root, companionExists });
    expect(png.status).toBe(200);
    expect(png.headers.get('Content-Type')).toBe('image/png');
    expect(await png.text()).toBe('png');

    const nested = handleCompanionProtocolRequest('companion://companion_1/assets/animations/nested/frames.json', { userDataDir: root, companionExists });
    expect(nested.status).toBe(200);
    expect(nested.headers.get('Content-Type')).toBe('application/json');
  }));

  it('rejects unsupported extensions, missing files, malformed URLs, unknown Companions, traversal, and directories', () => withProtocolFixture((root) => {
    const options = { userDataDir: root, companionExists };
    expect(handleCompanionProtocolRequest('companion://companion_1/assets/animations/payload.exe', options).status).toBe(415);
    expect(handleCompanionProtocolRequest('companion://companion_1/assets/animations/missing.png', options).status).toBe(404);
    expect(handleCompanionProtocolRequest('not a url', options).status).toBe(400);
    expect(handleCompanionProtocolRequest('companion://missing/assets/animations/Idle_Neutral.png', options).status).toBe(404);
    expect(handleCompanionProtocolRequest('companion://companion_1/assets/%2e%2e/secret.png', options).status).toBe(403);
    expect(handleCompanionProtocolRequest('companion://companion_1/assets/animations/dir.png', options).status).toBe(404);
    fs.mkdirSync(path.join(root, 'companions', 'companion_1', 'assets', 'animations', 'folder.png'));
    expect(handleCompanionProtocolRequest('companion://companion_1/assets/animations/folder.png', options).status).toBe(403);
  }));

  it('rejects symlink escapes where the platform allows creating the symlink', () => withProtocolFixture((root) => {
    const options = { userDataDir: root, companionExists };
    try {
      fs.symlinkSync(path.join(root, 'outside.png'), path.join(root, 'companions', 'companion_1', 'assets', 'animations', 'escape.png'));
    } catch {
      return;
    }
    expect(handleCompanionProtocolRequest('companion://companion_1/assets/animations/escape.png', options).status).toBe(403);
  }));
});
