import { useCallback, useEffect, useRef, useState } from 'react';

const GRACE_PERIOD_MS = 120;

export function useInteractiveRegion() {
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const regionsRef = useRef<Set<string>>(new Set());
  const passthroughRef = useRef<boolean | undefined>(undefined);
  const graceTimerRef = useRef<number | undefined>(undefined);

  const syncPassthrough = useCallback((regions: Set<string>) => {
    const shouldBeInteractive = regions.size > 0;
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
    isInteractive: activeRegions.size > 0,
  };
}
