import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualVisitRenderModel, VisualVisitRendererState } from '@our-companion/shared';
import { SpriteAnimator } from '../character/SpriteAnimator';
import { SceneOccupancyController } from '../motion/SceneOccupancyController';
import { computeWalkPlaybackRate } from '../motion/sceneMotion';
import { REMOTE_VISITOR_SIZE, clampVisitorPosition, initialVisitorPosition, nextWalkTarget, sceneDepth, walkSelection, type VisitorOccupant, type VisitorPosition } from './remoteVisitorController';

export function useVisualVisitState(): VisualVisitRendererState {
  const [state, setState] = useState<VisualVisitRendererState>({ ownerPresenceMode: 'home', capacity: 2, visitors: {}, departingVisitors: {}, visitorOrder: [], errors: {} });
  useEffect(() => {
    let active = true;
    void window.ourCompanion.network.visits.visual.getState().then((next) => { if (active) setState(next); }).catch(() => undefined);
    const unsubscribe = window.ourCompanion.network.visits.visual.onChanged((next) => setState(next));
    return () => { active = false; unsubscribe(); };
  }, []);
  return state;
}

export function RemoteVisitorLayer({ localCompanion, controller: sharedController }: { localCompanion?: VisitorOccupant; controller?: SceneOccupancyController } = {}) {
  const visualVisits = useVisualVisitState();
  const [positions, setPositions] = useState<Record<string, VisitorPosition>>({});
  const ownedController = useRef<SceneOccupancyController | null>(null);
  if (!ownedController.current) ownedController.current = new SceneOccupancyController(viewport());
  const controller = sharedController ?? ownedController.current;
  const visitors = visualVisits.visitorOrder
    .map((sessionId) => visualVisits.visitors[sessionId])
    .filter((visitor): visitor is VisualVisitRenderModel => Boolean(visitor));
  const departingVisitors = Object.values(visualVisits.departingVisitors);

  useEffect(() => {
    if (sharedController || !localCompanion) {
      controller.unregister('local-compatibility-occupant', 'local-hidden');
      return;
    }
    controller.register({ id: 'local-compatibility-occupant', type: 'local_companion', position: localCompanion, phase: 'stationary' });
    return () => controller.unregister('local-compatibility-occupant', 'local-hidden');
  }, [controller, localCompanion?.x, localCompanion?.y, sharedController]);

  const updatePosition = useCallback((sessionId: string, position: VisitorPosition) => {
    setPositions((current) => {
      const previous = current[sessionId];
      if (previous?.x === position.x && previous.y === position.y) return current;
      return { ...current, [sessionId]: position };
    });
  }, []);
  const completeDeparture = useCallback((sessionId: string) => {
    setPositions((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    controller.unregister(`visit:${sessionId}`, 'departure-complete');
    void window.ourCompanion.network.visits.visual.completeRendererDeparture(sessionId).catch(() => undefined);
  }, [controller]);

  return <>
    {[...visitors, ...departingVisitors].map((visitor) => {
      const departing = Boolean(visualVisits.departingVisitors[visitor.sessionId]);
      // Keep the same React identity across active → departing so Leave starts
      // exactly where the visitor last stood instead of remounting at its slot.
      return <RemoteVisitor key={visitor.sessionId} visitor={visitor} controller={controller} continuityPosition={positions[visitor.sessionId]} departing={departing} onPositionChange={updatePosition} onDepartureComplete={completeDeparture} />;
    })}
  </>;
}

function RemoteVisitor({ visitor: initialVisitor, controller, continuityPosition, departing, onPositionChange, onDepartureComplete }: { visitor: VisualVisitRenderModel; controller: SceneOccupancyController; continuityPosition?: VisitorPosition; departing: boolean; onPositionChange: (sessionId: string, position: VisitorPosition) => void; onDepartureComplete: (sessionId: string) => void }) {
  const [runtime, setRuntime] = useState<VisualVisitRenderModel | undefined>(initialVisitor);
  const [phase, setPhase] = useState<'entering' | 'idle' | 'walking' | 'leaving'>(departing ? 'leaving' : 'entering');
  const [bounds, setBounds] = useState(() => viewport());
  const actorId = initialVisitor.runtimeId;
  const [position, setPosition] = useState<VisitorPosition>(() => continuityPosition ?? initialVisitorPosition(viewport(), initialVisitor.sceneSlotIndex));
  const [actualSpeed, setActualSpeed] = useState(0);
  const movementIndex = useRef(0);
  const targetRef = useRef<VisitorPosition | undefined>(undefined);
  const failedRuntimeId = useRef<string | undefined>(undefined);
  const departureReported = useRef(false);

  useEffect(() => {
    controller.register({ id: actorId, type: 'remote_visitor', position, phase: departing ? 'transition' : 'stationary' });
    if (continuityPosition) controller.recordContinuityEvent(`restored-position:${actorId}`);
    return () => controller.unregister(actorId, departing ? 'departure-unmounted' : 'runtime-suspended');
  }, [actorId, controller]);

  useEffect(() => {
    controller.update(actorId, { position, phase: phase === 'walking' ? 'wandering' : phase === 'idle' ? 'stationary' : 'transition' });
  }, [actorId, controller, phase, position]);

  useEffect(() => {
    if (departing) {
      targetRef.current = undefined;
      setActualSpeed(0);
      setPhase('leaving');
      return;
    }
    if (failedRuntimeId.current === initialVisitor.runtimeId) return;
    setRuntime((current) => {
      if (!current || current.sessionId !== initialVisitor.sessionId) {
        failedRuntimeId.current = undefined;
        setPhase('entering');
        const retained = controller.getPosition(actorId) ?? continuityPosition;
        if (retained) setPosition(retained);
        movementIndex.current = 0;
        targetRef.current = undefined;
        return initialVisitor;
      }
      if (current.name === initialVisitor.name
        && current.sceneSlotIndex === initialVisitor.sceneSlotIndex
        && sameAssets(current.assetUrls, initialVisitor.assetUrls)
        && sameTiming(current.frameTiming, initialVisitor.frameTiming)) return current;
      return {
        ...current,
        assetUrls: initialVisitor.assetUrls,
        frameTiming: initialVisitor.frameTiming,
        sceneSlotIndex: initialVisitor.sceneSlotIndex,
        name: initialVisitor.name,
      };
    });
  }, [initialVisitor, departing, controller, actorId, continuityPosition]);

  const handleComplete = useCallback(() => {
    if (phase === 'entering') setPhase('idle');
    if (phase === 'leaving') {
      setRuntime(undefined);
      if (!departureReported.current) {
        departureReported.current = true;
        onDepartureComplete(initialVisitor.sessionId);
      }
    }
  }, [phase, initialVisitor.sessionId, onDepartureComplete]);

  const handleFailure = useCallback((failed: VisualVisitRenderModel) => {
    if (runtime?.runtimeId !== failed.runtimeId) return;
    failedRuntimeId.current = failed.runtimeId;
    targetRef.current = undefined;
    setActualSpeed(0);
    setRuntime(undefined);
    if (departing) onDepartureComplete(failed.sessionId);
    else void window.ourCompanion.network.visits.visual.reportRendererFailure(failed.sessionId).catch(() => undefined);
  }, [runtime, departing, onDepartureComplete]);

  useEffect(() => {
    const applyBounds = (next: ReturnType<typeof viewport>) => {
      setBounds(next);
      controller.setBounds(next);
      setPosition((current) => {
        const clamped = clampVisitorPosition(current, next);
        controller.updatePosition(actorId, clamped, 'display_recovery');
        return clamped;
      });
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
  }, [actorId, controller]);

  useEffect(() => {
    if (runtime) onPositionChange(runtime.sessionId, position);
  }, [runtime, position, onPositionChange]);

  useEffect(() => {
    if (!runtime || runtime.sessionId !== initialVisitor.sessionId) return;
    if (phase !== 'idle') return;
    const delay = 2000 + Math.round((movementIndex.current % 5) * 1000);
    const timer = window.setTimeout(() => {
      const target = controller.planTarget(actorId, nextWalkTarget(runtime.sessionId, movementIndex.current++, position, bounds));
      if (target && (target.x !== position.x || target.y !== position.y)) {
        targetRef.current = target;
        setPhase('walking');
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [runtime, phase, position, bounds, actorId, controller]);

  useEffect(() => {
    if (phase !== 'walking') return;
    let frame = 0;
    let previous = performance.now();
    const step = (now: number) => {
      const target = targetRef.current;
      if (!target) { setPhase('idle'); return; }
      const elapsed = Math.min(100, now - previous); previous = now;
      const result = controller.step(actorId, target, elapsed);
      setActualSpeed(result.speed);
      setPosition(result.position);
      if (result.reachedTarget || result.cancelPath) {
        targetRef.current = undefined;
        window.cancelAnimationFrame(frame);
        window.setTimeout(() => setPhase('idle'), 0);
        return;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [phase, actorId, controller]);

  const target = targetRef.current ?? position;
  const walk = runtime ? walkSelection(position, target, runtime.assetUrls) : undefined;
  const animationName = runtime ? (phase === 'entering' ? 'Enter' : phase === 'leaving' ? 'Leave' : phase === 'walking' ? walk!.animationName : 'Idle_Neutral') : undefined;

  useEffect(() => {
    if (!runtime || !animationName || !window.ourCompanion.smoke) return;
    void window.ourCompanion.smoke.reportVisualRuntime({ sessionId: runtime.sessionId, animationName, x: position.x, y: position.y }).catch(() => undefined);
  }, [runtime, animationName, position]);

  if (!runtime || !animationName) return null;
  return <div data-testid="remote-visual-visitor" data-runtime-id={runtime.runtimeId} data-session-id={runtime.sessionId} data-animation={animationName} data-slot={runtime.sceneSlotIndex} style={{ position: 'absolute', left: position.x, top: position.y, zIndex: sceneDepth(position, runtime.sessionId), pointerEvents: 'none' }} aria-label={`${runtime.name} is visiting`}>
    <RemoteVisitorSprite model={runtime} animationName={animationName} playbackRate={computeWalkPlaybackRate(actualSpeed)} onComplete={handleComplete} onFailure={handleFailure} />
  </div>;
}

function RemoteVisitorSprite({ model, animationName, playbackRate, onComplete, onFailure }: { model: VisualVisitRenderModel; animationName: string; playbackRate: number; onComplete: () => void; onFailure: (model: VisualVisitRenderModel) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const animatorRef = useRef<SpriteAnimator | undefined>(undefined);
  useEffect(() => {
    const url = model.assetUrls[animationName] ?? model.assetUrls.Idle_Neutral;
    const timing = model.frameTiming[animationName] ?? model.frameTiming.Idle_Neutral;
    const canvas = ref.current;
    if (!url || !timing || !canvas) return;
    const animator = new SpriteAnimator({ sheet: url, frameWidth: REMOTE_VISITOR_SIZE.width, frameHeight: REMOTE_VISITOR_SIZE.height, frameMs: timing.frameDurationMs, loop: timing.loop }, { cacheKey: `${model.runtimeId}:${animationName}`, onComplete });
    animator.setPlaybackRate(animationName.startsWith('Walk_') ? playbackRate : 1);
    animatorRef.current = animator;
    let active = true;
    void animator.load().then(() => { if (active) animator.start(canvas, REMOTE_VISITOR_SIZE); }).catch(() => { if (active) onFailure(model); });
    return () => { active = false; animator.destroy(); if (animatorRef.current === animator) animatorRef.current = undefined; };
  }, [model, animationName, onComplete, onFailure]);
  useEffect(() => {
    animatorRef.current?.setPlaybackRate(animationName.startsWith('Walk_') ? playbackRate : 1);
  }, [animationName, playbackRate]);
  return <canvas ref={ref} aria-hidden="true" />;
}

function viewport() { return { width: window.innerWidth, height: window.innerHeight }; }

function sameAssets(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

function sameTiming(
  left: VisualVisitRenderModel['frameTiming'],
  right: VisualVisitRenderModel['frameTiming'],
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => left[key]?.frameDurationMs === right[key]?.frameDurationMs && left[key]?.loop === right[key]?.loop);
}
