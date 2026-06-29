import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { CharacterRuntimeState } from '@our-companion/shared';
import { createCompanionAnimations, type AnimationName, type CompanionAnimationConfig } from '../character/ann/animationConfig';
import { SpriteAnimator } from '../character/SpriteAnimator';
import { DEFAULT_ASSET_ROOT } from '../character/AssetResolver';
import { resolveAnimation, getAvailableClipNames } from '../character/AnimationResolver';
import type { CompanionAnimationName } from '../companion/runtime/animationRegistry';

export type { AnimationName };

export interface CompanionDragPoint {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
}

interface CompanionCanvasProps {
  state?: CharacterRuntimeState;
  compact?: boolean;
  animationOverride?: AnimationName;
  assetRoot?: string;
  facing?: 'left' | 'right';
  isListening?: boolean;
  onPointerHitChange?: (isHit: boolean) => void;
  onOpenPanel?: () => void;
  onToggleListen?: () => void;
  onDragStart?: (point: CompanionDragPoint) => void;
  onDragMove?: (point: CompanionDragPoint) => void;
  onDragEnd?: (point: CompanionDragPoint) => void;
}

const canvasSize = {
  normal: { width: 220, height: 230 },
  compact: { width: 260, height: 260 }
};

export function CompanionCanvas({
  state,
  compact = false,
  animationOverride,
  assetRoot = DEFAULT_ASSET_ROOT,
  facing = 'right',
  isListening = false,
  onPointerHitChange,
  onOpenPanel,
  onToggleListen,
  onDragStart,
  onDragMove,
  onDragEnd
}: CompanionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isPointerHitRef = useRef(false);
  const dragCandidateRef = useRef<{ pointerId: number; startX: number; startY: number } | undefined>(undefined);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const suppressClickTimeoutRef = useRef<number | undefined>(undefined);
  const singleClickTimeoutRef = useRef<number | undefined>(undefined);
  const [assetFailed, setAssetFailed] = useState(false);
  const intent = state?.intent ?? 'waiting';
  const animations = useMemo(() => createCompanionAnimations(assetRoot), [assetRoot]);
  const availableClips = useMemo(() => getAvailableClipNames(animations), [animations]);
  const animation = useMemo(() => {
    if (animationOverride) return animations[animationOverride];
    const intent = stateToIntent(state);
    const resolution = resolveAnimation({ intent }, availableClips);
    return animations[resolution.clip as AnimationName] ?? animations.Idle_Neutral;
  }, [animationOverride, state?.coreState, state?.intent, animations, availableClips]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setAssetFailed(false);

    const viewport = compact ? canvasSize.compact : canvasSize.normal;
    const animator = new SpriteAnimator(animation, {
      cacheKey: animation.name,
      onError: () => setAssetFailed(true)
    });

    let active = true;

    animator
      .load()
      .then(() => {
        if (!active) return;
        animator.start(canvas, viewport);
      })
      .catch(() => {
        if (active) setAssetFailed(true);
      });

    return () => {
      active = false;
      animator.destroy();
    };
  }, [animation, compact]);

  useEffect(() => {
    return () => {
      if (suppressClickTimeoutRef.current !== undefined) {
        window.clearTimeout(suppressClickTimeoutRef.current);
      }
      if (singleClickTimeoutRef.current !== undefined) {
        window.clearTimeout(singleClickTimeoutRef.current);
      }
    };
  }, []);

  function updatePointerHit(isHit: boolean) {
    if (isPointerHitRef.current === isHit) return;
    isPointerHitRef.current = isHit;
    onPointerHitChange?.(isHit);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const isHit = pointerHitTest(event);
    updatePointerHit(isHit);
    if (!isHit) return;

    dragCandidateRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragCandidate = dragCandidateRef.current;
    if (dragCandidate?.pointerId === event.pointerId) {
      const distance = Math.hypot(event.clientX - dragCandidate.startX, event.clientY - dragCandidate.startY);
      if (!isDraggingRef.current && distance >= 5) {
        isDraggingRef.current = true;
        suppressClickRef.current = true;
        onDragStart?.(eventPoint(event));
      }
      if (isDraggingRef.current) {
        onDragMove?.(eventPoint(event));
        event.preventDefault();
        return;
      }
    }

    updatePointerHit(pointerHitTest(event));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const dragCandidate = dragCandidateRef.current;
    if (dragCandidate?.pointerId !== event.pointerId) return;

    if (isDraggingRef.current) {
      onDragEnd?.(eventPoint(event));
      isDraggingRef.current = false;
      if (suppressClickTimeoutRef.current !== undefined) {
        window.clearTimeout(suppressClickTimeoutRef.current);
      }
      suppressClickTimeoutRef.current = window.setTimeout(() => {
        suppressClickRef.current = false;
        suppressClickTimeoutRef.current = undefined;
      }, 250);
    }

    dragCandidateRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    updatePointerHit(pointerHitTest(event));
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (isDraggingRef.current) onDragEnd?.(eventPoint(event));
    isDraggingRef.current = false;
    dragCandidateRef.current = undefined;
    updatePointerHit(false);
  }

  function handlePointerLeave() {
    if (dragCandidateRef.current) return;
    updatePointerHit(false);
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
  }

  function handleDoubleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
  }

  function pointerHitTest(event: PointerEvent<HTMLDivElement>): boolean {
    return assetFailed ? fallbackHitTest(event) : canvasAlphaHitTest(event);
  }

  function eventPoint(event: PointerEvent<HTMLDivElement>): CompanionDragPoint {
    return {
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY
    };
  }

  function canvasAlphaHitTest(event: PointerEvent<HTMLDivElement>): boolean {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const rect = canvas.getBoundingClientRect();
    if (!isInsideRect(event.clientX, event.clientY, rect)) return false;

    const context = canvas.getContext('2d');
    if (!context) return false;

    const visualX = event.clientX - rect.left;
    const sampleX = facing === 'right' ? rect.width - visualX : visualX;
    const sampleY = event.clientY - rect.top;
    const x = clamp(Math.floor((sampleX / rect.width) * canvas.width), 0, canvas.width - 1);
    const y = clamp(Math.floor((sampleY / rect.height) * canvas.height), 0, canvas.height - 1);

    try {
      return context.getImageData(x, y, 1, 1).data[3] > 24;
    } catch {
      return false;
    }
  }

  function fallbackHitTest(event: PointerEvent<HTMLDivElement>): boolean {
    const fallback = wrapperRef.current?.querySelector('.fallback-ann');
    if (!(fallback instanceof HTMLElement)) return false;

    const rect = fallback.getBoundingClientRect();
    if (!isInsideRect(event.clientX, event.clientY, rect)) return false;

    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const head = Math.pow((x - 0.5) / 0.34, 2) + Math.pow((y - 0.38) / 0.24, 2) <= 1;
    const body = x >= 0.3 && x <= 0.7 && y >= 0.48 && y <= 0.86;
    return head || body;
  }

  return (
    <div
      ref={wrapperRef}
      className="companion-canvas companion-canvas-visible"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      aria-label="Companion"
    >
      {isListening && <div className="companion-listening-indicator" aria-label="Listening" />}
      {!assetFailed && (
        <figure
          className={`canvas-ann canvas-ann-${animation.name} canvas-ann-facing-${facing} ${compact ? 'canvas-ann-compact' : ''}`}
        >
          <canvas ref={canvasRef} />
          <figcaption>{intentLabel(intent)}</figcaption>
        </figure>
      )}
      {assetFailed && <FallbackCompanion intent={intent} compact={compact} facing={facing} />}
    </div>
  );
}

function isInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stateToIntent(state?: CharacterRuntimeState): CompanionAnimationName {
  if (!state) return 'Idle_Neutral';
  if (state.coreState === 'listening') return 'Think';
  if (state.coreState === 'executing') return 'Work_Focus';
  if (state.coreState === 'returning') return 'Expedition_Return';
  if (state.coreState === 'talking') return 'Talk_Neutral';
  if (state.intent === 'sharing_discovery' || state.coreState === 'discovering') return 'Expedition_Present';
  if (
    state.intent === 'reviewing_memory' ||
    state.intent === 'reflecting_journey' ||
    state.intent === 'organizing_backpack' ||
    state.coreState === 'thinking' ||
    state.coreState === 'observing'
  ) return 'Think';
  if (state.intent === 'wandering' || state.coreState === 'walking') return 'Walk_Right';
  return 'Idle_Neutral';
}

function FallbackCompanion({ intent, compact, facing }: { intent: string; compact: boolean; facing: 'left' | 'right' }) {
  return (
    <div className={`fallback-ann fallback-ann-facing-${facing} ${compact ? 'fallback-ann-compact' : ''}`}>
      <div className="fallback-ann-shadow" />
      <div className="fallback-ann-tail" />
      <div className="fallback-ann-ear fallback-ann-ear-left" />
      <div className="fallback-ann-ear fallback-ann-ear-right" />
      <div className="fallback-ann-hair" />
      <div className="fallback-ann-head">
        <span className="fallback-ann-eye fallback-ann-eye-left" />
        <span className="fallback-ann-eye fallback-ann-eye-right" />
        <span className="fallback-ann-mouth" />
      </div>
      <div className="fallback-ann-body">
        <span className="fallback-ann-laptop" />
      </div>
      <div className="fallback-ann-label">{intentLabel(intent)}</div>
    </div>
  );
}

function intentLabel(intent: string): string {
  const labels: Record<string, string> = {
    waiting: 'quietly here',
    wandering: 'wandering',
    sharing_discovery: 'found something',
    helping_task: 'on task',
    asking_permission: 'listening',
    reviewing_memory: 'notebook',
    reflecting_journey: 'reflecting',
    organizing_backpack: 'packing notes'
  };
  return labels[intent] ?? intent;
}
