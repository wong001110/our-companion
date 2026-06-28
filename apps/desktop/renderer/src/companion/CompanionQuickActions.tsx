import { useMemo } from 'react';
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
  const position = useMemo(() => {
    if (!visible) return null;
    const anchor = anchorFromBounds(anchorRect);
    return computeFloatingPosition({
      anchorRect: anchor,
      floatingSize: ACTION_SIZE,
      screenWorkArea,
      preferredPlacements: ['top', 'right', 'left', 'bottom'],
      gap: 8,
      obstacles,
    });
  }, [visible, anchorRect, screenWorkArea, obstacles]);

  if (!visible || !position) return null;

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
        opacity: 1,
        transition: 'opacity 0.2s ease',
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
