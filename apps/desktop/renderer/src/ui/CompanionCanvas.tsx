import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { CharacterRuntimeState } from '@our-companion/shared';
import { createCompanionAnimations, type AnimationName, type CompanionAnimationConfig } from '../character/animationConfig';
import { SpriteAnimator } from '../character/SpriteAnimator';
import type { CompanionAnimationName } from '../companion/runtime/animationRegistry';
import { resolveAnimationFallback, resolveCompanionAnimation } from '../character/animationSelection';

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
  movementAnimation?: AnimationName;
  idleAnimation?: AnimationName;
  companionId?: string;
  assetRoot: string;
  facing?: 'left' | 'right';
  isListening?: boolean;
  userIsTyping?: boolean;
  onPointerHitChange?: (isHit: boolean) => void;
  onOpenPanel?: () => void;
  onToggleListen?: () => void;
  onDragStart?: (point: CompanionDragPoint) => void;
  onDragMove?: (point: CompanionDragPoint) => void;
  onDragEnd?: (point: CompanionDragPoint) => void;
  onAnimationComplete?: (name: AnimationName) => void;
}

const canvasSize = {
  normal: { width: 220, height: 230 },
  compact: { width: 260, height: 260 }
};

export function CompanionCanvas({
  state,
  compact = false,
  animationOverride,
  movementAnimation,
  idleAnimation,
  companionId,
  assetRoot,
  facing = 'right',
  isListening = false,
  userIsTyping = false,
  onPointerHitChange,
  onOpenPanel,
  onToggleListen,
  onDragStart,
  onDragMove,
  onDragEnd,
  onAnimationComplete
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
  const [availableClips, setAvailableClips] = useState<Set<CompanionAnimationName>>(() => new Set(['Idle_Neutral']));
  const [failedClips, setFailedClips] = useState<Set<CompanionAnimationName>>(() => new Set());
  const [dragState, setDragState] = useState<'idle' | 'dragging' | 'releasing'>('idle');
  const dragReleaseTimerRef = useRef<number | undefined>(undefined);
  const intent = state?.intent ?? 'waiting';
  const animations = useMemo(() => createCompanionAnimations(assetRoot), [assetRoot]);
  useEffect(() => {
    let active = true;
    setFailedClips(new Set());
    if (!companionId) return () => { active = false; };
    void window.ourCompanion.companionNew.listAssets(companionId).then((assets) => {
      if (!active) return;
      const available = assets
        .filter((asset) => asset.subfolder === 'animations' && asset.name.endsWith('.png'))
        .map((asset) => asset.name.slice(0, -4))
        .filter((name): name is CompanionAnimationName => name in animations);
      setAvailableClips(new Set<CompanionAnimationName>(available));
    }).catch(() => { if (active) setAvailableClips(new Set(['Idle_Neutral'])); });
    return () => { active = false; };
  }, [companionId, animations]);

  const resolved = useMemo(() => {
    const requested = resolveCompanionAnimation({ state, dragState, performanceAnimation: animationOverride, movementAnimation, idleAnimation, userIsTyping });
    const usable = new Set([...availableClips].filter((name) => !failedClips.has(name)));
    const name = resolveAnimationFallback(requested.name, usable);
    return { ...requested, name };
  }, [animationOverride, dragState, movementAnimation, state, userIsTyping, idleAnimation, availableClips, failedClips]);
  const animation = animations[resolved.name as AnimationName] ?? animations.Idle_Neutral;
  const usesDirectionalAsset = animation.name.startsWith('Walk_');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setAssetFailed(false);

    const viewport = compact ? canvasSize.compact : canvasSize.normal;
    const animator = new SpriteAnimator(animation, {
      cacheKey: `${assetRoot}:${animation.name}`,
      onError: () => {
        console.warn('[our-companion] Companion animation asset failed; trying fallback.', {
          requestedAnimation: resolved.name,
          failedAssetUrl: animation.sheet,
        });
        setFailedClips((failed) => new Set(failed).add(animation.name));
      },
      onComplete: () => {
        if (resolved.name === 'Drag_Release') setDragState('idle');
        onAnimationComplete?.(resolved.name);
      },
    });

    let active = true;

    animator
      .load()
      .then(() => {
        if (!active) return;
        animator.start(canvas, viewport);
      })
      .catch(() => {
        if (active && animation.name === 'Idle_Neutral') setAssetFailed(true);
      });

    return () => {
      active = false;
      animator.destroy();
    };
  }, [animation, compact, assetRoot, resolved.name, onAnimationComplete]);

  useEffect(() => {
    return () => {
      if (suppressClickTimeoutRef.current !== undefined) {
        window.clearTimeout(suppressClickTimeoutRef.current);
      }
      if (singleClickTimeoutRef.current !== undefined) {
        window.clearTimeout(singleClickTimeoutRef.current);
      }
      if (dragReleaseTimerRef.current !== undefined) {
        window.clearTimeout(dragReleaseTimerRef.current);
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
        setDragState('dragging');
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
      setDragState('releasing');
      if (dragReleaseTimerRef.current !== undefined) {
        window.clearTimeout(dragReleaseTimerRef.current);
      }
      dragReleaseTimerRef.current = window.setTimeout(() => {
        setDragState('idle');
        dragReleaseTimerRef.current = undefined;
      }, 2500);
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
    setDragState('idle');
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
    return assetFailed ? false : canvasAlphaHitTest(event);
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

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;

    const visualX = event.clientX - rect.left;
    const sampleX = !usesDirectionalAsset && facing === 'right' ? rect.width - visualX : visualX;
    const sampleY = event.clientY - rect.top;
    const x = clamp(Math.floor((sampleX / rect.width) * canvas.width), 0, canvas.width - 1);
    const y = clamp(Math.floor((sampleY / rect.height) * canvas.height), 0, canvas.height - 1);

    try {
      return context.getImageData(x, y, 1, 1).data[3] > 24;
    } catch {
      return false;
    }
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
          className={`canvas-companion canvas-companion-${animation.name} ${usesDirectionalAsset ? 'canvas-companion-directional' : `canvas-companion-facing-${facing}`} ${compact ? 'canvas-companion-compact' : ''}`}
        >
          <canvas ref={canvasRef} />
          <figcaption>{intentLabel(intent)}</figcaption>
        </figure>
      )}
    </div>
  );
}

function isInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
