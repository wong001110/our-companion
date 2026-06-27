import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  CharacterState,
  CompanionDecision,
  Discovery,
  DiscoveryPresentationCard,
  NotificationPayload,
  SpeechPayload
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
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

function extensionForMime(mimeType?: string): string {
  if (!mimeType) return '.webm';
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('ogg')) return '.ogg';
  if (mimeType.includes('mp4')) return '.mp4';
  return '.webm';
}

export async function transcribeRecording(input: TranscribeRecordingInput): Promise<TranscribeResult> {
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
      modelPath: status.modelPath,
      language: input.language,
      useGpu: input.useGpu
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function readTranscriptFromOutputFile(outputPath: string): Promise<string> {
  const content = await readFile(outputPath, 'utf8');
  return content.trim();
}

function truncateSentence(value: string, maxLength = 120): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trim()}...`;
}

export function formatSpeechPayload(input: {
  decision: Pick<CompanionDecision, 'action' | 'reason'>;
  characterState: Pick<CharacterState, 'mood'>;
  discovery?: Pick<Discovery, 'title' | 'summary'>;
}): SpeechPayload {
  const summary = input.discovery?.summary ?? input.discovery?.title ?? input.decision.reason;
  const prefix =
    input.characterState.mood === 'curious'
      ? 'I found a thread worth tugging: '
      : input.characterState.mood === 'happy'
        ? 'This looks promising: '
        : input.characterState.mood === 'focused'
          ? 'A useful signal: '
          : '';
  return {
    id: createId('speech'),
    text: truncateSentence(`${prefix}${summary}`),
    mood: input.characterState.mood,
    actionLabel: input.decision.action === 'speak' ? 'view' : undefined,
    createdAt: nowIso()
  };
}

export function createDiscoveryPresentationCard(discovery: Pick<Discovery, 'id' | 'title' | 'summary' | 'source'>): DiscoveryPresentationCard {
  return {
    id: discovery.id,
    title: discovery.title,
    summary: discovery.summary ?? discovery.title,
    source: discovery.source,
    actions: ['view', 'save', 'ignore', 'add_to_journey']
  };
}

export function createNotificationPayload(input: {
  decision: Pick<CompanionDecision, 'action' | 'reason'>;
  title: string;
  body: string;
  focusMode?: boolean;
}): NotificationPayload {
  const shouldNotify = input.decision.action === 'speak' && !input.focusMode;
  return {
    id: createId('notification'),
    title: input.title,
    body: truncateSentence(input.body, 160),
    shouldNotify,
    reason: shouldNotify ? 'Decision selected speak and focus mode is off.' : 'Notification suppressed by decision or focus mode.',
    createdAt: nowIso()
  };
}

// ============================================================================
// Speech Engine V2 — Provider interfaces and session management
// ============================================================================

export type { SpeechToTextProvider, TextToSpeechProvider } from './providers';
export { MockSpeechToTextProvider, MockTextToSpeechProvider } from './providers';
export { ListenManager } from './listen-manager';
