import { useMemo } from 'react';
import {
  anchorFromBounds,
  computeFloatingPosition,
  type AnchorRect,
  type Rect,
} from './floatingPlacement';

const COMPANION_WINDOW = { width: 440, height: 390 };
const CANVAS_SIZE = { width: 220, height: 230 };
const BUBBLE_SIZE = { width: 360, height: 120 };
const CARD_SIZE = { width: 320, height: 260 };

export type FloatingPositions = {
  anchor: AnchorRect;
  bubble: { rect: Rect; placement: string; clamped: boolean } | null;
  card: { rect: Rect; placement: string; clamped: boolean } | null;
};

export function useFloatingPlacement(opts: {
  hasBubble: boolean;
  hasCard: boolean;
  annPosition?: { x: number; y: number } | null;
  screenWorkArea?: Rect;
}): FloatingPositions {
  const { hasBubble, hasCard, annPosition, screenWorkArea } = opts;

  return useMemo(() => {
    const workArea = screenWorkArea ?? { x: 0, y: 0, width: COMPANION_WINDOW.width, height: COMPANION_WINDOW.height };

    const anchor = annPosition
      ? anchorFromBounds({
          x: annPosition.x,
          y: annPosition.y,
          width: CANVAS_SIZE.width,
          height: CANVAS_SIZE.height,
        })
      : anchorFromBounds({
          x: (workArea.width - CANVAS_SIZE.width) / 2,
          y: workArea.height - CANVAS_SIZE.height,
          width: CANVAS_SIZE.width,
          height: CANVAS_SIZE.height,
        });

    const bubble = hasBubble
      ? computeFloatingPosition({
          anchorRect: anchor,
          floatingSize: BUBBLE_SIZE,
          screenWorkArea: workArea,
          preferredPlacements: ['top', 'right', 'left', 'bottom'],
        })
      : null;

    const bubbleRect = bubble?.rect;

    const card = hasCard
      ? computeFloatingPosition({
          anchorRect: anchor,
          floatingSize: CARD_SIZE,
          screenWorkArea: workArea,
          preferredPlacements: ['right', 'left', 'top', 'bottom'],
          obstacles: bubbleRect ? [bubbleRect] : [],
        })
      : null;

    return { anchor, bubble, card };
  }, [hasBubble, hasCard, annPosition?.x, annPosition?.y, screenWorkArea?.width, screenWorkArea?.height]);
}
