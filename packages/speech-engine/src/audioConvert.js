import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
export function resolveFfmpegPath() {
    if (!ffmpegPath) {
        throw new Error('ffmpeg-static binary is not available on this platform.');
    }
    return ffmpegPath;
}
export async function prepareWavFromRecording(inputPath, outputPath) {
    const ffmpeg = resolveFfmpegPath();
    await runProcess(ffmpeg, [
        '-y',
        '-i',
        inputPath,
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        outputPath
    ]);
    return outputPath;
}
function runProcess(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true });
        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? 'unknown'}`));
        });
    });
}
