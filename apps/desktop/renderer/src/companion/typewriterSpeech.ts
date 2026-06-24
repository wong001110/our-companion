import { getSpeechDuration } from '../character/ann/companionBehavior';

export const MIN_MS_PER_WORD = 35;
export const HOLD_AFTER_COMPLETE_MS = 800;

export function splitWords(message: string): string[] {
  return message.trim().split(/\s+/).filter(Boolean);
}

export function getMsPerWord(message: string, minMsPerWord = MIN_MS_PER_WORD): number {
  const words = splitWords(message);
  if (words.length === 0) return minMsPerWord;
  return Math.max(minMsPerWord, getSpeechDuration(message) / words.length);
}
