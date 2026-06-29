import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterRuntimeState, CompanionSessionPhase } from '@our-companion/shared';
import { useAudioCapture } from './useAudioCapture';

export interface CompanionSessionSpeech {
  message: string;
  mode: 'instant' | 'typewriter';
}

interface UseCompanionSessionOptions {
  characterId: string;
  stateRef: React.MutableRefObject<CharacterRuntimeState | undefined>;
  applyState: (next: CharacterRuntimeState) => void;
  onInstantSpeech: (message: string) => void;
  onTypewriterSpeech: (message: string) => void;
  onSessionPhaseChange?: (phase: CompanionSessionPhase) => void;
  pauseAmbient?: (paused: boolean) => void;
}

function previewState(
  base: CharacterRuntimeState | undefined,
  coreState: CharacterRuntimeState['coreState'],
  intent: CharacterRuntimeState['intent']
): CharacterRuntimeState | undefined {
  if (!base) return undefined;
  return {
    ...base,
    coreState,
    intent,
    updatedAt: new Date().toISOString()
  };
}

export function useCompanionSession({
  characterId,
  stateRef,
  applyState,
  onInstantSpeech,
  onTypewriterSpeech,
  onSessionPhaseChange,
  pauseAmbient
}: UseCompanionSessionOptions) {
  const [phase, setPhase] = useState<CompanionSessionPhase>('idle');
  const phaseRef = useRef<CompanionSessionPhase>('idle');
  const busyRef = useRef(false);

  const setSessionPhase = useCallback(
    (next: CompanionSessionPhase) => {
      phaseRef.current = next;
      setPhase(next);
      onSessionPhaseChange?.(next);
      pauseAmbient?.(next !== 'idle');
      void window.ourCompanion.companion.reportSessionPhase(next);
    },
    [onSessionPhaseChange, pauseAmbient]
  );

  const applyPreview = useCallback(
    (coreState: CharacterRuntimeState['coreState'], intent: CharacterRuntimeState['intent']) => {
      const next = previewState(stateRef.current, coreState, intent);
      if (next) applyState(next);
    },
    [applyState, stateRef]
  );

  const finishToIdle = useCallback(() => {
    applyPreview('idle', 'waiting');
    setSessionPhase('idle');
    busyRef.current = false;
  }, [applyPreview, setSessionPhase]);

  const logVoiceEvent = useCallback(
    (content: string, status: 'error' | 'empty_transcript', metadata?: Record<string, unknown>) => {
      void window.ourCompanion.companion.appendMessage({
        role: 'system',
        content,
        source: 'voice',
        characterId,
        status,
        metadata
      });
    },
    []
  );

  const runTurn = useCallback(
    async (message: string, source: 'voice' | 'companion_text') => {
      const trimmed = message.trim();
      if (!trimmed) {
        logVoiceEvent("Empty transcript after Whisper — said 'I didn't catch that'.", 'empty_transcript');
        onInstantSpeech("I didn't catch that. Try again?");
        finishToIdle();
        return;
      }

      setSessionPhase('thinking');
      applyPreview('thinking', 'helping_task');

      try {
        const reply = await window.ourCompanion.companion.turn({ characterId, message: trimmed, source });
        setSessionPhase('talking');
        applyPreview('talking', 'helping_task');
        onTypewriterSpeech(reply.message);
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Something went wrong while I was thinking.';
        onInstantSpeech(text);
        finishToIdle();
      }
    },
    [applyPreview, finishToIdle, logVoiceEvent, onInstantSpeech, onTypewriterSpeech, setSessionPhase]
  );

  const processRecording = useCallback(
    async (blob: Blob, mimeType: string) => {
      setSessionPhase('thinking');
      applyPreview('thinking', 'helping_task');

      try {
        const buffer = await blob.arrayBuffer();
        const { text } = await window.ourCompanion.speech.transcribe({ audio: buffer, mimeType });
        await runTurn(text, 'voice');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'I could not transcribe that audio.';
        logVoiceEvent(message, 'error', { step: 'transcribe', audioBytes: blob.size, mimeType });
        onInstantSpeech(message);
        finishToIdle();
      }
    },
    [applyPreview, finishToIdle, logVoiceEvent, onInstantSpeech, runTurn, setSessionPhase]
  );

  const stopListeningRef = useRef<() => Promise<void>>(async () => undefined);

  const audio = useAudioCapture({
    onSilenceStop: () => {
      if (phaseRef.current === 'listening') {
        void stopListeningRef.current();
      }
    },
    onError: (message) => {
      logVoiceEvent(message, 'error', { step: 'audio_capture' });
      onInstantSpeech(message);
      finishToIdle();
    }
  });

  const startListening = useCallback(async () => {
    if (busyRef.current || phaseRef.current !== 'idle') return;
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
    if (phaseRef.current !== 'listening') return;
    const result = await audio.stopRecording();
    if (!result || result.blob.size === 0) {
      logVoiceEvent("Empty recording — no audio captured.", 'empty_transcript');
      onInstantSpeech("I didn't hear anything.");
      finishToIdle();
      return;
    }
    if (result.durationMs < 500) {
      logVoiceEvent('Recording was too short to transcribe.', 'empty_transcript', {
        audioBytes: result.blob.size,
        durationMs: Math.round(result.durationMs),
        mimeType: result.mimeType
      });
      onInstantSpeech('That recording was too short. Try holding for a moment longer?');
      finishToIdle();
      return;
    }
    await processRecording(result.blob, result.mimeType);
  }, [audio, finishToIdle, logVoiceEvent, onInstantSpeech, processRecording]);

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
    runTurn,
    onTypewriterComplete,
    isSessionActive: phase !== 'idle'
  };
}
