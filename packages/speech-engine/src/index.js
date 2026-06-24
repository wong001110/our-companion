import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareWavFromRecording } from './audioConvert.js';
import { DEFAULT_MODEL_FILE, getWhisperPaths, getWhisperStatus } from './paths.js';
import { transcribeAudioFile } from './whisperRunner.js';
export { DEFAULT_MODEL_FILE, getWhisperPaths, getWhisperStatus, prepareWavFromRecording, transcribeAudioFile };
function extensionForMime(mimeType) {
    if (!mimeType)
        return '.webm';
    if (mimeType.includes('wav'))
        return '.wav';
    if (mimeType.includes('ogg'))
        return '.ogg';
    if (mimeType.includes('mp4'))
        return '.mp4';
    return '.webm';
}
export async function transcribeRecording(input) {
    const status = await getWhisperStatus(input.userDataRoot);
    if (!status.ready) {
        throw new Error(status.error ?? 'Whisper is not ready.');
    }
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'our-companion-whisper-'));
    const inputExt = extensionForMime(input.mimeType);
    const inputPath = path.join(tempDir, `recording${inputExt}`);
    const wavPath = path.join(tempDir, 'recording.wav');
    try {
        const bytes = input.audio instanceof Uint8Array ? input.audio : new Uint8Array(input.audio);
        await writeFile(inputPath, bytes);
        await prepareWavFromRecording(inputPath, wavPath);
        return await transcribeAudioFile(wavPath, {
            binaryPath: status.binaryPath,
            modelPath: status.modelPath
        });
    }
    finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
export async function readTranscriptFromOutputFile(outputPath) {
    const content = await readFile(outputPath, 'utf8');
    return content.trim();
}
