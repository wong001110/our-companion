import { spawn } from 'node:child_process';
export async function transcribeAudioFile(wavPath, options) {
    const args = [
        '-m',
        options.modelPath,
        '-f',
        wavPath,
        '-l',
        options.language ?? 'en',
        '-nt',
        '-np'
    ];
    const stdout = await runWhisper(options.binaryPath, args);
    const text = stdout.trim();
    if (!text) {
        throw new Error('Whisper returned an empty transcript.');
    }
    return { text, language: options.language ?? 'en' };
}
function runWhisper(binaryPath, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(binaryPath, args, { windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(stderr.trim() || stdout.trim() || `whisper exited with code ${code ?? 'unknown'}`));
        });
    });
}
