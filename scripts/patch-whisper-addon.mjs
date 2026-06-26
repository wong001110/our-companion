#!/usr/bin/env node
/**
 * Fixes @kutalia/whisper-node-addon packaging issues on macOS:
 * - prebuilt binaries live under mac-arm64/mac-x64, not darwin-*
 * - whisper.node needs @loader_path rpath to find bundled dylibs
 */

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function patchMacAddon(platformDir) {
  const packageRoot = path.dirname(require.resolve('@kutalia/whisper-node-addon/package.json'));
  const addonPath = path.join(packageRoot, 'dist', platformDir, 'whisper.node');
  if (!existsSync(addonPath)) return;

  try {
    execFileSync('install_name_tool', ['-add_rpath', '@loader_path/.', addonPath], { stdio: 'pipe' });
    console.log(`[whisper-addon] Patched rpath for ${platformDir}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('would duplicate path')) {
      console.log(`[whisper-addon] rpath already set for ${platformDir}`);
      return;
    }
    throw error;
  }
}

if (process.platform === 'darwin') {
  patchMacAddon('mac-arm64');
  patchMacAddon('mac-x64');
}
