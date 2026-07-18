import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualVisitRenderModel, VisualVisitRendererState } from '@our-companion/shared';
import { SpriteAnimator } from '../character/SpriteAnimator';
import { REMOTE_VISITOR_SIZE, REMOTE_VISITOR_SPEED_PX_PER_SECOND, clampVisitorPosition, initialVisitorPosition, nextWalkTarget, walkSelection, type VisitorPosition } from './remoteVisitorController';

export function useVisualVisitState(): VisualVisitRendererState {
  const [state, setState] = useState<VisualVisitRendererState>({ ownerPresenceMode: 'home', capacity: 2, visitors: {}, visitorOrder: [], errors: {} });
  useEffect(() => {
    let active = true;
    void window.ourCompanion.network.visits.visual.getState().then((next) => { if (active) setState(next); }).catch(() => undefined);
    const unsubscribe = window.ourCompanion.network.visits.visual.onChanged((next) => setState(next));
    return () => { active = false; unsubscribe(); };
  }, []);
  return state;
}

export function RemoteVisitorLayer() {
  const visualVisits = useVisualVisitState();
  const visitors = visualVisits.visitorOrder
    .map((sessionId) => visualVisits.visitors[sessionId])
    .filter((visitor): visitor is VisualVisitRenderModel => Boolean(visitor));

  return <>
    {visitors.map((visitor) => <RemoteVisitor key={visitor.sessionId} visitor={visitor} />)}
  </>;
}

function RemoteVisitor({ visitor: initialVisitor }: { visitor: VisualVisitRenderModel }) {
  const [runtime, setRuntime] = useState<VisualVisitRenderModel>(initialVisitor);
  const [phase, setPhase] = useState<'entering' | 'idle' | 'walking' | 'leaving'>('entering');
  const [bounds, setBounds] = useState(() => viewport());
  const [position, setPosition] = useState<VisitorPosition>(() => initialVisitorPosition(viewport()));
  const movementIndex = useRef(0);
  const targetRef = useRef<VisitorPosition | undefined>(undefined);
  const failedRuntimeId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (failedRuntimeId.current === initialVisitor.runtimeId) return;
    if (!runtime || runtime.sessionId !== initialVisitor.sessionId) {
      setRuntime(initialVisitor);
      failedRuntimeId.current = undefined;
      setPhase('entering');
      setPosition(initialVisitorPosition(bounds));
      movementIndex.current = 0;
      targetRef.current = undefined;
      return;
    }

    if (runtime.sessionId !== initialVisitor.sessionId) return;
    setRuntime((current) => {
      if (!current) return initialVisitor;
      return {
        ...current,
        assetUrls: initialVisitor.assetUrls,
        frameTiming: initialVisitor.frameTiming,
        sceneSlotIndex: initialVisitor.sceneSlotIndex,
        name: initialVisitor.name,
      };
    });
  }, [initialVisitor, runtime, bounds]);

  const handleComplete = useCallback(() => {
    if (phase === 'entering') setPhase('idle');
    if (phase === 'leaving') setRuntime(undefined as never);
  }, [phase]);

  const handleFailure = useCallback((failed: VisualVisitRenderModel) => {
    if (runtime?.runtimeId !== failed.runtimeId) return;
    failedRuntimeId.current = failed.runtimeId;
    targetRef.current = undefined;
    setRuntime(undefined as never);
    void window.ourCompanion.network.visits.visual.reportRendererFailure(failed.sessionId).catch(() => undefined);
  }, [runtime]);

  useEffect(() => {
    const applyBounds = (next: ReturnType<typeof viewport>) => {
      setBounds(next);
      setPosition((current) => clampVisitorPosition(current, next));
    };
    const clamp = () => applyBounds(viewport());
    window.addEventListener('resize', clamp);
    const unsubscribeDisplay = window.ourCompanion.companion.onDisplayChanged(() => clamp());
    const unsubscribeSmoke = window.ourCompanion.smoke?.onVisualWorkAreaChanged((workArea) => applyBounds(workArea ?? viewport()));
    return () => {
      window.removeEventListener('resize', clamp);
      unsubscribeDisplay();
      unsubscribeSmoke?.();
    };
  }, []);

  useEffect(() => {
    if (runtime.sessionId !== initialVisitor.sessionId) return;
    if (phase !== 'idle') return;
    const delay = 2000 + Math.round((movementIndex.current % 5) * 1000);
    const timer = window.setTimeout(() => {
      const target = nextWalkTarget(runtime.sessionId, movementIndex.current++, position, bounds);
      if (target.x !== position.x || target.y !== position.y) {
        targetRef.current = target;
        setPhase('walking');
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [runtime, phase, position, bounds]);

  useEffect(() => {
    if (phase !== 'walking') return;
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
        return clampVisitorPosition({ x: current.x + dx / remaining * travel, y: current.y + dy / remaining * travel }, bounds);
      });
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [phase, bounds]);

  const target = targetRef.current ?? position;
  const walk = runtime ? walkSelection(position, target, runtime.assetUrls) : undefined;
  const animationName = runtime ? (phase === 'entering' ? 'Enter' : phase === 'leaving' ? 'Leave' : phase === 'walking' ? walk!.animationName : 'Idle_Neutral') : undefined;

  useEffect(() => {
    if (!runtime || !animationName || !window.ourCompanion.smoke) return;
    void window.ourCompanion.smoke.reportVisualRuntime({ sessionId: runtime.sessionId, animationName, x: position.x, y: position.y }).catch(() => undefined);
  }, [runtime, animationName, position]);

  if (!runtime || !animationName) return null;
  return <div data-testid="remote-visual-visitor" data-runtime-id={runtime.runtimeId} data-session-id={runtime.sessionId} data-animation={animationName} data-slot={runtime.sceneSlotIndex} style={{ position: 'absolute', left: position.x, top: position.y, zIndex: 2 + runtime.sceneSlotIndex, pointerEvents: 'none' }} aria-label={`${runtime.name} is visiting`}>
    <RemoteVisitorSprite model={runtime} animationName={animationName} onComplete={handleComplete} onFailure={handleFailure} />
  </div>;
}

function RemoteVisitorSprite({ model, animationName, onComplete, onFailure }: { model: VisualVisitRenderModel; animationName: string; onComplete: () => void; onFailure: (model: VisualVisitRenderModel) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const url = model.assetUrls[animationName] ?? model.assetUrls.Idle_Neutral;
    const timing = model.frameTiming[animationName] ?? model.frameTiming.Idle_Neutral;
    const canvas = ref.current;
    if (!url || !timing || !canvas) return;
    const animator = new SpriteAnimator({ sheet: url, frameWidth: REMOTE_VISITOR_SIZE.width, frameHeight: REMOTE_VISITOR_SIZE.height, frameMs: timing.frameDurationMs, loop: timing.loop }, { cacheKey: `${model.runtimeId}:${animationName}`, onComplete });
    let active = true;
    void animator.load().then(() => { if (active) animator.start(canvas, REMOTE_VISITOR_SIZE); }).catch(() => { if (active) onFailure(model); });
    return () => { active = false; animator.destroy(); };
  }, [model, animationName, onComplete, onFailure]);
  return <canvas ref={ref} aria-hidden="true" />;
}

function viewport() { return { width: window.innerWidth, height: window.innerHeight }; }
