import { useEffect, useMemo, useState } from 'react';
import {
  anchorFromBounds,
  computeFloatingPosition,
  type Rect,
} from './floatingPlacement';

export type CompanionQuickActionsProps = {
  visible: boolean;
  anchorRect: Rect;
  screenWorkArea: Rect;
  obstacles?: Rect[];
  onTextChat: () => void;
  onVoiceChat: () => void;
  onOpenPanel: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

const ACTION_SIZE = { width: 180, height: 40 };
const FADE_DURATION_MS = 180;

export function CompanionQuickActions({
  visible,
  anchorRect,
  screenWorkArea,
  obstacles = [],
  onTextChat,
  onVoiceChat,
  onOpenPanel,
  onMouseEnter,
  onMouseLeave,
}: CompanionQuickActionsProps) {
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
      const timer = window.setTimeout(() => setMounted(false), FADE_DURATION_MS);
      return () => window.clearTimeout(timer);
    }
  }, [visible]);

  const position = useMemo(() => {
    if (!mounted) return null;
    const anchor = anchorFromBounds(anchorRect);
    return computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: ACTION_SIZE,
      screenWorkArea,
      preferredPlacements: ['top', 'right', 'left', 'bottom'],
      gap: 8,
      obstacles,
    });
  }, [mounted, anchorRect, screenWorkArea, obstacles]);

  if (!mounted || !position) return null;

  return (
    <div
      className="companion-quick-actions"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute',
        left: position.rect.x,
        top: position.rect.y,
        display: 'flex',
        gap: '6px',
        zIndex: 20,
        pointerEvents: 'all',
        opacity: fadingIn ? 1 : 0,
        transform: fadingIn ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.96)',
        transition: `opacity ${FADE_DURATION_MS}ms ease, transform ${FADE_DURATION_MS}ms ease`,
      }}
    >
      <button className="companion-quick-btn" onClick={onTextChat} style={{ pointerEvents: 'all' }}>
        💬 Chat
      </button>
      <button className="companion-quick-btn" onClick={onVoiceChat} title="Voice coming soon" style={{ pointerEvents: 'all' }}>
        🎙 Talk
      </button>
      <button className="companion-quick-btn" onClick={onOpenPanel} style={{ pointerEvents: 'all' }}>
        📖 Panel
      </button>
    </div>
  );
}
