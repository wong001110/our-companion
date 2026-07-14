import { useEffect, useState } from 'react';
import { Presence, type MotionState } from '../components/motion/Presence';
import { TypewriterSpeechBubble } from './TypewriterSpeechBubble';

type BubbleContent = { mode: 'typewriter'; message: string; generation: number } | { mode: 'instant'; message: string };

export function SpeechBubbleOverlay({ typewriterMessage, typewriterGeneration, speech, onTypewriterComplete, onMouseEnter, onMouseLeave, style }: {
  typewriterMessage?: string;
  typewriterGeneration: number;
  speech?: string;
  onTypewriterComplete: (generation: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
}) {
  const current = typewriterMessage ? { mode: 'typewriter' as const, message: typewriterMessage, generation: typewriterGeneration } : speech ? { mode: 'instant' as const, message: speech } : undefined;
  const [lastContent, setLastContent] = useState<BubbleContent | undefined>(current);
  useEffect(() => { if (current) setLastContent(current); }, [current?.generation, current?.message, current?.mode]);

  return <Presence present={Boolean(current)} exitDurationMs={150}>{(motionState) => lastContent ? <Bubble content={lastContent} motionState={motionState} onTypewriterComplete={onTypewriterComplete} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={style} /> : null}</Presence>;
}

function Bubble({ content, motionState, onTypewriterComplete, onMouseEnter, onMouseLeave, style }: { content: BubbleContent; motionState: MotionState; onTypewriterComplete: (generation: number) => void; onMouseEnter?: () => void; onMouseLeave?: () => void; style?: React.CSSProperties }) {
  if (content.mode === 'typewriter') return <TypewriterSpeechBubble key={content.generation} message={content.message} motionState={motionState} onComplete={() => onTypewriterComplete(content.generation)} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={style} />;
  return <div className="speech-bubble" data-motion-state={motionState} aria-live="polite" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={style}>{content.message}</div>;
}
