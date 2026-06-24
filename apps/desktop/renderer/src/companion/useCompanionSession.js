import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioCapture } from './useAudioCapture';
function previewState(base, coreState, intent) {
    if (!base)
        return undefined;
    return {
        ...base,
        coreState,
        intent,
        updatedAt: new Date().toISOString()
    };
}
export function useCompanionSession({ stateRef, applyState, onInstantSpeech, onTypewriterSpeech, onSessionPhaseChange, pauseAmbient }) {
    const [phase, setPhase] = useState('idle');
    const phaseRef = useRef('idle');
    const busyRef = useRef(false);
    const setSessionPhase = useCallback((next) => {
        phaseRef.current = next;
        setPhase(next);
        onSessionPhaseChange?.(next);
        pauseAmbient?.(next !== 'idle');
    }, [onSessionPhaseChange, pauseAmbient]);
    const applyPreview = useCallback((coreState, intent) => {
        const next = previewState(stateRef.current, coreState, intent);
        if (next)
            applyState(next);
    }, [applyState, stateRef]);
    const finishToIdle = useCallback(() => {
        applyPreview('idle', 'waiting');
        setSessionPhase('idle');
        busyRef.current = false;
    }, [applyPreview, setSessionPhase]);
    const runTurn = useCallback(async (message, source) => {
        const trimmed = message.trim();
        if (!trimmed) {
            onInstantSpeech("I didn't catch that. Try again?");
            finishToIdle();
            return;
        }
        setSessionPhase('thinking');
        applyPreview('thinking', 'helping_task');
        try {
            const reply = await window.ourCompanion.companion.turn({ message: trimmed, source });
            setSessionPhase('talking');
            applyPreview('talking', 'helping_task');
            onTypewriterSpeech(reply.message);
        }
        catch (error) {
            const text = error instanceof Error ? error.message : 'Something went wrong while I was thinking.';
            onInstantSpeech(text);
            finishToIdle();
        }
    }, [applyPreview, finishToIdle, onInstantSpeech, onTypewriterSpeech, setSessionPhase]);
    const processRecording = useCallback(async (blob, mimeType) => {
        setSessionPhase('thinking');
        applyPreview('thinking', 'helping_task');
        try {
            const buffer = await blob.arrayBuffer();
            const { text } = await window.ourCompanion.speech.transcribe({ audio: buffer, mimeType });
            await runTurn(text, 'voice');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'I could not transcribe that audio.';
            onInstantSpeech(message);
            finishToIdle();
        }
    }, [applyPreview, finishToIdle, onInstantSpeech, runTurn, setSessionPhase]);
    const stopListeningRef = useRef(async () => undefined);
    const audio = useAudioCapture({
        onSilenceStop: () => {
            if (phaseRef.current === 'listening') {
                void stopListeningRef.current();
            }
        },
        onError: (message) => {
            onInstantSpeech(message);
            finishToIdle();
        }
    });
    const startListening = useCallback(async () => {
        if (busyRef.current || phaseRef.current !== 'idle')
            return;
        busyRef.current = true;
        setSessionPhase('listening');
        applyPreview('listening', 'asking_permission');
        const started = await audio.startRecording();
        if (!started) {
            busyRef.current = false;
            setSessionPhase('idle');
            applyPreview('idle', 'waiting');
        }
    }, [applyPreview, audio, setSessionPhase]);
    const stopListening = useCallback(async () => {
        if (phaseRef.current !== 'listening')
            return;
        const result = await audio.stopRecording();
        if (!result || result.blob.size === 0) {
            onInstantSpeech("I didn't hear anything.");
            finishToIdle();
            return;
        }
        await processRecording(result.blob, result.mimeType);
    }, [audio, finishToIdle, onInstantSpeech, processRecording]);
    stopListeningRef.current = stopListening;
    const toggleListening = useCallback(() => {
        if (phaseRef.current === 'listening') {
            void stopListening();
            return;
        }
        if (phaseRef.current === 'idle') {
            void startListening();
        }
    }, [startListening, stopListening]);
    const onTypewriterComplete = useCallback(() => {
        finishToIdle();
    }, [finishToIdle]);
    useEffect(() => {
        const unsubscribe = window.ourCompanion.companion.onToggleListen(toggleListening);
        return unsubscribe;
    }, [toggleListening]);
    return {
        phase,
        toggleListening,
        onTypewriterComplete,
        isSessionActive: phase !== 'idle'
    };
}
