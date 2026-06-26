import { transcribeWithAddon } from './whisperAddon.js';
export async function transcribeAudioFile(wavPath, options) {
    const result = await transcribeWithAddon({
        fname_inp: wavPath,
        model: options.modelPath,
        language: options.language ?? 'auto',
        use_gpu: options.useGpu ?? false,
        no_prints: true,
        translate: false,
        no_timestamps: true
    });
    const text = normalizeTranscript(result);
    if (!text) {
        throw new Error('I could not hear clear speech in that recording. Please try again a little closer to the microphone.');
    }
    return { text, language: options.language ?? 'auto' };
}
function normalizeTranscript(result) {
    if (!result || typeof result !== 'object' || !('transcription' in result)) {
        return '';
    }
    const { transcription } = result;
    if (Array.isArray(transcription)) {
        if (transcription.length === 0)
            return '';
        if (Array.isArray(transcription[0])) {
            return transcription.flat().join(' ').trim();
        }
        return transcription.join(' ').trim();
    }
    return String(transcription).trim();
}
