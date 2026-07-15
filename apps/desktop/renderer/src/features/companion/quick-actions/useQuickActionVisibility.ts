import { useCallback, useEffect, useRef, useState } from 'react';
import { QuickActionVisibilityMachine } from './quickActionVisibilityMachine';

export interface QuickActionVisibility {
  visible: boolean;
  pinned: boolean;
  enterGroup(): void;
  leaveGroup(): void;
  pin(): void;
  togglePinned(): void;
  close(): void;
}

/** Keeps the companion and all of its bubbles in one deliberate hover group. */
export function useQuickActionVisibility({ showDelayMs = 220, hideGraceMs = 420 }: { showDelayMs?: number; hideGraceMs?: number } = {}): QuickActionVisibility {
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const machine = useRef<QuickActionVisibilityMachine | null>(null);
  if (!machine.current) {
    machine.current = new QuickActionVisibilityMachine(
      (next) => { setVisible(next.visible); setPinned(next.pinned); },
      { showDelayMs, hideGraceMs },
      window,
    );
  }

  const enterGroup = useCallback(() => machine.current!.enterGroup(), []);
  const leaveGroup = useCallback(() => machine.current!.leaveGroup(), []);
  const pin = useCallback(() => machine.current!.pin(), []);
  const togglePinned = useCallback(() => machine.current!.togglePinned(), []);
  const close = useCallback(() => machine.current!.close(), []);

  useEffect(() => () => machine.current?.destroy(), []);
  return { visible, pinned, enterGroup, leaveGroup, pin, togglePinned, close };
}
