#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const launcher = path.join(scriptDir, 'start-dev-profile.mjs');
const requested = process.argv.slice(2);
const profiles = (requested.length ? requested : ['social-a', 'social-b', 'social-c'])
  .map((value) => value.trim().toLowerCase());

if (profiles.length !== 3) {
  throw new Error('The Social Lab requires exactly three profile names.');
}
if (new Set(profiles).size !== profiles.length) {
  throw new Error('The Social Lab profile names must be unique.');
}
for (const profile of profiles) {
  if (!PROFILE_PATTERN.test(profile)) throw new Error(`Invalid Social Lab profile: ${profile}`);
}

console.log(`[our-companion] Starting real three-Companion Social Lab: ${profiles.join(', ')}`);
console.log('[our-companion] Each window uses normal runtime behavior and an isolated local profile.');

const children = profiles.map((profile) => spawn(process.execPath, [launcher, profile], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
}));

let stopping = false;
function stopAll(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(signal));
}

const results = await Promise.all(children.map((child, index) => new Promise((resolve) => {
  child.on('error', (error) => {
    console.error(`[our-companion] Profile ${profiles[index]} failed to launch:`, error);
    resolve(1);
  });
  child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
})));

process.exitCode = results.some((code) => code !== 0) ? 1 : 0;
