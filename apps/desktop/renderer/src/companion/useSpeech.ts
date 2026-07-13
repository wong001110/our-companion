import { useCallback, useRef, useState } from 'react';
import { getSpeechDuration } from './runtime/companionBehavior';
import { splitIntoChunks } from './typewriterSpeech';

export function useSpeech() {
  const [speech, setSpeech] = useState<string>();
  const [typewriterMessage, setTypewriterMessage] = useState<string>();
  const speechTimeoutRef = useRef<number | undefined>(undefined);
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);

  const showInstant = useCallback((message: string) => {
    setTypewriterMessage(undefined);
    setSpeech(message);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
    }
    speechTimeoutRef.current = window.setTimeout(() => setSpeech(undefined), getSpeechDuration(message));
  }, []);

  const showTypewriter = useCallback((message: string) => {
    setSpeech(undefined);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = undefined;
    }
    const chunks = splitIntoChunks(message);
    chunksRef.current = chunks;
    chunkIndexRef.current = 0;
    setTypewriterMessage(chunks[0]);
  }, []);

  const clear = useCallback(() => {
    setSpeech(undefined);
    setTypewriterMessage(undefined);
    chunksRef.current = [];
    chunkIndexRef.current = 0;
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = undefined;
    }
  }, []);

  // Advances to the next chunk if one remains. Returns true only once the
  // whole message has finished so callers can end the turn on the last chunk.
  const onTypewriterComplete = useCallback((): boolean => {
    const nextIndex = chunkIndexRef.current + 1;
    if (nextIndex < chunksRef.current.length) {
      chunkIndexRef.current = nextIndex;
      setTypewriterMessage(chunksRef.current[nextIndex]);
      return false;
    }
    chunksRef.current = [];
    chunkIndexRef.current = 0;
    setTypewriterMessage(undefined);
    return true;
  }, []);

  return {
    speech,
    typewriterMessage,
    showInstant,
    showTypewriter,
    clear,
    onTypewriterComplete,
    hasSpeech: !!(speech || typewriterMessage),
  };
}
