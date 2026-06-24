import path from 'node:path';
export const DEFAULT_MODEL_FILE = 'ggml-tiny.en.bin';
export const WHISPER_BINARY_NAME = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
export function getWhisperPaths(userDataRoot) {
    const root = path.join(userDataRoot, 'whisper');
    const binDir = path.join(root, 'bin');
    const modelDir = path.join(root, 'models');
    return {
        root,
        binDir,
        modelDir,
        binary: path.join(binDir, WHISPER_BINARY_NAME),
        model: path.join(modelDir, DEFAULT_MODEL_FILE)
    };
}
export async function getWhisperStatus(userDataRoot, exists = defaultExists) {
    const paths = getWhisperPaths(userDataRoot);
    const hasBinary = await exists(paths.binary);
    const hasModel = await exists(paths.model);
    if (!hasBinary && !hasModel) {
        return {
            ready: false,
            model: DEFAULT_MODEL_FILE,
            binaryPath: paths.binary,
            modelPath: paths.model,
            error: 'Whisper binary and model are missing. Run npm run whisper:setup.'
        };
    }
    if (!hasBinary) {
        return {
            ready: false,
            model: DEFAULT_MODEL_FILE,
            binaryPath: paths.binary,
            modelPath: paths.model,
            error: 'Whisper binary is missing. Run npm run whisper:setup.'
        };
    }
    if (!hasModel) {
        return {
            ready: false,
            model: DEFAULT_MODEL_FILE,
            binaryPath: paths.binary,
            modelPath: paths.model,
            error: 'Whisper model is missing. Run npm run whisper:setup.'
        };
    }
    return {
        ready: true,
        model: DEFAULT_MODEL_FILE,
        binaryPath: paths.binary,
        modelPath: paths.model
    };
}
async function defaultExists(filePath) {
    const { access } = await import('node:fs/promises');
    try {
        await access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
