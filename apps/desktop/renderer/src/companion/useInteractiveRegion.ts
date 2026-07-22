import { useCallback, useEffect, useRef, useState } from 'react';
import { pointIsInteractive, type InteractiveRegionLayout } from './interactiveRegionLayout';

// The window must stay interactive long enough to cross transparent space to a bubble.
const GRACE_PERIOD_MS = 460;

type Timer = ReturnType<typeof setTimeout>;

export interface InteractiveRegionControllerOptions {
  getPointerInLayout: () => boolean;
  onRegionsChange: (regions: Set<string>) => void;
  setMousePassthrough: (passthrough: boolean) => Promise<void> | void;
  setTimer?: (callback: () => void, delay: number) => Timer;
  clearTimer?: (timer: Timer) => void;
}

/**
 * Keeps the mutable interaction state outside React so a region can be removed
 * synchronously when its element disappears before it emits mouseleave.
 */
export function createInteractiveRegionController({
  getPointerInLayout,
  onRegionsChange,
  setMousePassthrough,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: InteractiveRegionControllerOptions) {
  let regions = new Set<string>();
  let passthrough: boolean | undefined;
  let graceTimer: Timer | undefined;
  let graceVersion = 0;
  let passthroughVersion = 0;

  const publish = () => onRegionsChange(new Set(regions));

  const cancelGraceTimer = () => {
    graceVersion += 1;
    if (graceTimer !== undefined) {
      clearTimer(graceTimer);
      graceTimer = undefined;
    }
  };

  const syncPassthrough = () => {
    const shouldBeInteractive = regions.size > 0 || getPointerInLayout();
    if (passthrough === shouldBeInteractive) return;

    passthrough = shouldBeInteractive;
    const requestVersion = ++passthroughVersion;
    void Promise.resolve(setMousePassthrough(!shouldBeInteractive)).catch(() => {
      // An older failed IPC request must not invalidate a newer successful one.
      if (requestVersion === passthroughVersion) passthrough = undefined;
    });
  };

  const scheduleGraceTimer = () => {
    const timerVersion = ++graceVersion;
    graceTimer = setTimer(() => {
      if (timerVersion !== graceVersion) return;
      graceTimer = undefined;
      if (regions.size === 0) syncPassthrough();
    }, GRACE_PERIOD_MS);
  };

  return {
    enter(id: string) {
      cancelGraceTimer();
      if (regions.has(id)) return;
      regions.add(id);
      publish();
      syncPassthrough();
    },
    leave(id: string) {
      if (!regions.delete(id)) return;
      publish();
      if (regions.size === 0) {
        scheduleGraceTimer();
        return;
      }
      cancelGraceTimer();
      syncPassthrough();
    },
    removeImmediately(id: string) {
      cancelGraceTimer();
      if (regions.delete(id)) publish();
      syncPassthrough();
    },
    clearAll() {
      cancelGraceTimer();
      if (regions.size > 0) {
        regions.clear();
        publish();
      }
      syncPassthrough();
    },
    syncPassthrough,
    dispose() {
      cancelGraceTimer();
    },
  };
}

export function useInteractiveRegion() {
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const layoutRef = useRef<InteractiveRegionLayout | undefined>(undefined);
  const pointerInLayoutRef = useRef(false);
  const controllerRef = useRef<ReturnType<typeof createInteractiveRegionController> | undefined>(undefined);
  if (!controllerRef.current) {
    controllerRef.current = createInteractiveRegionController({
      getPointerInLayout: () => pointerInLayoutRef.current,
      onRegionsChange: setActiveRegions,
      setMousePassthrough: (passthrough) =>
        window.ourCompanion.window.setMousePassthrough({ passthrough }).then(() => undefined),
      setTimer: window.setTimeout.bind(window),
      clearTimer: window.clearTimeout.bind(window),
    });
  }
  const controller = controllerRef.current;

  const enter = useCallback((id: string) => controller.enter(id), [controller]);
  const leave = useCallback((id: string) => controller.leave(id), [controller]);
  const removeImmediately = useCallback((id: string) => controller.removeImmediately(id), [controller]);
  const clearAll = useCallback(() => controller.clearAll(), [controller]);

  const setLayout = useCallback((layout?: InteractiveRegionLayout) => {
    layoutRef.current = layout;
    if (!layout) {
      pointerInLayoutRef.current = false;
      controller.syncPassthrough();
    }
  }, [controller]);

  useEffect(() => {
    const trackForwardedPointer = (event: MouseEvent) => {
      const layout = layoutRef.current;
      if (!layout) return;
      const next = pointIsInteractive({ x: event.clientX, y: event.clientY }, layout);
      if (next === pointerInLayoutRef.current) return;
      pointerInLayoutRef.current = next;
      controller.syncPassthrough();
    };
    // Electron forwards mouse movement while click-through is enabled. This keeps
    // only the companion, bubbles, menu, and their safe paths interactive.
    window.addEventListener('mousemove', trackForwardedPointer, true);
    return () => window.removeEventListener('mousemove', trackForwardedPointer, true);
  }, [controller]);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  return {
    activeRegions,
    enter,
    leave,
    removeImmediately,
    clearAll,
    setLayout,
    isInteractive: activeRegions.size > 0,
  };
}
