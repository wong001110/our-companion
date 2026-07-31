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
    .map((runtimeId) => visualVisits.visitors[runtimeId])
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

  const updatePosition = useCallback((runtimeId: string, position: VisitorPosition) => {
    setPositions((current) => {
      const previous = current[runtimeId];
      if (previous?.x === position.x && previous.y === position.y) return current;
      return { ...current, [runtimeId]: position };
    });
  }, []);
  const completeDeparture = useCallback((runtimeId: string) => {
    setPositions((current) => {
      const next = { ...current };
      delete next[runtimeId];
      return next;
    });
    controller.unregister(runtimeId, 'departure-complete');
    void window.ourCompanion.network.visits.visual.completeRendererDeparture(runtimeId).catch(() => undefined);
  }, [controller]);

  return <>
    {[...visitors, ...departingVisitors].map((visitor) => {
      const departing = Boolean(visualVisits.departingVisitors[visitor.runtimeId]);
      // Keep the same React identity across active → departing so Leave starts
      // exactly where the visitor last stood instead of remounting at its slot.
      return <RemoteVisitor key={visitor.runtimeId} visitor={visitor} controller={controller} continuityPosition={positions[visitor.runtimeId]} departing={departing} onPositionChange={updatePosition} onDepartureComplete={completeDeparture} />;
    })}
  </>;
}

function RemoteVisitor({ visitor: initialVisitor, controller, continuityPosition, departing, onPositionChange, onDepartureComplete }: { visitor: VisualVisitRenderModel; controller: SceneOccupancyController; continuityPosition?: VisitorPosition; departing: boolean; onPositionChange: (runtimeId: string, position: VisitorPosition) => void; onDepartureComplete: (runtimeId: string) => void }) {
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
        && current.presentation?.turnId === initialVisitor.presentation?.turnId
        && sameAssets(current.assetUrls, initialVisitor.assetUrls)
        && sameTiming(current.frameTiming, initialVisitor.frameTiming)) return current;
      return {
        ...current,
        assetUrls: initialVisitor.assetUrls,
        frameTiming: initialVisitor.frameTiming,
        sceneSlotIndex: initialVisitor.sceneSlotIndex,
        name: initialVisitor.name,
        presentation: initialVisitor.presentation,
      };
    });
  }, [initialVisitor, departing, controller, actorId, continuityPosition]);

  const handleComplete = useCallback(() => {
    if (phase === 'entering') setPhase('idle');
    if (phase === 'leaving') {
      setRuntime(undefined);
      if (!departureReported.current) {
        departureReported.current = true;
        onDepartureComplete(initialVisitor.runtimeId);
      }
    }
  }, [phase, initialVisitor.runtimeId, onDepartureComplete]);

  const handleFailure = useCallback((failed: VisualVisitRenderModel) => {
    if (runtime?.runtimeId !== failed.runtimeId) return;
    failedRuntimeId.current = failed.runtimeId;
    targetRef.current = undefined;
    setActualSpeed(0);
    setRuntime(undefined);
    if (departing) onDepartureComplete(failed.runtimeId);
    else void window.ourCompanion.network.visits.visual.reportRendererFailure(failed.runtimeId).catch(() => undefined);
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
    if (runtime) onPositionChange(runtime.runtimeId, position);
  }, [runtime, position, onPositionChange]);

  useEffect(() => {
    if (!runtime || runtime.runtimeId !== initialVisitor.runtimeId || runtime.presentation) return;
    if (phase !== 'idle') return;
    const delay = 2000 + Math.round((movementIndex.current % 5) * 1000);
    const timer = window.setTimeout(() => {
      const target = controller.planTarget(actorId, nextWalkTarget(runtime.runtimeId, movementIndex.current++, position, bounds));
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
  const animationName = runtime ? (runtime.presentation ? runtime.presentation.animationName : phase === 'entering' ? 'Enter' : phase === 'leaving' ? 'Leave' : phase === 'walking' ? walk!.animationName : 'Idle_Neutral') : undefined;

  useEffect(() => {
    if (!runtime?.presentation) return;
    targetRef.current = undefined;
    setActualSpeed(0);
    setPhase('idle');
    const turnId = runtime.presentation.turnId;
    const timer = window.setTimeout(() => {
      void window.ourCompanion.network.visits.visual.acknowledgePresentation(turnId).catch(() => undefined);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [runtime?.presentation?.turnId]);

  useEffect(() => {
    if (!runtime || !animationName || !window.ourCompanion.smoke) return;
    void window.ourCompanion.smoke.reportVisualRuntime({ runtimeId: runtime.runtimeId, sessionId: runtime.sessionId, animationName, x: position.x, y: position.y }).catch(() => undefined);
  }, [runtime, animationName, position]);

  if (!runtime || !animationName) return null;
  return <div data-testid="remote-visual-visitor" data-runtime-id={runtime.runtimeId} data-session-id={runtime.sessionId} data-animation={animationName} data-slot={runtime.sceneSlotIndex} style={{ position: 'absolute', left: position.x, top: position.y, zIndex: sceneDepth(position, runtime.runtimeId), pointerEvents: 'none' }} aria-label={`${runtime.name} is visiting`}>
    {runtime.presentation && <div className="remote-visitor-speech-bubble" data-testid="remote-visitor-speech-bubble"><strong>{runtime.name}</strong><span>{runtime.presentation.message}</span></div>}
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
