import { useCallback, useRef, useState } from 'react';
import { getSpeechDuration } from './runtime/companionBehavior';

export function useSpeech() {
  const [speech, setSpeech] = useState<string>();
  const [typewriterMessage, setTypewriterMessage] = useState<string>();
  const speechTimeoutRef = useRef<number | undefined>(undefined);

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
    setTypewriterMessage(message);
  }, []);

  const clear = useCallback(() => {
    setSpeech(undefined);
    setTypewriterMessage(undefined);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = undefined;
    }
  }, []);

  const onTypewriterComplete = useCallback(() => {
    setTypewriterMessage(undefined);
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
