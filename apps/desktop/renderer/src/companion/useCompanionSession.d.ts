import type { CharacterRuntimeState, CompanionSessionPhase } from '@our-companion/shared';
export interface CompanionSessionSpeech {
    message: string;
    mode: 'instant' | 'typewriter';
}
interface UseCompanionSessionOptions {
    stateRef: React.MutableRefObject<CharacterRuntimeState | undefined>;
    applyState: (next: CharacterRuntimeState) => void;
    onInstantSpeech: (message: string) => void;
    onTypewriterSpeech: (message: string) => void;
    onSessionPhaseChange?: (phase: CompanionSessionPhase) => void;
    pauseAmbient?: (paused: boolean) => void;
}
export declare function useCompanionSession({ stateRef, applyState, onInstantSpeech, onTypewriterSpeech, onSessionPhaseChange, pauseAmbient }: UseCompanionSessionOptions): {
    phase: CompanionSessionPhase;
    toggleListening: () => void;
    onTypewriterComplete: () => void;
    isSessionActive: boolean;
};
export {};
