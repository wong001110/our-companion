import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);

type WhisperNativeParams = Record<string, unknown> & {
  model: string;
  fname_inp?: string;
  pcmf32?: Float32Array;
};

type WhisperNativeResult = {
  transcription: string[][] | string[];
};

function resolveAddonDirectory(): string {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  }
  if (platform === 'win32') {
    return 'win32-x64';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

function loadWhisperNative() {
  const packageRoot = path.dirname(require.resolve('@kutalia/whisper-node-addon/package.json'));
  const addonPath = path.join(packageRoot, 'dist', resolveAddonDirectory(), 'whisper.node');
  const { whisper } = require(addonPath) as {
    whisper: (params: WhisperNativeParams, cb: (err: Error | null, result: WhisperNativeResult) => void) => void;
  };
  return promisify(whisper);
}

let whisperNative: ReturnType<typeof promisify> | undefined;

function getWhisperNative() {
  whisperNative ??= loadWhisperNative();
  return whisperNative;
}

export async function transcribeWithAddon(options: {
  fname_inp: string;
  model: string;
  language?: string;
  use_gpu?: boolean;
  no_prints?: boolean;
  translate?: boolean;
  no_timestamps?: boolean;
}): Promise<WhisperNativeResult> {
  const shouldDetectLanguage = !options.language || options.language === 'auto';
  const params: WhisperNativeParams = {
    language: shouldDetectLanguage ? 'en' : options.language,
    use_gpu: options.use_gpu ?? false,
    flash_attn: false,
    no_prints: options.no_prints ?? true,
    comma_in_time: false,
    translate: options.translate ?? false,
    no_timestamps: options.no_timestamps ?? true,
    detect_language: shouldDetectLanguage,
    audio_ctx: 0,
    max_len: 0,
    model: options.model,
    fname_inp: options.fname_inp
  };

  return getWhisperNative()(params) as Promise<WhisperNativeResult>;
}
