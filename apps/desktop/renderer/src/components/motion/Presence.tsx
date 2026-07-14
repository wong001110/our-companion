import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MotionState = 'entering' | 'entered' | 'exiting';

/** Keeps children mounted long enough for a CSS exit transition to finish. */
export function Presence({ present, exitDurationMs = 160, children, onExited }: { present: boolean; exitDurationMs?: number; children: (state: MotionState) => ReactNode; onExited?: () => void }) {
  const [mounted, setMounted] = useState(present);
  const [state, setState] = useState<MotionState>(present ? 'entered' : 'exiting');
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    if (present) {
      setMounted(true);
      setState('entering');
      const frame = requestAnimationFrame(() => setState('entered'));
      return () => cancelAnimationFrame(frame);
    }
    if (!mounted) return;
    setState('exiting');
    const timeout = window.setTimeout(() => {
      setMounted(false);
      onExitedRef.current?.();
    }, exitDurationMs);
    return () => window.clearTimeout(timeout);
  }, [exitDurationMs, mounted, present]);

  return mounted ? <>{children(state)}</> : null;
}
