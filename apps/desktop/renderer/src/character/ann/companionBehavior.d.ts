export type SpeechEvent = 'ambient' | 'walk_start' | 'walk_end' | 'discovery' | 'task' | 'ask';
export declare function getWalkDelayRange(movementScore: number): {
    minMs: number;
    maxMs: number;
};
export declare function getWalkDelay(movementScore: number, random?: () => number): number;
export declare function selectSpeechLine(event: SpeechEvent, random?: () => number): string;
export declare function getSpeechDuration(message: string): number;
