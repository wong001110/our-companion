import { getSpeechDuration } from '../character/ann/companionBehavior';
export const MIN_MS_PER_CHARACTER = 24;
export const HOLD_AFTER_COMPLETE_MS = 800;
export function splitCharacters(message) {
    return Array.from(message);
}
export function getMsPerCharacter(message, minMsPerCharacter = MIN_MS_PER_CHARACTER) {
    const characters = splitCharacters(message);
    if (characters.length === 0)
        return minMsPerCharacter;
    return Math.max(minMsPerCharacter, getSpeechDuration(message) / characters.length);
}
