import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterRuntimeState, CompanionSessionPhase } from '@our-companion/shared';
import { useAudioCapture } from './useAudioCapture';
import { t, type Lang } from '../i18n';

export interface CompanionSessionSpeech {
  message: string;
  mode: 'instant' | 'typewriter';
}

interface UseCompanionSessionOptions {
  characterId: string;
  lang: Lang;
  stateRef: React.MutableRefObject<CharacterRuntimeState | undefined>;
  applyState: (next: CharacterRuntimeState) => void;
  onInstantSpeech: (message: string) => void;
  onTypewriterSpeech: (message: string) => boolean;
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
  lang,
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
        const message = t(lang, 'voice_empty_transcript');
        logVoiceEvent(message, 'empty_transcript', { reason: 'empty_transcript' });
        onInstantSpeech(message);
        finishToIdle();
        return;
      }

      setSessionPhase('thinking');
      applyPreview('thinking', 'helping_task');

      try {
        const reply = await window.ourCompanion.companion.turn({ characterId, message: trimmed, source });
        setSessionPhase('talking');
        applyPreview('talking', 'helping_task');
        if (onTypewriterSpeech(reply.message)) finishToIdle();
      } catch (error) {
        const message = t(lang, 'voice_thinking_failed');
        onInstantSpeech(message);
        logVoiceEvent(message, 'error', { step: 'turn', cause: error instanceof Error ? error.message : String(error) });
        finishToIdle();
      }
    },
    [applyPreview, finishToIdle, lang, logVoiceEvent, onInstantSpeech, onTypewriterSpeech, setSessionPhase]
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
        const message = t(lang, 'voice_transcription_failed');
        logVoiceEvent(message, 'error', { step: 'transcribe', audioBytes: blob.size, mimeType, cause: error instanceof Error ? error.message : String(error) });
        onInstantSpeech(message);
        finishToIdle();
      }
    },
    [applyPreview, finishToIdle, lang, logVoiceEvent, onInstantSpeech, runTurn, setSessionPhase]
  );

  const stopListeningRef = useRef<() => Promise<void>>(async () => undefined);

  const audio = useAudioCapture({
    onSilenceStop: () => {
      if (phaseRef.current === 'listening') {
        void stopListeningRef.current();
      }
    },
    onError: (cause) => {
      const message = t(lang, 'voice_listening_failed');
      logVoiceEvent(message, 'error', { step: 'audio_capture', cause });
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
      const message = t(lang, 'voice_no_audio');
      logVoiceEvent(message, 'empty_transcript', { reason: 'empty_recording' });
      onInstantSpeech(message);
      finishToIdle();
      return;
    }
    if (result.durationMs < 500) {
      logVoiceEvent('Recording was too short to transcribe.', 'empty_transcript', {
        audioBytes: result.blob.size,
        durationMs: Math.round(result.durationMs),
        mimeType: result.mimeType
      });
      onInstantSpeech(t(lang, 'voice_recording_too_short'));
      finishToIdle();
      return;
    }
    await processRecording(result.blob, result.mimeType);
  }, [audio, finishToIdle, lang, logVoiceEvent, onInstantSpeech, processRecording]);

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
