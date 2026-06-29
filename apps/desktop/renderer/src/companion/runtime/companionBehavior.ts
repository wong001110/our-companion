import { t, type Lang, type TranslationKey } from '../../i18n';

export type SpeechEvent = 'ambient' | 'walk_start' | 'walk_end' | 'discovery' | 'task' | 'ask';

const speechKeys: Record<SpeechEvent, TranslationKey[]> = {
  ambient: ['speech_ambient_1', 'speech_ambient_2', 'speech_ambient_3', 'speech_ambient_4'],
  walk_start: ['speech_walk_start_1', 'speech_walk_start_2', 'speech_walk_start_3'],
  walk_end: ['speech_walk_end_1', 'speech_walk_end_2', 'speech_walk_end_3'],
  discovery: ['speech_discovery_1', 'speech_discovery_2'],
  task: ['speech_task_1', 'speech_task_2'],
  ask: ['speech_ask_1', 'speech_ask_2']
};

export function getWalkDelayRange(movementScore: number): { minMs: number; maxMs: number } {
  const score = clampScore(movementScore);
  const minMs = interpolate(60000, 9000, score / 100);
  const maxMs = interpolate(110000, 18000, score / 100);
  return {
    minMs: Math.round(minMs),
    maxMs: Math.round(Math.max(maxMs, minMs + 5000))
  };
}

export function getWalkDelay(movementScore: number, random = Math.random): number {
  const range = getWalkDelayRange(movementScore);
  return range.minMs + clamp01(random()) * (range.maxMs - range.minMs);
}

export function selectSpeechLine(event: SpeechEvent, random = Math.random, lang: Lang = 'en'): string {
  const keys = speechKeys[event];
  const index = Math.min(keys.length - 1, Math.floor(clamp01(random()) * keys.length));
  return t(lang, keys[index]);
}

export function getSpeechDuration(message: string): number {
  const characters = Array.from(message);
  if (characters.length === 0) return 1000;
  return Math.round(characters.length * 45);
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
