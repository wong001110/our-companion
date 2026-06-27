import type { CharacterState, CompanionDecision, Discovery, DiscoveryPresentationCard, NotificationPayload, SpeechPayload } from '@our-companion/shared';
import { prepareWavFromRecording } from './audioConvert.js';
import { DEFAULT_MODEL_FILE, getWhisperPaths, getWhisperStatus, type WhisperStatus } from './paths.js';
import { transcribeAudioFile, type TranscribeResult, type WhisperOptions } from './whisperRunner.js';
export { DEFAULT_MODEL_FILE, getWhisperPaths, getWhisperStatus, prepareWavFromRecording, transcribeAudioFile };
export { ELECTRON_APP_NAME, getDefaultUserDataRoot } from './userDataPath.js';
export type { TranscribeResult, WhisperOptions, WhisperStatus };
export interface TranscribeRecordingInput {
    audio: ArrayBuffer | Uint8Array;
    mimeType?: string;
    userDataRoot: string;
    language?: string;
    useGpu?: boolean;
}
export declare function transcribeRecording(input: TranscribeRecordingInput): Promise<TranscribeResult>;
export declare function readTranscriptFromOutputFile(outputPath: string): Promise<string>;
export declare function formatSpeechPayload(input: {
    decision: Pick<CompanionDecision, 'action' | 'reason'>;
    characterState: Pick<CharacterState, 'mood'>;
    discovery?: Pick<Discovery, 'title' | 'summary'>;
}): SpeechPayload;
export declare function createDiscoveryPresentationCard(discovery: Pick<Discovery, 'id' | 'title' | 'summary' | 'source'>): DiscoveryPresentationCard;
export declare function createNotificationPayload(input: {
    decision: Pick<CompanionDecision, 'action' | 'reason'>;
    title: string;
    body: string;
    focusMode?: boolean;
}): NotificationPayload;
export type { SpeechToTextProvider, TextToSpeechProvider } from './providers';
export { MockSpeechToTextProvider, MockTextToSpeechProvider } from './providers';
export { ListenManager } from './listen-manager';
