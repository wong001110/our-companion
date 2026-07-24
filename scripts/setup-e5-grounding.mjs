import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MODEL_ID = 'Xenova/multilingual-e5-small';

function defaultCacheDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? os.homedir(), '@our-companion', 'desktop', 'models');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', '@our-companion', 'desktop', 'models');
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), '@our-companion', 'desktop', 'models');
}

async function main() {
  const cacheDir = process.env.OUR_COMPANION_E5_CACHE ?? defaultCacheDir();
  await mkdir(cacheDir, { recursive: true });
  const { env, pipeline } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  env.localModelPath = cacheDir;
  env.allowLocalModels = true;
  // This script is the explicit user-triggered setup path. Normal chat always
  // calls initialize(), which leaves remote access disabled.
  env.allowRemoteModels = true;
  try {
    console.log(`Installing ${MODEL_ID} into ${cacheDir}`);
    const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
    const probe = await extractor('query: grounding setup probe', { pooling: 'mean', normalize: true, truncation: true, max_length: 512 });
    const dimensions = probe.dims?.at(-1);
    if (dimensions !== 384) throw new Error(`Unexpected E5 dimensions: ${dimensions}`);
    console.log(`Installed ${MODEL_ID} (384 dimensions).`);
    console.log(`Run QA with: OUR_COMPANION_E5_CACHE=${cacheDir} npm run qa:e5-grounding`);
  } finally {
    env.allowRemoteModels = false;
  }
}

main().catch((error) => {
  console.error(`E5 setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
