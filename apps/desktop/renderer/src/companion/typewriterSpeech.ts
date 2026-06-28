import { getSpeechDuration } from '../character/ann/companionBehavior';

export const MIN_MS_PER_CHARACTER = 24;
export const HOLD_AFTER_COMPLETE_MS = 1500;

export function splitCharacters(message: string): string[] {
  return Array.from(message);
}

export function getMsPerCharacter(_message: string, minMsPerCharacter = MIN_MS_PER_CHARACTER): number {
  return minMsPerCharacter;
}
