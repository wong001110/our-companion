import { describe, expect, it } from 'vitest';
import { getWhisperPaths, getWhisperStatus } from './paths.js';
describe('speech-engine paths', () => {
    it('resolves whisper paths under user data', () => {
        const paths = getWhisperPaths('C:/Users/demo/AppData/our-companion');
        expect(paths.binary).toContain('whisper');
        expect(paths.model).toContain('ggml-tiny.en.bin');
    });
    it('reports missing assets', async () => {
        const status = await getWhisperStatus('/missing/root', async () => false);
        expect(status.ready).toBe(false);
        expect(status.error).toContain('Whisper');
    });
    it('reports ready when binary and model exist', async () => {
        const paths = getWhisperPaths('/ready/root');
        const status = await getWhisperStatus('/ready/root', async (filePath) => {
            return filePath === paths.binary || filePath === paths.model;
        });
        expect(status.ready).toBe(true);
    });
});
