import { useEffect, useRef, useState } from 'react';
import type { VisualVisitRenderModel, VisualVisitRendererState } from '@our-companion/shared';
import { SpriteAnimator } from '../character/SpriteAnimator';
import { REMOTE_VISITOR_SIZE, REMOTE_VISITOR_SPEED_PX_PER_SECOND, clampVisitorPosition, initialVisitorPosition, nextWalkTarget, walkSelection, type VisitorPosition } from './remoteVisitorController';

export function useVisualVisitState(): VisualVisitRendererState {
  const [state, setState] = useState<VisualVisitRendererState>({ ownerPresenceMode: 'home' });
  useEffect(() => {
    let active = true;
    void window.ourCompanion.network.visits.visual.getState().then((next) => { if (active) setState(next); }).catch(() => undefined);
    const unsubscribe = window.ourCompanion.network.visits.visual.onChanged((next) => setState(next));
    return () => { active = false; unsubscribe(); };
  }, []);
  return state;
}

export function RemoteVisitorLayer({ visitor }: { visitor?: VisualVisitRenderModel }) {
  const [runtime, setRuntime] = useState<VisualVisitRenderModel | undefined>(undefined);
  const [phase, setPhase] = useState<'entering' | 'idle' | 'walking' | 'leaving'>('entering');
  const [position, setPosition] = useState<VisitorPosition>(() => initialVisitorPosition(viewport()));
  const movementIndex = useRef(0);
  const targetRef = useRef<VisitorPosition | undefined>();

  useEffect(() => {
    if (visitor) {
      if (runtime?.runtimeId !== visitor.runtimeId) {
        setRuntime(visitor);
        setPhase('entering');
        setPosition(initialVisitorPosition(viewport()));
        movementIndex.current = 0;
        targetRef.current = undefined;
      }
    } else if (runtime) {
      setPhase('leaving');
      targetRef.current = undefined;
    }
  }, [visitor, runtime]);

  useEffect(() => {
    const clamp = () => setPosition((current) => clampVisitorPosition(current, viewport()));
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  useEffect(() => {
    if (!runtime || phase !== 'idle') return;
    const delay = 2000 + Math.round((movementIndex.current % 5) * 1000);
    const timer = window.setTimeout(() => {
      const target = nextWalkTarget(runtime.sessionId, movementIndex.current++, position, viewport());
      if (target.x !== position.x || target.y !== position.y) {
        targetRef.current = target;
        setPhase('walking');
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [runtime, phase, position]);

  useEffect(() => {
    if (!runtime || phase !== 'walking') return;
    let frame = 0;
    let previous = performance.now();
    const step = (now: number) => {
      const target = targetRef.current;
      if (!target) { setPhase('idle'); return; }
      const elapsed = Math.min(100, now - previous); previous = now;
      setPosition((current) => {
        const dx = target.x - current.x; const dy = target.y - current.y;
        const remaining = Math.hypot(dx, dy); const travel = REMOTE_VISITOR_SPEED_PX_PER_SECOND * (elapsed / 1000);
        if (remaining <= travel || remaining === 0) { targetRef.current = undefined; window.cancelAnimationFrame(frame); window.setTimeout(() => setPhase('idle'), 0); return target; }
        return clampVisitorPosition({ x: current.x + dx / remaining * travel, y: current.y + dy / remaining * travel }, viewport());
      });
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [runtime, phase]);

  if (!runtime) return null;
  const target = targetRef.current ?? position;
  const walk = walkSelection(position, target, runtime.assetUrls);
  const animationName = phase === 'entering' ? 'Enter' : phase === 'leaving' ? 'Leave' : phase === 'walking' ? walk.animationName : 'Idle_Neutral';
  return <div style={{ position: 'absolute', left: position.x, top: position.y, zIndex: 2, pointerEvents: 'none' }} aria-label={`${runtime.name} is visiting`}>
    <RemoteVisitorSprite model={runtime} animationName={animationName} onComplete={() => {
      if (phase === 'entering') setPhase('idle');
      if (phase === 'leaving') setRuntime(undefined);
    }} />
  </div>;
}

function RemoteVisitorSprite({ model, animationName, onComplete }: { model: VisualVisitRenderModel; animationName: string; onComplete: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const url = model.assetUrls[animationName] ?? model.assetUrls.Idle_Neutral;
    const timing = model.frameTiming[animationName] ?? model.frameTiming.Idle_Neutral;
    const canvas = ref.current;
    if (!url || !timing || !canvas) return;
    const animator = new SpriteAnimator({ sheet: url, frameWidth: REMOTE_VISITOR_SIZE.width, frameHeight: REMOTE_VISITOR_SIZE.height, frameMs: timing.frameDurationMs, loop: timing.loop }, { cacheKey: `${model.runtimeId}:${animationName}`, onComplete });
    let active = true;
    void animator.load().then(() => { if (active) animator.start(canvas, REMOTE_VISITOR_SIZE); }).catch(() => undefined);
    return () => { active = false; animator.destroy(); };
  }, [model, animationName, onComplete]);
  return <canvas ref={ref} aria-hidden="true" />;
}

function viewport() { return { width: window.innerWidth, height: window.innerHeight }; }
