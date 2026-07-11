import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanionCommand } from '@our-companion/shared';
import type {
  CompanionBehaviorState,
  CompanionMode,
  CompanionMood,
  CompanionEnergy,
  CompanionFocus,
  InitiativeLevel,
  DiscoveryPresentationState,
} from './CompanionBehaviorTypes';
import { createDefaultBehaviorState } from './CompanionBehaviorTypes';
import { applyDismissSuppression, applyIgnoreSuppression } from './InterruptionPolicy';
import { createCommandExecutor, type ActiveCommandExecution, type CommandExecutionHandle } from './commandLifecycle';

const STORAGE_KEY_PREFIX = 'companion:behavior:';

function loadPersistedState(companionId: string): Partial<CompanionBehaviorState> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${companionId}`);
    return raw ? JSON.parse(raw) as Partial<CompanionBehaviorState> : {};
  } catch {
    return {};
  }
}

function persistState(companionId: string, state: CompanionBehaviorState): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${companionId}`, JSON.stringify(state));
  } catch { /* local display state is optional */ }
}

export interface UseCompanionBehaviorOptions {
  companionId: string;
  onCommand: (command: CompanionCommand) => CommandExecutionHandle;
}

/** Executes authoritative main-process commands; it makes no behavior decisions. */
export function useCompanionBehavior({ companionId, onCommand }: UseCompanionBehaviorOptions) {
  const [state, setState] = useState<CompanionBehaviorState>(() => ({
    ...createDefaultBehaviorState(),
    ...loadPersistedState(companionId),
  }));
  const [activeCommand, setActiveCommand] = useState<CompanionCommand | null>(null);
  // These stores deliberately outlive renders and IPC re-subscriptions.
  const handledCommandIdsRef = useRef<Set<string>>(new Set());
  const activeExecutionRef = useRef<ActiveCommandExecution | null>(null);

  useEffect(() => {
    persistState(companionId, state);
  }, [companionId, state]);

  const acknowledge = useCallback((command: CompanionCommand, status: 'received' | 'started' | 'completed' | 'cancelled' | 'failed', reason?: string, failedStep?: string) => {
    void window.ourCompanion.companion.reportCommandAck?.({
      commandId: command.id,
      companionId: command.companionId,
      status,
      reportedAt: new Date().toISOString(),
      reason,
      failedStep,
    });
  }, []);

  const execute = useCallback(createCommandExecutor({
    companionId,
    acknowledge,
    handledCommandIds: handledCommandIdsRef.current,
    activeExecution: activeExecutionRef,
    execute: (command) => {
      setActiveCommand(command);
      let handle: CommandExecutionHandle;
      try {
        handle = onCommand(command);
      } catch (error) {
        setActiveCommand((current) => current?.id === command.id ? null : current);
        throw error;
      }
      void handle.completed.then(() => {
        setActiveCommand((current) => current?.id === command.id ? null : current);
      }, () => {
        setActiveCommand((current) => current?.id === command.id ? null : current);
      });
      return handle;
    },
  }), [acknowledge, companionId, onCommand]);

  useEffect(() => {
    const unsubscribe = window.ourCompanion.companion.onCommand?.((command) => { void execute(command); });
    void window.ourCompanion.companion.getActiveCommand?.().then((command) => {
      if (command) void execute(command);
    });
    return () => unsubscribe?.();
  }, [execute]);

  useEffect(() => () => {
    activeExecutionRef.current?.cancel('renderer_unmounted');
  }, [companionId]);

  const cancelActiveCommand = useCallback((reason: string) => {
    activeExecutionRef.current?.cancel(reason);
  }, []);

  const recordInteraction = useCallback(() => setState((prev) => ({ ...prev, lastUserInteractionAt: Date.now() })), []);
  const recordSpeech = useCallback(() => setState((prev) => ({ ...prev, lastCompanionSpokeAt: Date.now() })), []);
  const recordDiscoveryPresented = useCallback(() => setState((prev) => ({ ...prev, lastDiscoveryPresentedAt: Date.now(), discoveryPresentationState: 'presented' })), []);
  const recordDismiss = useCallback(() => setState((prev) => applyDismissSuppression(prev, Date.now())), []);
  const recordIgnore = useCallback(() => setState((prev) => applyIgnoreSuppression(prev, Date.now(), 1)), []);
  const setDiscoveryPresentationState = useCallback((discoveryPresentationState: DiscoveryPresentationState) => setState((prev) => ({ ...prev, discoveryPresentationState })), []);
  const setMode = useCallback((mode: CompanionMode) => setState((prev) => ({ ...prev, mode })), []);
  const setMood = useCallback((mood: CompanionMood) => setState((prev) => ({ ...prev, mood })), []);
  const setEnergy = useCallback((energy: CompanionEnergy) => setState((prev) => ({ ...prev, energy })), []);
  const setFocus = useCallback((focus: CompanionFocus) => setState((prev) => ({ ...prev, focus })), []);
  const setInitiativeLevel = useCallback((initiativeLevel: InitiativeLevel) => setState((prev) => ({ ...prev, initiativeLevel })), []);
  const setDebugOverride = useCallback((debugOverride: boolean) => setState((prev) => ({ ...prev, debugOverride })), []);

  return { state, activeCommand, cancelActiveCommand, recordInteraction, recordSpeech, recordDiscoveryPresented, recordDismiss, recordIgnore, setDiscoveryPresentationState, setMode, setMood, setEnergy, setFocus, setInitiativeLevel, setDebugOverride };
}
