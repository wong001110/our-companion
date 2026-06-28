import { useEffect, useRef, useState } from 'react';
import { HOLD_AFTER_COMPLETE_MS, getMsPerCharacter, splitCharacters } from './typewriterSpeech';

export interface TypewriterSpeechBubbleProps {
  message: string;
  onComplete?: () => void;
  style?: React.CSSProperties;
}

export function TypewriterSpeechBubble({ message, onComplete, style }: TypewriterSpeechBubbleProps) {
  const [visibleText, setVisibleText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const charactersRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    charactersRef.current = splitCharacters(message);
    indexRef.current = 0;
    setVisibleText('');
    setIsTyping(true);

    if (charactersRef.current.length === 0) {
      setIsTyping(false);
      onComplete?.();
      return;
    }

    const msPerCharacter = getMsPerCharacter(message);

    const tick = () => {
      const nextIndex = indexRef.current + 1;
      indexRef.current = nextIndex;
      setVisibleText(charactersRef.current.slice(0, nextIndex).join(''));

      if (nextIndex >= charactersRef.current.length) {
        setIsTyping(false);
        timeoutRef.current = window.setTimeout(() => {
          onComplete?.();
        }, HOLD_AFTER_COMPLETE_MS);
        return;
      }

      timeoutRef.current = window.setTimeout(tick, msPerCharacter);
    };

    timeoutRef.current = window.setTimeout(tick, msPerCharacter);

    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [message, onComplete]);

  if (!message) return null;

  return (
    <div className="speech-bubble speech-bubble-typing" aria-live="polite" style={style}>
      {visibleText}
      {isTyping && <span className="speech-bubble-cursor" aria-hidden="true">▍</span>}
    </div>
  );
}
