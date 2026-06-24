import { prepareWavFromRecording } from './audioConvert.js';
import { DEFAULT_MODEL_FILE, getWhisperPaths, getWhisperStatus, type WhisperStatus } from './paths.js';
import { transcribeAudioFile, type TranscribeResult, type WhisperOptions } from './whisperRunner.js';
export { DEFAULT_MODEL_FILE, getWhisperPaths, getWhisperStatus, prepareWavFromRecording, transcribeAudioFile };
export type { TranscribeResult, WhisperOptions, WhisperStatus };
export interface TranscribeRecordingInput {
    audio: ArrayBuffer | Uint8Array;
    mimeType?: string;
    userDataRoot: string;
}
export declare function transcribeRecording(input: TranscribeRecordingInput): Promise<TranscribeResult>;
export declare function readTranscriptFromOutputFile(outputPath: string): Promise<string>;
