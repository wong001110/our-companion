import { useEffect, useState, type ReactNode } from 'react';

export type MotionState = 'entering' | 'entered' | 'exiting';

/** Keeps children mounted long enough for a CSS exit transition to finish. */
export function Presence({ present, exitDurationMs = 160, children }: { present: boolean; exitDurationMs?: number; children: (state: MotionState) => ReactNode }) {
  const [mounted, setMounted] = useState(present);
  const [state, setState] = useState<MotionState>(present ? 'entered' : 'exiting');

  useEffect(() => {
    if (present) {
      setMounted(true);
      setState('entering');
      const frame = requestAnimationFrame(() => setState('entered'));
      return () => cancelAnimationFrame(frame);
    }
    if (!mounted) return;
    setState('exiting');
    const timeout = window.setTimeout(() => setMounted(false), exitDurationMs);
    return () => window.clearTimeout(timeout);
  }, [exitDurationMs, mounted, present]);

  return mounted ? <>{children(state)}</> : null;
}
