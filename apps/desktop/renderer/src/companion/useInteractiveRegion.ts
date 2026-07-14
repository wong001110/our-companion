import { useCallback, useEffect, useRef, useState } from 'react';
import { pointIsInteractive, type InteractiveRegionLayout } from './interactiveRegionLayout';

// The window must stay interactive long enough to cross transparent space to a bubble.
const GRACE_PERIOD_MS = 460;

export function useInteractiveRegion() {
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const regionsRef = useRef<Set<string>>(new Set());
  const passthroughRef = useRef<boolean | undefined>(undefined);
  const graceTimerRef = useRef<number | undefined>(undefined);
  const layoutRef = useRef<InteractiveRegionLayout | undefined>(undefined);
  const pointerInLayoutRef = useRef(false);

  const syncPassthrough = useCallback((regions: Set<string>, pointerInLayout = pointerInLayoutRef.current) => {
    const shouldBeInteractive = regions.size > 0 || pointerInLayout;
    if (passthroughRef.current === shouldBeInteractive) return;
    passthroughRef.current = shouldBeInteractive;
    void window.ourCompanion.window.setMousePassthrough({ passthrough: !shouldBeInteractive }).catch(() => {
      passthroughRef.current = undefined;
    });
  }, []);

  const enter = useCallback((id: string) => {
    if (graceTimerRef.current !== undefined) {
      window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = undefined;
    }
    regionsRef.current.add(id);
    setActiveRegions(new Set(regionsRef.current));
    syncPassthrough(regionsRef.current);
  }, [syncPassthrough]);

  const leave = useCallback((id: string) => {
    regionsRef.current.delete(id);
    if (regionsRef.current.size === 0) {
      graceTimerRef.current = window.setTimeout(() => {
        if (regionsRef.current.size === 0) {
          setActiveRegions(new Set());
          syncPassthrough(regionsRef.current);
        }
        graceTimerRef.current = undefined;
      }, GRACE_PERIOD_MS);
    } else {
      setActiveRegions(new Set(regionsRef.current));
      syncPassthrough(regionsRef.current);
    }
  }, [syncPassthrough]);

  const clearAll = useCallback(() => {
    if (graceTimerRef.current !== undefined) {
      window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = undefined;
    }
    regionsRef.current.clear();
    setActiveRegions(new Set());
    syncPassthrough(regionsRef.current);
  }, [syncPassthrough]);

  const setLayout = useCallback((layout?: InteractiveRegionLayout) => {
    layoutRef.current = layout;
    if (!layout) {
      pointerInLayoutRef.current = false;
      syncPassthrough(regionsRef.current, false);
    }
  }, [syncPassthrough]);

  useEffect(() => {
    const trackForwardedPointer = (event: MouseEvent) => {
      const layout = layoutRef.current;
      if (!layout) return;
      const next = pointIsInteractive({ x: event.clientX, y: event.clientY }, layout);
      if (next === pointerInLayoutRef.current) return;
      pointerInLayoutRef.current = next;
      syncPassthrough(regionsRef.current, next);
    };
    // Electron forwards mouse movement while click-through is enabled. This keeps
    // only the companion, bubbles, menu, and their safe paths interactive.
    window.addEventListener('mousemove', trackForwardedPointer, true);
    return () => window.removeEventListener('mousemove', trackForwardedPointer, true);
  }, [syncPassthrough]);

  useEffect(() => {
    return () => {
      if (graceTimerRef.current !== undefined) {
        window.clearTimeout(graceTimerRef.current);
      }
    };
  }, []);

  return {
    activeRegions,
    enter,
    leave,
    clearAll,
    setLayout,
    isInteractive: activeRegions.size > 0,
  };
}
