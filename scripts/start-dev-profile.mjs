#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function normalizeProfile(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!PROFILE_PATTERN.test(normalized)) {
    throw new Error('Profile must use 1-40 lowercase letters, numbers, hyphens, or underscores, and must start with a letter or number.');
  }
  return normalized;
}

function appDataRoot() {
  if (process.platform === 'win32') return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

async function assertBuilt() {
  const required = [
    'apps/desktop/dist/electron/main/index.js',
    'apps/desktop/dist/electron/preload/index.cjs',
    'apps/desktop/dist/renderer/index.html',
  ];
  try {
    await Promise.all(required.map((relativePath) => access(path.join(repoRoot, relativePath))));
  } catch {
    throw new Error('Desktop build not found. Run `npm run build` before starting a real development profile.');
  }
}

const profile = normalizeProfile(process.argv[2]);
await assertBuilt();

const profileRoot = path.join(appDataRoot(), 'Our Companion Dev');
const userDataDir = path.join(profileRoot, profile);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log(`[our-companion] Starting real development profile "${profile}".`);
console.log(`[our-companion] Isolated userData: ${userDataDir}`);
console.log('[our-companion] Smoke runtime is disabled; onboarding, AI, SQLite, Network sessions, and Social behavior are normal.');

const child = spawn(npmCommand, ['run', 'start', '-w', '@our-companion/desktop'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    OUR_COMPANION_DEV_PROFILE_ENABLED: '1',
    OUR_COMPANION_DEV_PROFILE: profile,
    OUR_COMPANION_DEV_PROFILE_ROOT: profileRoot,
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`[our-companion] Failed to launch profile "${profile}":`, error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
