import { useEffect, useState } from 'react';

export interface DragHandleProps {
  visible: boolean;
  width: number;
  height: number;
  style?: React.CSSProperties;
}

const FADE_MS = 180;

export function DragHandle({ visible, width, height, style }: DragHandleProps) {
  const [mounted, setMounted] = useState(false);
  const [fadingIn, setFadingIn] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFadingIn(true));
      });
    } else {
      setFadingIn(false);
      const timer = window.setTimeout(() => setMounted(false), FADE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  const inset = 0.1;
  const dw = width * (1 - inset * 2);
  const dh = height * (1 - inset * 2);
  const dx = width * inset;
  const dy = height * inset;
  const cornerSize = 10;
  const cx = dx + dw / 2;
  const cy = dy + dh / 2;

  return (
    <div
      className="companion-drag-handle"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        pointerEvents: 'none',
        opacity: fadingIn ? 1 : 0,
        transform: fadingIn ? 'scale(1)' : 'scale(0.96)',
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
        zIndex: 5,
        ...style,
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
        {/* Top-left corner */}
        <path d={`M ${dx + cornerSize} ${dy + 2} L ${dx + 2} ${dy + 2} L ${dx + 2} ${dy + cornerSize}`} stroke="rgba(186, 166, 224, 0.45)" strokeWidth="2" strokeLinecap="round" />
        {/* Top-right corner */}
        <path d={`M ${dx + dw - cornerSize} ${dy + 2} L ${dx + dw - 2} ${dy + 2} L ${dx + dw - 2} ${dy + cornerSize}`} stroke="rgba(186, 166, 224, 0.45)" strokeWidth="2" strokeLinecap="round" />
        {/* Bottom-left corner */}
        <path d={`M ${dx + 2} ${dy + dh - cornerSize} L ${dx + 2} ${dy + dh - 2} L ${dx + cornerSize} ${dy + dh - 2}`} stroke="rgba(186, 166, 224, 0.45)" strokeWidth="2" strokeLinecap="round" />
        {/* Bottom-right corner */}
        <path d={`M ${dx + dw - 2} ${dy + dh - cornerSize} L ${dx + dw - 2} ${dy + dh - 2} L ${dx + dw - cornerSize} ${dy + dh - 2}`} stroke="rgba(186, 166, 224, 0.45)" strokeWidth="2" strokeLinecap="round" />
        {/* Center grip dots */}
        <circle cx={cx - 4} cy={cy} r="1.5" fill="rgba(186, 166, 224, 0.5)" />
        <circle cx={cx} cy={cy} r="1.5" fill="rgba(186, 166, 224, 0.5)" />
        <circle cx={cx + 4} cy={cy} r="1.5" fill="rgba(186, 166, 224, 0.5)" />
      </svg>
    </div>
  );
}
