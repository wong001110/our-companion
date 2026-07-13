import { useCallback, useRef, useState } from 'react';
import { getSpeechDuration } from './runtime/companionBehavior';
import { splitIntoChunks } from './typewriterSpeech';

export function useSpeech() {
  const [speech, setSpeech] = useState<string>();
  const [typewriterMessage, setTypewriterMessage] = useState<string>();
  const speechTimeoutRef = useRef<number | undefined>(undefined);
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const generationRef = useRef(0);
  const [typewriterGeneration, setTypewriterGeneration] = useState(0);

  const showInstant = useCallback((message: string) => {
    setTypewriterMessage(undefined);
    setSpeech(message);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
    }
    speechTimeoutRef.current = window.setTimeout(() => setSpeech(undefined), getSpeechDuration(message));
  }, []);

  const showTypewriter = useCallback((message: string): boolean => {
    setSpeech(undefined);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = undefined;
    }
    const chunks = splitIntoChunks(message);
    generationRef.current++;
    setTypewriterGeneration(generationRef.current);
    chunksRef.current = chunks;
    chunkIndexRef.current = 0;
    setTypewriterMessage(chunks[0]);
    return chunks.length === 0;
  }, []);

  const clear = useCallback(() => {
    setSpeech(undefined);
    setTypewriterMessage(undefined);
    chunksRef.current = [];
    chunkIndexRef.current = 0;
    generationRef.current++;
    setTypewriterGeneration(generationRef.current);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = undefined;
    }
  }, []);

  // Advances to the next chunk if one remains. Returns true only once the
  // whole message has finished so callers can end the turn on the last chunk.
  const onTypewriterComplete = useCallback((generation: number): boolean => {
    if (generation !== generationRef.current || !chunksRef.current.length) return false;
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
    typewriterGeneration,
    showInstant,
    showTypewriter,
    clear,
    onTypewriterComplete,
    hasSpeech: !!(speech || typewriterMessage),
  };
}
