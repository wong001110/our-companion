import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  decideCompanionBehavior,
  type CompanionBehaviorDecision,
} from './CompanionBehaviorController';
import {
  applyDismissSuppression,
  applyIgnoreSuppression,
} from './InterruptionPolicy';

const STORAGE_KEY_PREFIX = 'companion:behavior:';

function loadPersistedState(companionId: string): Partial<CompanionBehaviorState> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${companionId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: parsed.mode as CompanionMode | undefined,
      mood: parsed.mood as CompanionMood | undefined,
      energy: parsed.energy as CompanionEnergy | undefined,
      initiativeLevel: parsed.initiativeLevel as InitiativeLevel | undefined,
      lastUserDismissedAt: parsed.lastUserDismissedAt as number | null | undefined,
      lastDiscoveryPresentedAt: parsed.lastDiscoveryPresentedAt as number | null | undefined,
    };
  } catch {
    return {};
  }
}

function persistState(companionId: string, state: CompanionBehaviorState): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${companionId}`, JSON.stringify({
      mode: state.mode,
      mood: state.mood,
      energy: state.energy,
      initiativeLevel: state.initiativeLevel,
      lastUserDismissedAt: state.lastUserDismissedAt,
      lastDiscoveryPresentedAt: state.lastDiscoveryPresentedAt,
    }));
  } catch { /* ignore */ }
}

export interface UseCompanionBehaviorOptions {
  companionId: string;
  hasDiscoveryCandidate: boolean;
  userIsTyping: boolean;
  panelOpen: boolean;
  activeConversation: boolean;
  onDecision?: (decision: CompanionBehaviorDecision) => void;
}

export function useCompanionBehavior(opts: UseCompanionBehaviorOptions) {
  const { companionId, hasDiscoveryCandidate, userIsTyping, panelOpen, activeConversation, onDecision } = opts;

  const [state, setState] = useState<CompanionBehaviorState>(() => {
    const persisted = loadPersistedState(companionId);
    return { ...createDefaultBehaviorState(), ...persisted };
  });
  const stateRef = useRef(state);
  const [lastDecision, setLastDecision] = useState<CompanionBehaviorDecision | null>(null);
  const [recentDismissCount, setRecentDismissCount] = useState(0);
  const [recentIgnoreCount, setRecentIgnoreCount] = useState(0);
  const dismissCountRef = useRef(0);
  const ignoreCountRef = useRef(0);
  const decisionTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    stateRef.current = state;
    persistState(companionId, state);
  }, [companionId, state]);

  const evaluate = useCallback(() => {
    const now = Date.now();
    const decision = decideCompanionBehavior({
      now,
      hasDiscoveryCandidate,
      userIsTyping,
      panelOpen,
      activeConversation,
      recentDismissCount: dismissCountRef.current,
      recentIgnoreCount: ignoreCountRef.current,
      state: stateRef.current,
    });
    setLastDecision(decision);
    onDecision?.(decision);
    return decision;
  }, [hasDiscoveryCandidate, userIsTyping, panelOpen, activeConversation, onDecision]);

  useEffect(() => {
    decisionTimerRef.current = window.setInterval(evaluate, 30_000);
    evaluate();
    return () => {
      if (decisionTimerRef.current !== undefined) window.clearInterval(decisionTimerRef.current);
    };
  }, [evaluate]);

  const recordInteraction = useCallback(() => {
    setState((prev) => ({ ...prev, lastUserInteractionAt: Date.now() }));
  }, []);

  const recordSpeech = useCallback(() => {
    setState((prev) => ({ ...prev, lastCompanionSpokeAt: Date.now() }));
  }, []);

  const recordDiscoveryPresented = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lastDiscoveryPresentedAt: Date.now(),
      discoveryPresentationState: 'presented',
    }));
  }, []);

  const recordDismiss = useCallback(() => {
    dismissCountRef.current += 1;
    setRecentDismissCount(dismissCountRef.current);
    setState((prev) => applyDismissSuppression(prev, Date.now()));
  }, []);

  const recordIgnore = useCallback(() => {
    ignoreCountRef.current += 1;
    setRecentIgnoreCount(ignoreCountRef.current);
    setState((prev) => applyIgnoreSuppression(prev, Date.now(), ignoreCountRef.current));
  }, []);

  const setDiscoveryPresentationState = useCallback((s: DiscoveryPresentationState) => {
    setState((prev) => ({ ...prev, discoveryPresentationState: s }));
  }, []);

  const setMode = useCallback((mode: CompanionMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const setMood = useCallback((mood: CompanionMood) => {
    setState((prev) => ({ ...prev, mood }));
  }, []);

  const setEnergy = useCallback((energy: CompanionEnergy) => {
    setState((prev) => ({ ...prev, energy }));
  }, []);

  const setFocus = useCallback((focus: CompanionFocus) => {
    setState((prev) => ({ ...prev, focus }));
  }, []);

  const setInitiativeLevel = useCallback((level: InitiativeLevel) => {
    setState((prev) => ({ ...prev, initiativeLevel: level }));
  }, []);

  const setDebugOverride = useCallback((on: boolean) => {
    setState((prev) => ({ ...prev, debugOverride: on }));
  }, []);

  const forceDecision = useCallback(() => {
    return evaluate();
  }, [evaluate]);

  const resetTimers = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lastCompanionSpokeAt: null,
      lastUserInteractionAt: null,
      lastDiscoveryPresentedAt: null,
      lastUserDismissedAt: null,
      interruptionSuppressedUntil: null,
    }));
    dismissCountRef.current = 0;
    ignoreCountRef.current = 0;
    setRecentDismissCount(0);
    setRecentIgnoreCount(0);
  }, []);

  return {
    state,
    lastDecision,
    recentDismissCount,
    recentIgnoreCount,
    recordInteraction,
    recordSpeech,
    recordDiscoveryPresented,
    recordDismiss,
    recordIgnore,
    setDiscoveryPresentationState,
    setMode,
    setMood,
    setEnergy,
    setFocus,
    setInitiativeLevel,
    setDebugOverride,
    forceDecision,
    resetTimers,
  };
}
