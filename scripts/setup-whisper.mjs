#!/usr/bin/env node
/**
 * Downloads the Whisper GGML model into Electron's userData directory.
 * Run: npm run whisper:setup
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { copyFile, rm } from 'node:fs/promises';
import { get } from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin';
const DEFAULT_MODEL_FILE = 'ggml-small.bin';
const MIN_MODEL_BYTES = 1024 * 1024;

function getElectronAppName() {
  const desktopPkgPath = path.join(repoRoot, 'apps', 'desktop', 'package.json');
  const desktopPkg = JSON.parse(readFileSync(desktopPkgPath, 'utf8'));
  return desktopPkg.name;
}

function getDefaultUserDataRoot() {
  const appName = getElectronAppName();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? os.homedir(), appName);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }
  throw new Error(`Unsupported platform: ${process.platform}. Only win32 and darwin are supported.`);
}

function getLegacyUserDataRoot() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? os.homedir(), 'our-companion');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'our-companion');
  }
  return null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading ${url}`);

    const request = (targetUrl, redirectsLeft = 5) => {
      if (redirectsLeft <= 0) {
        reject(new Error(`Too many redirects for ${url}`));
        return;
      }

      get(targetUrl, (res) => {
        if (
          res.statusCode === 301 ||
          res.statusCode === 302 ||
          res.statusCode === 307 ||
          res.statusCode === 308
        ) {
          const nextUrl = res.headers.location;
          if (!nextUrl) {
            reject(new Error(`Redirect without location header for ${targetUrl}`));
            return;
          }
          res.resume();
          request(nextUrl, redirectsLeft - 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
          return;
        }

        const file = createWriteStream(dest);
        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let received = 0;

        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\r  Progress: ${pct}%`);
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          resolve();
        });
        file.on('error', reject);
      }).on('error', reject);
    };

    request(url);
  });
}

function isValidModelFile(modelPath) {
  if (!existsSync(modelPath)) return false;
  return statSync(modelPath).size > MIN_MODEL_BYTES;
}

async function migrateLegacyModel(modelPath) {
  const legacyRoot = getLegacyUserDataRoot();
  if (!legacyRoot) return false;

  const legacyModelPath = path.join(legacyRoot, 'whisper', 'models', DEFAULT_MODEL_FILE);
  if (!isValidModelFile(legacyModelPath)) return false;

  mkdirSync(path.dirname(modelPath), { recursive: true });
  await copyFile(legacyModelPath, modelPath);
  console.log(`✓ Migrated model from legacy location:\n  ${legacyModelPath}`);
  return true;
}

async function main() {
  const userDataPath = getDefaultUserDataRoot();
  const modelDir = path.join(userDataPath, 'whisper', 'models');
  const modelPath = path.join(modelDir, DEFAULT_MODEL_FILE);

  mkdirSync(modelDir, { recursive: true });

  console.log(`Platform : ${process.platform} (${os.arch()})`);
  console.log(`Data dir : ${userDataPath}`);
  console.log('');

  if (isValidModelFile(modelPath)) {
    console.log(`✓ Whisper model already present at:\n  ${modelPath}`);
  } else if (await migrateLegacyModel(modelPath)) {
    console.log(`✓ Whisper model ready at:\n  ${modelPath}`);
  } else {
    if (existsSync(modelPath)) {
      await rm(modelPath, { force: true });
    }
    console.log('Downloading ggml-small.bin (~466 MB)...');
    await download(MODEL_URL, modelPath);
    console.log(`✓ Installed model to:\n  ${modelPath}`);
  }

  console.log('\nWhisper setup complete. You can now use voice input in the app.');
}

main().catch((err) => {
  console.error('\n✗ Setup failed:', err.message);
  process.exit(1);
});
