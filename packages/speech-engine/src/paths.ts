import path from 'node:path';

export const DEFAULT_MODEL_FILE = 'ggml-small.bin';
export const MIN_MODEL_BYTES = 1024 * 1024;

export interface WhisperPaths {
  root: string;
  modelDir: string;
  model: string;
}

export function getWhisperPaths(userDataRoot: string): WhisperPaths {
  const root = path.join(userDataRoot, 'whisper');
  const modelDir = path.join(root, 'models');
  return {
    root,
    modelDir,
    model: path.join(modelDir, DEFAULT_MODEL_FILE)
  };
}

export interface WhisperStatus {
  ready: boolean;
  model: string;
  modelPath: string;
  error?: string;
}

export async function getWhisperStatus(
  userDataRoot: string,
  stat: (filePath: string) => Promise<number | null> = defaultStat
): Promise<WhisperStatus> {
  const paths = getWhisperPaths(userDataRoot);
  const modelSize = await stat(paths.model);
  const hasModel = modelSize !== null && modelSize > MIN_MODEL_BYTES;

  if (!hasModel) {
    return {
      ready: false,
      model: DEFAULT_MODEL_FILE,
      modelPath: paths.model,
      error: 'Whisper model is missing. Run npm run whisper:setup.'
    };
  }

  return {
    ready: true,
    model: DEFAULT_MODEL_FILE,
    modelPath: paths.model
  };
}

async function defaultStat(filePath: string): Promise<number | null> {
  const { stat } = await import('node:fs/promises');
  try {
    const info = await stat(filePath);
    return info.size;
  } catch {
    return null;
  }
}
