import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export function resolveFfmpegPath(): string {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static binary is not available on this platform.');
  }
  return ffmpegPath;
}

export async function prepareWavFromRecording(inputPath: string, outputPath: string): Promise<string> {
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

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
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
