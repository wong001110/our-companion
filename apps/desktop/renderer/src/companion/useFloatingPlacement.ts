import { useMemo } from 'react';
import {
  anchorFromBounds,
  computeFloatingPosition,
  type AnchorRect,
  type Rect,
} from './floatingPlacement';

const CANVAS_SIZE = { width: 220, height: 230 };
const BUBBLE_SIZE = { width: 360, height: 120 };
const CARD_SIZE = { width: 320, height: 260 };
const TEXT_INPUT_SIZE = { width: 210, height: 40 };

export type FloatingPositions = {
  anchor: AnchorRect;
  bubble: { rect: Rect; placement: string; clamped: boolean } | null;
  card: { rect: Rect; placement: string; clamped: boolean } | null;
  textInput: { rect: Rect; placement: string; clamped: boolean } | null;
};

export function useFloatingPlacement(opts: {
  hasBubble: boolean;
  hasCard: boolean;
  hasTextInput: boolean;
  companionPosition?: { x: number; y: number } | null;
  screenWorkArea?: Rect;
}): FloatingPositions {
  const { hasBubble, hasCard, hasTextInput, companionPosition, screenWorkArea } = opts;

  return useMemo(() => {
    const workArea = screenWorkArea ?? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };

    const anchor = companionPosition
      ? anchorFromBounds({
          x: companionPosition.x,
          y: companionPosition.y,
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

    const obstacles: Rect[] = [];
    if (bubbleRect) obstacles.push(bubbleRect);
    if (card?.rect) obstacles.push(card.rect);

    const textInput = hasTextInput
      ? computeFloatingPosition({
          anchorRect: anchor,
          floatingSize: TEXT_INPUT_SIZE,
          screenWorkArea: workArea,
          preferredPlacements: ['bottom', 'top', 'right', 'left'],
          obstacles,
        })
      : null;

    return { anchor, bubble, card, textInput };
  }, [hasBubble, hasCard, hasTextInput, companionPosition?.x, companionPosition?.y, screenWorkArea?.width, screenWorkArea?.height]);
}
