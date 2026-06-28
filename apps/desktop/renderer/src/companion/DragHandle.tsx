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

  const cornerSize = 12;
  const gripSize = 10;
  const cx = width / 2;
  const cy = height / 2;

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
        <path d={`M ${cornerSize} 2 L 2 2 L 2 ${cornerSize}`} stroke="rgba(186, 166, 224, 0.45)" strokeWidth="2" strokeLinecap="round" />
        {/* Top-right corner */}
        <path d={`M ${width - cornerSize} 2 L ${width - 2} 2 L ${width - 2} ${cornerSize}`} stroke="rgba(186, 166, 224, 0.45)" strokeWidth="2" strokeLinecap="round" />
        {/* Bottom-left corner */}
        <path d={`M 2 ${height - cornerSize} L 2 ${height - 2} L ${cornerSize} ${height - 2}`} stroke="rgba(186, 166, 224, 0.45)" strokeWidth="2" strokeLinecap="round" />
        {/* Bottom-right corner */}
        <path d={`M ${width - 2} ${height - cornerSize} L ${width - 2} ${height - 2} L ${width - cornerSize} ${height - 2}`} stroke="rgba(186, 166, 224, 0.45)" strokeWidth="2" strokeLinecap="round" />
        {/* Center grip dots */}
        <circle cx={cx - 4} cy={cy} r="1.5" fill="rgba(186, 166, 224, 0.5)" />
        <circle cx={cx} cy={cy} r="1.5" fill="rgba(186, 166, 224, 0.5)" />
        <circle cx={cx + 4} cy={cy} r="1.5" fill="rgba(186, 166, 224, 0.5)" />
      </svg>
    </div>
  );
}
