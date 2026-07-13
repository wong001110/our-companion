import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActionPermissionState,
  ActionPlanV2,
  ActionResult,
  AiDebugEntry,
  AiSettings,
  CharacterBehaviorSettings,
  CharacterProfile,
  CharacterRuntimeState,
  CompanionMessage,
  CompanionMessageSource,
  CompanionReplyLanguage,
  DebugDataResetTarget,
  DiaryEntry,
  Discovery,
  DiscoveryAnnouncePayload,
  EngineSnapshot,
  ExplorationCycleResult,
  ExplorationLoopEvent,
  CompanionJourney,
  JourneyMilestoneV2,
  KnowledgeGraph,
  KnowledgeGraphNode,
  NetworkStatus,
  VisitInvitationSummary,
  VisitSessionSummary,
  PermissionScope,
  PerformanceScriptV2,
  SpeechSettings,
  SpeechStatus,
  ToolExecutionResult,
  ToolPreview,
  UiLang,
  UpdateAiSettingsInput,
  UpdateSpeechSettingsInput,
  PendingCompanionAction
} from '@our-companion/shared';
import { COMPANION_CHAT_RETENTION_DAYS } from '@our-companion/shared';
import { t, type Lang } from '../i18n';
import { getWalkDelay, getWalkDelayRange, selectSpeechLine } from '../companion/runtime/companionBehavior';
import { getIdleRotationDelay, isIdleState, selectWeightedIdleAnimation } from '../companion/runtime/idleBehavior';
import { TypewriterSpeechBubble } from '../companion/TypewriterSpeechBubble';
import { DiscoveryPopoutCard } from '../companion/DiscoveryPopoutCard';
import { useCompanionSession } from '../companion/useCompanionSession';
import { useSpeech } from '../companion/useSpeech';
import { useDiscoveryPresentation } from '../companion/useDiscoveryPresentation';
import type { PresentationCandidate } from '../companion/PresentationCandidate';
import { CompanionCanvas, type AnimationName, type CompanionDragPoint } from './CompanionCanvas';
import { LangContext, useLang, NotebookPage, PaperCard, StickyNote, MiniCompanionSticker, ProgressBar, NotebookChatBubble } from './NotebookPrimitives';
import { EngineObservatory } from '../features/developer/EngineObservatory';
import { EngineObservatoryToolbar, loadObservatoryState, type EnginePanelKey } from '../features/developer/EngineObservatoryToolbar';
import { EngineSnapshotCard } from '../features/developer/EngineSnapshotCard';
import { useAudioCapture } from '../companion/useAudioCapture';
import {
  type Tab, type DevAnimation, devAnimations, formatJson, formatDuration,
  formatDiscoveryTime, formatRelativeDate, formatShortDate, formatAskResult,
  readable, capitalize, randomBetween, clamp, easeInOut,
  companionStatusMessage, companionMoodLabel, tabLabel, debugPreview,
  createDevAnimationState, parseLocalCommand
} from './utils';
import { DebugJsonBlock, DebugTextBlock } from './DebugComponents';
import { useFloatingPlacement } from '../companion/useFloatingPlacement';
import { CompanionQuickActions } from '../companion/CompanionQuickActions';
import { DragHandle } from '../companion/DragHandle';
import { anchorFromBounds, type Rect } from '../companion/floatingPlacement';
import { useCompanionBehavior } from '../companion/behavior/useCompanionBehavior';
import type { CommandExecutionHandle } from '../companion/behavior/commandLifecycle';
import { useInteractiveRegion } from '../companion/useInteractiveRegion';
import type { CompanionProfile } from '@our-companion/shared';
import { CompanionCreationPage } from '../companion/creation/CompanionCreationPage';
import { CompanionEditPage } from '../companion/creation/CompanionEditPage';
import { CompanionSelectionPage } from '../companion/selection/CompanionSelectionPage';
import { getCreationCompletionAction, switchToSelectedCompanion } from '../companion/creation/creationCompletionFlow';
import { isCompanionAnimationName, resolveWalkDirection } from '../character/animationSelection';
import { startPerformancePlayback, type ActivePerformancePlayback } from '../character/performancePlayback';

type LocalExecutionPhase = 'waiting_to_start' | 'started' | 'completed' | 'cancelled' | 'failed';

export function App() {
  const mode = new URLSearchParams(window.location.search).get('mode');
  return <><PresenceActivityReporter />{mode === 'panel' ? <PanelShell /> : mode === 'creation' ? <CreationShell /> : <CompanionEntryShell />}</>;
}

function PresenceActivityReporter() {
  useEffect(() => {
    let lastSentAt = 0;
    const report = () => {
      const now = Date.now();
      if (now - lastSentAt < 10_000) return;
      lastSentAt = now;
      void window.ourCompanion.network.presence.sendActivity();
    };
    window.addEventListener('focus', report);
    window.addEventListener('pointerdown', report, { passive: true });
    return () => { window.removeEventListener('focus', report); window.removeEventListener('pointerdown', report); };
  }, []);
  return null;
}

function CompanionEntryShell() {
  const [activeCompanion, setActiveCompanion] = useState<CompanionProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void initCompanion();
  }, []);

  async function initCompanion() {
    let found = false;
    try {
      const companion = await window.ourCompanion.companionNew.getPrimary();
      if (companion) {
        setActiveCompanion(companion);
        found = true;
      }
    } catch {
      // no companion
    }
    if (!found) {
      void window.ourCompanion.creation.openWindow();
    }
    setLoaded(true);
  }

  useEffect(() => {
    const unsub = window.ourCompanion.creation.onCompleted((companion) => {
      setActiveCompanion(companion);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = window.ourCompanion.companion.onRefresh(async () => {
      try {
        const companion = await window.ourCompanion.companionNew.getPrimary();
        if (companion) setActiveCompanion(companion);
      } catch { /* ignore */ }
    });
    return unsub;
  }, []);

  if (!loaded) return null;

  if (activeCompanion) {
    return <CompanionShell companion={activeCompanion} onSwitchCompanion={() => {
      void window.ourCompanion.window.openPanelForSwitch();
    }} />;
  }

  return <div className="companion-onboarding-required">Create your first Companion to begin.</div>;
}

function CompanionShell({ companion, onSwitchCompanion }: { companion: CompanionProfile; onSwitchCompanion: () => void }) {
  const companionKey = (suffix: string) => `companion:${companion.id}:${suffix}`;
  const [state, setState] = useState<CharacterRuntimeState>();
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [idleAnimation, setIdleAnimation] = useState<AnimationName>('Idle_Neutral');
  const [movementAnimation, setMovementAnimation] = useState<AnimationName | undefined>(undefined);
  const [performanceAnimation, setPerformanceAnimation] = useState<AnimationName | undefined>(undefined);
  const performancePlaybackRef = useRef<ActivePerformancePlayback | undefined>(undefined);
  const exitRequestedRef = useRef(false);

  const [developerEnabled, setDeveloperEnabled] = useState(() =>
    import.meta.env.DEV && localStorage.getItem('companion:developer:enabled') === 'true'
  );
  const [observatoryState, setObservatoryState] = useState(loadObservatoryState);
  const [engineSnapshot, setEngineSnapshot] = useState<EngineSnapshot>();

  const speech = useSpeech();

  useEffect(() => {
    setPerformanceAnimation('Enter');
    speech.showInstant(selectSpeechLine('enter', Math.random, langRef.current));
    const fallback = window.setTimeout(() => setPerformanceAnimation((current) => current === 'Enter' ? undefined : current), 2500);
    return () => window.clearTimeout(fallback);
  }, [speech.showInstant]);

  const discovery = useDiscoveryPresentation({
    onDismissed: () => behavior.recordDismiss(),
  });

  const [lang, setLang] = useState<Lang>('en');
  const behaviorRef = useRef<CharacterBehaviorSettings | undefined>(undefined);
  const stateRef = useRef<CharacterRuntimeState | undefined>(undefined);
  const langRef = useRef<Lang>('en');
  const isDraggingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const dragOriginRef = useRef<{ screenX: number; screenY: number } | undefined>(undefined);
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const quickActionsTimeoutRef = useRef<number | undefined>(undefined);
  const [dragHandleVisible, setDragHandleVisible] = useState(false);
  const isHoveringCompanionRef = useRef(false);
  const isHoveringActionsRef = useRef(false);
  const cancelCommandRef = useRef<(reason: string) => void>(() => undefined);

  useEffect(() => {
    const unsub = window.ourCompanion.app.onExitAnimation(() => {
      cancelCommandRef.current('window_shutdown');
      exitRequestedRef.current = true;
      speech.showInstant(selectSpeechLine('leave', Math.random, langRef.current));
      setPerformanceAnimation('Leave');
      window.setTimeout(() => {
        if (exitRequestedRef.current) void window.ourCompanion.app.quit();
      }, 1800);
    });
    return unsub;
  }, []);

  const interactive = useInteractiveRegion();

  useEffect(() => {
    if (!quickActionsVisible) {
      interactive.leave('quick-actions');
    }
  }, [quickActionsVisible, interactive]);

  const COMPANION_SPRITE = { width: 220, height: 230 };
  const [companionPosition, setCompanionPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(companionKey('position'));
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        return { x: p.x, y: p.y };
      }
    } catch { /* ignore */ }
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: Math.round(w / 2 - COMPANION_SPRITE.width / 2), y: Math.round(h * 0.6) };
  });
  const companionPositionRef = useRef(companionPosition);

  const quickActionsPositions = useMemo(() => {
    const anchor = anchorFromBounds({
      x: companionPosition.x,
      y: companionPosition.y,
      width: COMPANION_SPRITE.width,
      height: COMPANION_SPRITE.height,
    });
    const obstacles: Rect[] = [];
    return { anchor, obstacles };
  }, [companionPosition.x, companionPosition.y]);

  function applyState(next: CharacterRuntimeState) {
    stateRef.current = next;
    setState(next);
  }

  const [textInput, setTextInput] = useState('');
  const [textOpen, setTextOpen] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  const { phase, toggleListening, runTurn, onTypewriterComplete, isSessionActive } = useCompanionSession({
    characterId: companion.id,
    stateRef,
    applyState,
    onInstantSpeech: speech.showInstant,
    onTypewriterSpeech: speech.showTypewriter,
    pauseAmbient: (paused) => {
      sessionActiveRef.current = paused;
    }
  });
  const [softHintVisible, setSoftHintVisible] = useState(false);
  const behaviorCommandActionsRef = useRef<{ recordSpeech: () => void; recordDiscoveryPresented: () => void }>({
    recordSpeech: () => undefined,
    recordDiscoveryPresented: () => undefined,
  });
  const commandCompletionRef = useRef<{ commandId: string; complete: () => void } | null>(null);
  const commandPresentationRef = useRef({ discovery, softHintVisible, speech, companionName: companion.name });
  commandPresentationRef.current = { discovery, softHintVisible, speech, companionName: companion.name };

  const handleCompanionCommand = useCallback((command: import('@our-companion/shared').CompanionCommand): CommandExecutionHandle => {
    const presentation = commandPresentationRef.current;
    let resolveStarted!: () => void;
    let rejectStarted!: (reason: Error) => void;
    let resolveCompleted!: () => void;
    let rejectCompleted!: (reason: Error) => void;
    const started = new Promise<void>((resolve, reject) => { resolveStarted = resolve; rejectStarted = reject; });
    const completed = new Promise<void>((resolve, reject) => { resolveCompleted = resolve; rejectCompleted = reject; });
    let phase: LocalExecutionPhase = 'waiting_to_start';
    const fail = (reason: string) => {
      if (phase === 'completed' || phase === 'cancelled' || phase === 'failed') return;
      const wasWaitingToStart = phase === 'waiting_to_start';
      phase = 'failed';
      if (commandCompletionRef.current?.commandId === command.id) commandCompletionRef.current = null;
      if (wasWaitingToStart) rejectStarted(new Error(reason));
      rejectCompleted(new Error(reason));
    };
    const beginVisiblePresentation = () => window.requestAnimationFrame(() => {
      if (phase !== 'waiting_to_start') return;
      phase = 'started';
      resolveStarted();
    });
    const completePresentation = () => {
      if (phase !== 'started') return;
      phase = 'completed';
      if (commandCompletionRef.current?.commandId === command.id) commandCompletionRef.current = null;
      resolveCompleted();
    };
    const cancel = (reason: string) => {
      if (phase === 'completed' || phase === 'cancelled' || phase === 'failed') return;
      const wasWaitingToStart = phase === 'waiting_to_start';
      phase = 'cancelled';
      if (commandCompletionRef.current?.commandId === command.id) commandCompletionRef.current = null;
      if (wasWaitingToStart) rejectStarted(new Error(reason));
      rejectCompleted(new Error(reason));
    };
    const displayHint = command.decision.displayHint;
    if (displayHint === 'show_soft_hint' && !presentation.discovery.popup && !presentation.softHintVisible) {
      setSoftHintVisible(true);
      behaviorCommandActionsRef.current.recordSpeech();
      presentation.speech.showInstant(`${presentation.companionName} found something interesting. Want to see it?`);
      beginVisiblePresentation();
      window.requestAnimationFrame(completePresentation);
    } else if (displayHint === 'present_discovery' && !presentation.discovery.popup) {
      const next = presentation.discovery.presentNext();
      if (next) {
        const completedImmediately = presentation.speech.showTypewriter(next.shareMessage);
        behaviorCommandActionsRef.current.recordDiscoveryPresented();
        beginVisiblePresentation();
        if (completedImmediately) {
          window.requestAnimationFrame(completePresentation);
          return { started, completed, cancel };
        }
        commandCompletionRef.current = { commandId: command.id, complete: completePresentation };
      } else {
        fail('missing_discovery');
      }
    } else {
      fail('unsupported_command');
    }
    return { started, completed, cancel };
  }, [speech.showInstant]);

  const behavior = useCompanionBehavior({ companionId: companion.id, onCommand: handleCompanionCommand });
  behaviorCommandActionsRef.current = behavior;
  cancelCommandRef.current = behavior.cancelActiveCommand;

  useEffect(() => {
    const cancelForShutdown = () => behavior.cancelActiveCommand('window_shutdown');
    window.addEventListener('beforeunload', cancelForShutdown);
    return () => window.removeEventListener('beforeunload', cancelForShutdown);
  }, [behavior.cancelActiveCommand]);

  const floatingPositions = useFloatingPlacement({
    hasBubble: speech.hasSpeech,
    hasCard: !!discovery.popup,
    hasTextInput: textOpen && phase === 'idle',
    companionPosition,
    screenWorkArea: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
  });

  const handleTypewriterComplete = useCallback((generation: number) => {
    if (!speech.onTypewriterComplete(generation)) return; // still more chunks to speak or stale completion
    onTypewriterComplete();
    const completion = commandCompletionRef.current;
    commandCompletionRef.current = null;
    completion?.complete();
  }, [speech.onTypewriterComplete, onTypewriterComplete]);

  const openTextInput = useCallback(() => {
    setTextOpen(true);
    interactive.enter('chat-input');
  }, [interactive]);

  const closeTextInput = useCallback(() => {
    setTextOpen(false);
    setTextInput('');
    interactive.leave('chat-input');
    interactive.leave('companion-hover');
    interactive.leave('quick-actions');
  }, [interactive]);

  const handleTextSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = textInput.trim();
      if (!trimmed || phase !== 'idle') return;
      closeTextInput();
      await runTurn(trimmed, 'companion_text');
    },
    [textInput, phase, runTurn, closeTextInput]
  );

  useEffect(() => {
    if (phase !== 'idle' && textOpen) {
      closeTextInput();
    }
  }, [phase, textOpen, closeTextInput]);

  useEffect(() => {
    document.documentElement.classList.add('companion-mode');
    return () => document.documentElement.classList.remove('companion-mode');
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'companion:developer:enabled') {
        setDeveloperEnabled(e.newValue === 'true');
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!developerEnabled || observatoryState.enabledPanels.length === 0) return;
    let cancelled = false;
    async function refresh() {
      try {
        const snap = await window.ourCompanion.debug.getEngineSnapshot();
        if (!cancelled) setEngineSnapshot(snap);
      } catch { /* ignore */ }
    }
    void refresh();
    const interval = window.setInterval(refresh, observatoryState.refreshRateSeconds * 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [developerEnabled, observatoryState.enabledPanels.length, observatoryState.refreshRateSeconds]);

  useEffect(() => {
    setIdleAnimation('Idle_Neutral');
    const timer = window.setTimeout(() => {
      if (stateRef.current) {
        const base = stateRef.current;
        setState({
          ...base,
          coreState: 'idle',
          intent: 'waiting',
          updatedAt: new Date().toISOString()
        });
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (localStorage.getItem(companionKey('onboarded'))) return;
    const timer = window.setTimeout(() => {
      speech.showInstant("Hi! Hover over me to see what I can do.");
      localStorage.setItem(companionKey('onboarded'), '1');
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      void window.ourCompanion.window.setMousePassthrough({ passthrough: false });
    };
  }, []);

  useEffect(() => {
    function applyLang(value: string) {
      const next = (value === 'zh-CN' ? 'zh-CN' : 'en') as Lang;
      setLang(next);
      langRef.current = next;
    }
    const stored = localStorage.getItem('companion_uiLang');
    if (stored) applyLang(stored);
    void window.ourCompanion.ai.getSettings().then((settings) => {
      if (settings.uiLang) applyLang(settings.uiLang);
    }).catch(() => undefined);
    function onStorage(e: StorageEvent) {
      if (e.key === 'companion_uiLang' && e.newValue) applyLang(e.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const unsubscribeState = window.ourCompanion.character.onStateChange((next) => {
      applyState(next);
    });
    const unsubscribeAnnounce = window.ourCompanion.discovery.onAnnounce((payload) => {
      const pc: PresentationCandidate = {
        id: payload.discoveryId,
        title: payload.title,
        oneLineHook: payload.cardBody ?? payload.whyThisMatters ?? payload.title,
        whyYouMightCare: payload.whyThisMatters ?? payload.cardBody ?? '',
        shareMessage: payload.message,
        sourceName: payload.source,
        sourceUrl: payload.sourceUrl,
        tags: payload.tags
      };
      discovery.enqueue(pc);
    });
    const unsubscribePerformance = window.ourCompanion.action.onPerformance((script: PerformanceScriptV2) => {
      performancePlaybackRef.current?.cancel();
      setPerformanceAnimation(undefined);
      performancePlaybackRef.current = startPerformancePlayback(script, setPerformanceAnimation);
    });
    return () => {
      unsubscribeState();
      unsubscribeAnnounce();
      unsubscribePerformance();
      performancePlaybackRef.current?.cancel();
      performancePlaybackRef.current = undefined;
    };
  }, []);

  function handlePointerHitChange(_isHit: boolean) {
  }

  const handleAnimationComplete = useCallback((name: AnimationName) => {
    if (name === 'Leave' && exitRequestedRef.current) {
      exitRequestedRef.current = false;
      void window.ourCompanion.app.quit();
      return;
    }
    if (name === performanceAnimation) setPerformanceAnimation(undefined);
  }, [performanceAnimation]);

  function handleCompanionHoverEnter() {
    isHoveringCompanionRef.current = true;
    if (quickActionsTimeoutRef.current !== undefined) {
      window.clearTimeout(quickActionsTimeoutRef.current);
      quickActionsTimeoutRef.current = undefined;
    }
    setQuickActionsVisible(true);
    setDragHandleVisible(true);
    interactive.enter('companion-hover');
  }

  function handleCompanionHoverLeave() {
    isHoveringCompanionRef.current = false;
    scheduleHideQuickActions();
    interactive.leave('companion-hover');
  }

  function handleActionsHoverEnter() {
    isHoveringActionsRef.current = true;
    if (quickActionsTimeoutRef.current !== undefined) {
      window.clearTimeout(quickActionsTimeoutRef.current);
      quickActionsTimeoutRef.current = undefined;
    }
    interactive.enter('quick-actions');
  }

  function handleActionsHoverLeave() {
    isHoveringActionsRef.current = false;
    scheduleHideQuickActions();
    interactive.leave('quick-actions');
  }

  function scheduleHideQuickActions() {
    if (quickActionsTimeoutRef.current !== undefined) {
      window.clearTimeout(quickActionsTimeoutRef.current);
    }
    quickActionsTimeoutRef.current = window.setTimeout(() => {
      if (!isHoveringCompanionRef.current && !isHoveringActionsRef.current) {
        setQuickActionsVisible(false);
        setDragHandleVisible(false);
      }
      quickActionsTimeoutRef.current = undefined;
    }, 150);
  }

  function handleDragStart(point: CompanionDragPoint) {
    isDraggingRef.current = true;
    setMovementAnimation(undefined);
    dragOriginRef.current = undefined;
    setQuickActionsVisible(false);
    setDragHandleVisible(false);
    void window.ourCompanion.companion.reportDragging({ dragging: true });
    interactive.enter('companion-drag');
    dragOriginRef.current = { screenX: point.screenX, screenY: point.screenY };
  }

  function handleDragMove(point: CompanionDragPoint) {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const dx = point.screenX - origin.screenX;
    const dy = point.screenY - origin.screenY;
    const next = {
      x: companionPositionRef.current.x + dx,
      y: companionPositionRef.current.y + dy,
    };
    companionPositionRef.current = next;
    setCompanionPosition(next);
    origin.screenX = point.screenX;
    origin.screenY = point.screenY;
  }

  function handleDragEnd() {
    isDraggingRef.current = false;
    dragOriginRef.current = undefined;
    void window.ourCompanion.companion.reportDragging({ dragging: false });
    interactive.leave('companion-drag');
    const pos = companionPositionRef.current;
    localStorage.setItem(companionKey('position'), JSON.stringify(pos));
    void window.ourCompanion.character.updatePosition({ characterId: companion.id, x: pos.x, y: pos.y })
      .then((nextState) => { stateRef.current = nextState; setState(nextState); })
      .catch(() => undefined);
  }

  useEffect(() => {
    const saved = localStorage.getItem(companionKey('position'));
    if (saved) {
      try {
        const p = JSON.parse(saved) as { x: number; y: number };
        const w = window.innerWidth;
        const h = window.innerHeight;
        const clamped = {
          x: Math.max(0, Math.min(p.x, w - COMPANION_SPRITE.width)),
          y: Math.max(0, Math.min(p.y, h - COMPANION_SPRITE.height)),
        };
        setCompanionPosition(clamped);
        companionPositionRef.current = clamped;
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let walkTimeout: number | undefined;
    let idleTimeout: number | undefined;
    let ambientTimeout: number | undefined;
    let behaviorRefreshTimeout: number | undefined;
    let animationFrame: number | undefined;

    function applyStateFromEffect(next: CharacterRuntimeState) {
      stateRef.current = next;
      setState(next);
    }

    function previewState(coreState: CharacterRuntimeState['coreState'], intent: CharacterRuntimeState['intent'], animationIntent?: AnimationName) {
      const base = stateRef.current;
      if (!base) return;
      applyStateFromEffect({
        ...base,
          coreState,
          intent,
          animationIntent,
        updatedAt: new Date().toISOString()
      });
    }

    function isAmbientPaused() {
      return sessionActiveRef.current || stateRef.current?.intent === 'sharing_discovery';
    }

    async function walkRandomly() {
      try {
        if (cancelled || isDraggingRef.current || isAmbientPaused()) return;

        const workArea = await window.ourCompanion.window.getWorkArea();
        if (cancelled || isDraggingRef.current) return;

        const companionWidth = COMPANION_SPRITE.width;
        const companionHeight = COMPANION_SPRITE.height;
        const minX = workArea.x + 12;
        const maxX = workArea.x + workArea.width - companionWidth - 12;
        const minY = workArea.y + 12;
        const maxY = workArea.y + workArea.height - companionHeight - 12;
        if (maxX <= minX || maxY <= minY) return;

        const currentX = companionPositionRef.current.x;
        const currentY = companionPositionRef.current.y;
        let targetX = randomBetween(minX, maxX);
        let targetY = randomBetween(minY, maxY);
        if (Math.abs(targetX - currentX) < 80 && Math.abs(targetY - currentY) < 80) {
          targetX = currentX < (minX + maxX) / 2 ? maxX : minX;
          targetY = currentY < (minY + maxY) / 2 ? maxY : minY;
        }

        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const walkAnimation = resolveWalkDirection(dx, dy);

        if (Math.abs(dx) >= Math.abs(dy)) {
          setFacing(dx < 0 ? 'left' : 'right');
        }

        speech.showTypewriter(selectSpeechLine('walk_start', Math.random, langRef.current));
        setMovementAnimation(walkAnimation ?? undefined);
        previewState('walking', 'wandering', walkAnimation ?? undefined);

        const startX = currentX;
        const startY = currentY;
        const distance = Math.hypot(dx, dy);
        const durationMs = clamp((distance / 115) * 1000, 900, 5200);
        const startedAt = performance.now();

        await new Promise<void>((resolve) => {
          const step = (now: number) => {
            if (cancelled || isDraggingRef.current) {
              resolve();
              return;
            }

            const progress = Math.min(1, (now - startedAt) / durationMs);
            const eased = easeInOut(progress);
            const nextX = startX + (targetX - startX) * eased;
            const nextY = startY + (targetY - startY) * eased;
            const nextPos = { x: Math.round(nextX), y: Math.round(nextY) };
            companionPositionRef.current = nextPos;
            setCompanionPosition(nextPos);

            if (progress < 1) {
              animationFrame = window.requestAnimationFrame(step);
            } else {
              animationFrame = undefined;
              resolve();
            }
          };

          animationFrame = window.requestAnimationFrame(step);
        });

        void window.ourCompanion.character.updatePosition({ characterId: companion.id, x: companionPositionRef.current.x, y: companionPositionRef.current.y })
          .then((nextState) => { stateRef.current = nextState; setState(nextState); })
          .catch(() => undefined);
        localStorage.setItem(companionKey('position'), JSON.stringify(companionPositionRef.current));
      } catch (error) {
        console.warn('[our-companion] Companion walk failed; scheduling next walk.', error);
      } finally {
        setMovementAnimation(undefined);
        if (!isDraggingRef.current) {
          previewState('idle', 'waiting');
          if (!cancelled) speech.showTypewriter(selectSpeechLine('walk_end', Math.random, langRef.current));
        }
      }
    }

    async function refreshBehaviorSettings() {
      try {
        behaviorRef.current = await window.ourCompanion.character.getBehaviorSettings(companion.id);
      } catch (error) {
        console.warn('[our-companion] Unable to refresh companion behavior settings.', error);
      }
    }

    function scheduleNextWalk() {
      if (cancelled) return;
      walkTimeout = window.setTimeout(async () => {
        if (isAmbientPaused()) {
          scheduleNextWalk();
          return;
        }
        try {
          await walkRandomly();
        } finally {
          scheduleNextWalk();
        }
      }, getWalkDelay(behaviorRef.current?.effectiveMovement ?? 25));
    }

    function scheduleBehaviorRefresh() {
      if (cancelled) return;
      behaviorRefreshTimeout = window.setTimeout(async () => {
        await refreshBehaviorSettings();
        scheduleBehaviorRefresh();
      }, 5000);
    }

    function scheduleIdleRotation() {
      if (cancelled) return;
      idleTimeout = window.setTimeout(() => {
        if (isIdleState(stateRef.current)) {
          setIdleAnimation(selectWeightedIdleAnimation());
        }
        scheduleIdleRotation();
      }, getIdleRotationDelay());
    }

    function scheduleAmbientSpeech() {
      if (cancelled) return;
      ambientTimeout = window.setTimeout(() => {
        if (isIdleState(stateRef.current) && !isAmbientPaused()) {
          speech.showInstant(selectSpeechLine('ambient', Math.random, langRef.current));
        }
        scheduleAmbientSpeech();
      }, randomBetween(30000, 65000));
    }

    Promise.all([window.ourCompanion.character.getState(companion.id), window.ourCompanion.character.getBehaviorSettings(companion.id)]).then(([next, behavior]) => {
      if (cancelled) return;
      behaviorRef.current = behavior;
      applyStateFromEffect(next);
      setIdleAnimation(selectWeightedIdleAnimation(() => 0));
      scheduleIdleRotation();
      scheduleAmbientSpeech();
      scheduleBehaviorRefresh();
      scheduleNextWalk();
    });

    return () => {
      cancelled = true;
      if (walkTimeout !== undefined) window.clearTimeout(walkTimeout);
      if (idleTimeout !== undefined) window.clearTimeout(idleTimeout);
      if (ambientTimeout !== undefined) window.clearTimeout(ambientTimeout);
      if (behaviorRefreshTimeout !== undefined) window.clearTimeout(behaviorRefreshTimeout);
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <main
      className="companion-shell"
      onClick={(e) => {
        if (textOpen && !(e.target as HTMLElement).closest('.companion-canvas') && !(e.target as HTMLElement).closest('.companion-text-input')) {
          closeTextInput();
        }
      }}
    >
      {developerEnabled && (
        <>
          <EngineObservatoryToolbar
            enabledPanels={observatoryState.enabledPanels}
            refreshRateSeconds={observatoryState.refreshRateSeconds}
            onChange={setObservatoryState}
          />
          {observatoryState.enabledPanels.length > 0 && (
            <div className="observatory-snapshot-row">
              {observatoryState.enabledPanels.map((panel) => (
                <EngineSnapshotCard key={panel} engineKey={panel} snapshot={engineSnapshot} />
              ))}
            </div>
          )}
        </>
      )}
      <div
        style={{
          position: 'absolute',
          left: companionPosition.x,
          top: companionPosition.y,
          zIndex: 1,
          pointerEvents: 'all',
        }}
        onMouseEnter={handleCompanionHoverEnter}
        onMouseLeave={handleCompanionHoverLeave}
      >
        <DragHandle
          visible={dragHandleVisible}
          width={COMPANION_SPRITE.width}
          height={COMPANION_SPRITE.height}
        />
        <CompanionCanvas
          state={state}
          facing={facing}
          isListening={phase === 'listening'}
          userIsTyping={textOpen}
          assetRoot={companion.assetRoot}
          companionId={companion.id}
          movementAnimation={movementAnimation}
          idleAnimation={idleAnimation}
          animationOverride={performanceAnimation}
          onPointerHitChange={handlePointerHitChange}
          onOpenPanel={() => undefined}
          onToggleListen={toggleListening}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onAnimationComplete={handleAnimationComplete}
        />
      </div>
      {speech.typewriterMessage && (
        <TypewriterSpeechBubble
          key={speech.typewriterGeneration}
          message={speech.typewriterMessage}
          onComplete={() => handleTypewriterComplete(speech.typewriterGeneration)}
          onMouseEnter={() => interactive.enter('speech-bubble')}
          onMouseLeave={() => interactive.leave('speech-bubble')}
          style={floatingPositions.bubble ? {
            position: 'absolute',
            left: floatingPositions.bubble.rect.x,
            top: floatingPositions.bubble.rect.y,
            width: floatingPositions.bubble.rect.width,
            transform: 'none',
          } : undefined}
        />
      )}
      {!speech.typewriterMessage && speech.speech && (
        <div
          className="speech-bubble"
          onMouseEnter={() => interactive.enter('speech-bubble')}
          onMouseLeave={() => interactive.leave('speech-bubble')}
          style={floatingPositions.bubble ? {
            left: floatingPositions.bubble.rect.x,
            top: floatingPositions.bubble.rect.y,
            width: floatingPositions.bubble.rect.width,
            transform: 'none',
          } : undefined}
        >
          {speech.speech}
        </div>
      )}
      {discovery.popup && (
        <DiscoveryPopoutCard
          candidate={discovery.popup}
          loading={discovery.actionLoading}
          error={discovery.actionError}
          style={floatingPositions.card ? {
            position: 'absolute',
            left: floatingPositions.card.rect.x,
            top: floatingPositions.card.rect.y,
            width: floatingPositions.card.rect.width,
            right: 'auto',
          } : undefined}
          onMouseEnter={() => interactive.enter('discovery-card')}
          onMouseLeave={() => interactive.leave('discovery-card')}
          onSave={() => discovery.save(discovery.popup!)}
          onAddToJourney={() => discovery.addToJourney(discovery.popup!)}
          onIgnore={() => discovery.ignore(discovery.popup!)}
          onClose={() => {
            behavior.cancelActiveCommand('user_dismissed');
            discovery.dismiss();
            interactive.clearAll();
          }}
        />
      )}
      {softHintVisible && !discovery.popup && discovery.hasCandidate() && (
        <div
          className="companion-soft-hint"
          style={floatingPositions.card ? {
            position: 'absolute',
            left: floatingPositions.card.rect.x,
            top: floatingPositions.card.rect.y,
            width: floatingPositions.card.rect.width,
            right: 'auto',
          } : undefined}
        >
          <p>{companion.name} found something interesting. Want to see it?</p>
          <div className="soft-hint-actions">
            <button className="companion-quick-btn" onClick={() => {
              setSoftHintVisible(false);
              behavior.setDiscoveryPresentationState('presented');
              const next = discovery.presentNext();
              if (next) {
                const completedImmediately = speech.showTypewriter(next.shareMessage);
                behavior.recordDiscoveryPresented();
                if (completedImmediately) onTypewriterComplete();
              }
            }}>Show me</button>
            <button className="companion-quick-btn soft-hint-dismiss" onClick={() => {
              setSoftHintVisible(false);
              behavior.recordDismiss();
            }}>Not now</button>
          </div>
        </div>
      )}
      <CompanionQuickActions
        visible={quickActionsVisible && !isDraggingRef.current}
        anchorRect={quickActionsPositions.anchor}
        screenWorkArea={{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }}
        obstacles={quickActionsPositions.obstacles}
        onTextChat={() => {
          setQuickActionsVisible(false);
          openTextInput();
        }}
        onVoiceChat={() => {
          setQuickActionsVisible(false);
          toggleListening();
        }}
        onOpenPanel={() => {
          setQuickActionsVisible(false);
          void window.ourCompanion.window.openPanel({ companionX: companionPositionRef.current.x, companionY: companionPositionRef.current.y });
        }}
        onSwitchCompanion={() => {
          setQuickActionsVisible(false);
          onSwitchCompanion();
        }}
        onMouseEnter={handleActionsHoverEnter}
        onMouseLeave={handleActionsHoverLeave}
      />
      {phase === 'idle' && textOpen && (
        <form
          className="companion-text-input"
          style={floatingPositions.textInput ? {
            position: 'absolute',
            left: floatingPositions.textInput.rect.x,
            top: floatingPositions.textInput.rect.y,
            width: floatingPositions.textInput.rect.width,
            bottom: 'auto',
            transform: 'none',
          } : {
            position: 'absolute',
            left: companionPosition.x + COMPANION_SPRITE.width / 2 - 100,
            top: companionPosition.y + COMPANION_SPRITE.height + 8,
            bottom: 'auto',
            transform: 'none',
          }}
          onSubmit={(e) => { void handleTextSubmit(e); }}
        >
          <input
            ref={textInputRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={`Type to ${companion.name}…`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeTextInput();
            }}
          />
        </form>
      )}
    </main>
  );
}

function CreationShell() {
  const [view, setView] = useState<'select' | 'create' | 'edit'>('select');
  const [editingCompanion, setEditingCompanion] = useState<CompanionProfile | undefined>(undefined);
  const [selectionRefreshKey, setSelectionRefreshKey] = useState(0);
  const [startupState, setStartupState] = useState<'idle' | 'starting' | 'recovery'>('idle');

  useEffect(() => {
    document.documentElement.classList.add('creation-mode');
    return () => document.documentElement.classList.remove('creation-mode');
  }, []);

  useEffect(() => window.ourCompanion.creation.onStartupFailed(() => {
    setStartupState('recovery');
  }), []);

  function handleCreationComplete(companion: CompanionProfile) {
    if (getCreationCompletionAction(companion) === 'main-process-onboarding') {
      setStartupState('starting');
      return;
    }
    setEditingCompanion(undefined);
    setSelectionRefreshKey((key) => key + 1);
    setView('select');
  }

  async function handleSelectCompanion(selected: CompanionProfile) {
    await switchToSelectedCompanion(selected, {
      setPrimary: (id) => window.ourCompanion.companionNew.setPrimary(id),
      showCompanion: () => window.ourCompanion.window.showCompanion(),
      closeCreationWindow: () => window.ourCompanion.creation.closeWindow(),
    });
  }

  function handleEdit(companion: CompanionProfile) {
    setEditingCompanion(companion);
    setView('edit');
  }

  function handleEditComplete(companion: CompanionProfile) {
    setEditingCompanion(undefined);
    setView('select');
  }

  function handleClose() {
    void window.ourCompanion.app.quit();
  }

  async function handleRetryStartup() {
    setStartupState('starting');
    try {
      const scheduled = await window.ourCompanion.creation.retryCompletion();
      if (!scheduled) setStartupState('recovery');
    } catch {
      setStartupState('recovery');
    }
  }

  if (startupState !== 'idle') {
    const recovering = startupState === 'recovery';
    return (
      <main className="creation-shell">
        <CreationDragHandle />
        <button className="creation-close-btn" onClick={handleClose} title="Close">
          &#x2715;
        </button>
        <div className="companion-creation-page">
          <div className="creation-card">
            <h1>{recovering ? 'Your Companion is ready to retry' : 'Starting your Companion…'}</h1>
            <p className="creation-subtitle">
              {recovering
                ? 'Your Companion was created, but its window could not start. Your data is safe.'
                : 'Opening your Companion Window…'}
            </p>
            {recovering && (
              <div className="creation-actions">
                <button className="btn-secondary" onClick={handleClose}>Quit</button>
                <button className="btn-primary" onClick={() => void handleRetryStartup()}>Retry Companion Window</button>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (view === 'edit' && editingCompanion) {
    return (
      <main className="creation-shell">
        <CreationDragHandle />
        <button className="creation-close-btn" onClick={handleClose} title="Close">
          &#x2715;
        </button>
        <CompanionEditPage
          companion={editingCompanion}
          onComplete={handleEditComplete}
          onCancel={() => { setEditingCompanion(undefined); setView('select'); }}
        />
      </main>
    );
  }

  if (view === 'create') {
    return (
      <main className="creation-shell">
        <CreationDragHandle />
        <button className="creation-close-btn" onClick={handleClose} title="Close">
          &#x2715;
        </button>
        <CompanionCreationPage
          onComplete={handleCreationComplete}
          onCancel={() => setView('select')}
        />
      </main>
    );
  }

  return (
    <main className="creation-shell">
      <CreationDragHandle />
      <button className="creation-close-btn" onClick={handleClose} title="Close">
        &#x2715;
      </button>
      <CompanionSelectionPage
        refreshKey={selectionRefreshKey}
        onSelect={(companion) => { void handleSelectCompanion(companion); }}
        onCreateNew={() => { setEditingCompanion(undefined); setView('create'); }}
        onEdit={handleEdit}
      />
    </main>
  );
}

function CreationDragHandle() {
  return (
    <div
      className="creation-drag-handle"
    />
  );
}

function PanelShell() {
  return <PanelDashboard />;
}

function PanelDashboard() {
  const [tab, setTab] = useState<Tab>('home');
  const [lang, setLang] = useState<Lang>('en');
  const [state, setState] = useState<CharacterRuntimeState>();
  const [behaviorSettings, setBehaviorSettings] = useState<CharacterBehaviorSettings>();
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [primaryCompanion, setPrimaryCompanion] = useState<CompanionProfile | null>(null);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [journeys, setJourneys] = useState<CompanionJourney[]>([]);
  const [timeline, setTimeline] = useState<JourneyMilestoneV2[]>([]);
  const [memoryGraph, setMemoryGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [exploration, setExploration] = useState<ExplorationCycleResult>();
  const [explorationEvents, setExplorationEvents] = useState<ExplorationLoopEvent[]>([]);
  const [exploring, setExploring] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState<boolean | null>(null);

  async function refreshAll() {
    const [nextState, nextBehavior, nextCharacters, feed, activeJourneys, milestones, graph, entries, companion] = await Promise.all([
      window.ourCompanion.character.getState(),
      window.ourCompanion.character.getBehaviorSettings(),
      window.ourCompanion.character.getActive(),
      window.ourCompanion.discovery.getFeed({ limit: 12 }),
      window.ourCompanion.journey.getActive(),
      window.ourCompanion.journey.getTimeline(),
      window.ourCompanion.memory.getGraph(),
      window.ourCompanion.diary.getEntries({ limit: 6 }),
      window.ourCompanion.companionNew.getPrimary()
    ]);
    setState(nextState);
    setBehaviorSettings(nextBehavior);
    setCharacters(nextCharacters);
    setDiscoveries(feed);
    setJourneys(activeJourneys);
    setTimeline(milestones);
    setMemoryGraph(graph);
    setDiary(entries);
    setPrimaryCompanion(companion);
  }

  useEffect(() => {
    void window.ourCompanion.companionNew.getPrimary().then((companion) => {
      setOnboardingRequired(!companion);
      if (companion) void refreshAll();
    });
    void window.ourCompanion.ai.getSettings().then((s) => {
      if (s.uiLang) setLang(s.uiLang as Lang);
    });
    const unsubscribeExploration = window.ourCompanion.autonomy.onExplorationEvent((event) => {
      setExplorationEvents((events) => [event, ...events].slice(0, 12));
    });
    return () => {
      unsubscribeExploration();
    };
  }, []);

  async function sendCompanionExploring() {
    if (exploring) return;
    setExploring(true);
    try {
      const result = await window.ourCompanion.autonomy.startExploration({ trigger: 'manual' });
      setExploration(result);
      await refreshAll();
    } finally {
      setExploring(false);
    }
  }

  async function submitExplorationFeedback(value: 'saved' | 'not_interested' | 'later' | 'talk_about_this' | 'opened_evidence') {
    const cycle = exploration?.cycle;
    const insight = exploration?.selectedInsight;
    if (!cycle) return;
    await window.ourCompanion.autonomy.submitFeedback({
      cycleId: cycle.id,
      insightId: insight?.id,
      value,
      note: insight?.title
    });
    await refreshAll();
    setExploration((current) =>
      current
        ? {
            ...current,
            cycle: { ...current.cycle, state: 'reflecting', completedAt: new Date().toISOString() }
          }
        : current
    );
  }

  if (onboardingRequired !== false) {
    return (
      <main className="panel-shell companion-onboarding-panel">
        {onboardingRequired === null ? <p>Checking Companion setup…</p> : (
          <>
            <h1>No Companion Created</h1>
            <p>Create your first AI-generated Companion before using the panel.</p>
            <button onClick={() => void window.ourCompanion.creation.openWindow()}>Create Companion</button>
          </>
        )}
      </main>
    );
  }

  return (
    <LangContext.Provider value={lang}>
      <main className="panel-shell">
        <aside className="sidebar">
          <div className="brand-mark">
            <span>{t(lang, 'brand_name')}</span>
            <small>{t(lang, 'brand_subtitle')}</small>
          </div>
          <nav>
            {(['home', 'discovery', 'journey', 'memory', 'chat', 'settings'] as Tab[]).map((item) => (
              <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
                {tabLabel(item, lang)}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="sidebar-exit-btn" onClick={() => {
              void window.ourCompanion.app.exitWithAnimation();
            }}>
              Exit App
            </button>
          </div>
        </aside>
        <section className="workspace">
          {tab === 'home' && (
            <HomeView
              state={state}
              character={characters[0]}
              discoveries={discoveries}
              journeys={journeys}
              diary={diary}
              exploration={exploration}
              explorationEvents={explorationEvents}
              exploring={exploring}
              onStartExploration={sendCompanionExploring}
              onSubmitFeedback={submitExplorationFeedback}
              onRefresh={refreshAll}
            />
          )}
          {tab === 'discovery' && (
            <DiscoveryView
              discoveries={discoveries}
              exploration={exploration}
              exploring={exploring}
              onStartExploration={sendCompanionExploring}
              onSubmitFeedback={submitExplorationFeedback}
              onRefresh={refreshAll}
            />
          )}
          {tab === 'journey' && <JourneyView journeys={journeys} timeline={timeline} onRefresh={refreshAll} />}
          {tab === 'memory' && <MemoryView graph={memoryGraph} onRefresh={refreshAll} />}
          {tab === 'chat' && <ChatView />}
          {tab === 'settings' && <SettingsView state={state} behaviorSettings={behaviorSettings} onRefresh={refreshAll} onLangChange={setLang} companionId={primaryCompanion?.id} assetRoot={primaryCompanion?.assetRoot} />}
        </section>
      </main>
    </LangContext.Provider>
  );
}

// ─── View Components ────────────────────────────────────────────────────────

function HomeView({
  state, character, discoveries, journeys, diary, exploration, explorationEvents, exploring, onStartExploration, onSubmitFeedback, onRefresh
}: {
  state?: CharacterRuntimeState;
  character?: CharacterProfile;
  discoveries: Discovery[];
  journeys: CompanionJourney[];
  diary: DiaryEntry[];
  exploration?: ExplorationCycleResult;
  explorationEvents: ExplorationLoopEvent[];
  exploring: boolean;
  onStartExploration: () => Promise<void>;
  onSubmitFeedback: (value: 'saved' | 'not_interested' | 'later' | 'talk_about_this' | 'opened_evidence') => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const lang = useLang();
  const currentFocus = journeys[0]?.title ?? discoveries[0]?.title ?? 'Collecting little ideas for later';
  const diaryHighlight = diary[0]?.content ?? t(lang, 'home_diary_default');

  return (
    <NotebookPage eyebrow={t(lang, 'home_eyebrow')} title={t(lang, 'home_title')} note={`${character?.name ?? 'Your Companion'} is keeping a soft page open for the things we are building together.`}>
      <div className="home-notebook-grid">
        <PaperCard className="companion-status-card" title={t(lang, 'home_companion_status_card')} tape>
          <div className="companion-status-content">
            <MiniCompanionSticker />
            <div>
              <p>{companionStatusMessage(state)}</p>
              <span className="soft-pill">{companionMoodLabel(state)}</span>
            </div>
          </div>
        </PaperCard>

        <StickyNote title={t(lang, 'home_companion_message_title')} className="companion-message-note">
          <p>{t(lang, 'home_companion_message_body')}</p>
          <button onClick={() => void onStartExploration()} disabled={exploring} className="primary-notebook-action">
            {exploring ? 'Exploring...' : 'Send companion exploring'}
          </button>
        </StickyNote>

        {exploration?.selectedInsight && (
          <PaperCard title={`${character?.name ?? 'Your Companion'} returned`} tape className="wide-card insight-return-card">
            <p className="focus-title">{exploration.selectedInsight.title}</p>
            <p>{exploration.selectedInsight.summary}</p>
            <div className="tag-row">
              <span>{exploration.selectedCuriosityTarget?.explorationType ?? 'insight'}</span>
              <span>{exploration.cycle.state}</span>
            </div>
            <div className="action-row">
              <button onClick={() => void onSubmitFeedback('saved')}>Save</button>
              <button onClick={() => void onSubmitFeedback('not_interested')}>Not interested</button>
              <button onClick={() => void onSubmitFeedback('later')}>Later</button>
              <button onClick={() => void onSubmitFeedback('talk_about_this')}>Talk about this</button>
            </div>
          </PaperCard>
        )}

        <PaperCard title={t(lang, 'home_current_focus')} tape>
          <p className="focus-title">{currentFocus}</p>
          <p>{journeys[0]?.description ?? t(lang, 'home_focus_default_desc')}</p>
          <ProgressBar value={journeys[0] ? 60 : 35} label={journeys[0] ? '60%' : '35%'} />
        </PaperCard>

        <PaperCard title={t(lang, 'home_at_glance')} tape>
          <div className="glance-list">
            <span>{t(lang, 'home_glance_discoveries')} <strong>{discoveries.length}</strong></span>
            <span>{t(lang, 'home_glance_journeys')} <strong>{journeys.length}</strong></span>
            <span>{t(lang, 'home_glance_memories')} <strong>{diary.length}</strong></span>
          </div>
        </PaperCard>

        {explorationEvents.length > 0 && (
          <PaperCard title="Exploration Loop" tape>
            <div className="exploration-event-list">
              {explorationEvents.slice(0, 5).map((event) => (
                <span key={event.id}>
                  <strong>{event.state}</strong>
                  {event.message}
                </span>
              ))}
            </div>
          </PaperCard>
        )}

        <PaperCard title={t(lang, 'home_mood')} tape>
          <div className="mood-row">
            <span className="doodle-face" aria-hidden="true">:)</span>
            <strong>{companionMoodLabel(state)}</strong>
          </div>
        </PaperCard>

        <PaperCard title={t(lang, 'home_memory_highlight')} tape className="wide-card">
          <p>{diaryHighlight}</p>
          <button onClick={() => window.ourCompanion.diary.generateDaily().then(onRefresh)}>{t(lang, 'home_write_note')}</button>
        </PaperCard>
      </div>
    </NotebookPage>
  );
}

function DiscoveryView({ discoveries, exploration, exploring, onStartExploration, onSubmitFeedback, onRefresh }: {
  discoveries: Discovery[];
  exploration?: ExplorationCycleResult;
  exploring: boolean;
  onStartExploration: () => Promise<void>;
  onSubmitFeedback: (value: 'saved' | 'not_interested' | 'later' | 'talk_about_this' | 'opened_evidence') => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const lang = useLang();

  async function refreshDiscovery() {
    await window.ourCompanion.discovery.refresh();
    await onRefresh();
  }

  async function addToJourney(discoveryId: string) {
    await window.ourCompanion.discovery.addToJourney({ discoveryId });
    await onRefresh();
  }

  const filters = [
    { key: 'all', label: t(lang, 'discovery_filter_all') },
    { key: 'ai', label: t(lang, 'discovery_filter_ai') },
    { key: 'design', label: t(lang, 'discovery_filter_design') },
    { key: 'life', label: t(lang, 'discovery_filter_life') },
    { key: 'other', label: t(lang, 'discovery_filter_other') },
  ];

  return (
    <NotebookPage eyebrow={t(lang, 'discovery_eyebrow')} title={t(lang, 'discovery_title')} note={t(lang, 'discovery_note')}>
      <div className="toolbar notebook-toolbar">
        <div className="soft-filter-row" aria-label="Discovery filters">
          {filters.map(({ key, label }) => (
            <button key={key} className={key === 'all' ? 'active' : ''}>{label}</button>
          ))}
        </div>
        <div className="action-row">
          <button onClick={() => void onStartExploration()} disabled={exploring}>
            {exploring ? 'Exploring...' : 'Send companion exploring'}
          </button>
          <button onClick={refreshDiscovery}>{t(lang, 'discovery_refresh')}</button>
        </div>
      </div>
      {exploration?.selectedInsight && (
        <section className="insight-archive-panel">
          <div>
            <p className="eyebrow">Returned insight</p>
            <h2>{exploration.selectedInsight.title}</h2>
            <p>{exploration.selectedInsight.summary}</p>
          </div>
          <div className="action-row">
            <button onClick={() => void onSubmitFeedback('opened_evidence')}>Explore evidence</button>
            <button onClick={() => void onSubmitFeedback('saved')}>Save</button>
            <button onClick={() => void onSubmitFeedback('not_interested')}>Not interested</button>
            <button onClick={() => void onSubmitFeedback('talk_about_this')}>Talk about this</button>
          </div>
          <div className="discovery-grid evidence-grid">
            {exploration.discoveryCandidates.slice(0, 4).map((candidate) => (
              <article className="discovery-card paper-photo-card" key={candidate.id}>
                <div className="card-topline">
                  <span>{candidate.sourceType}</span>
                  <strong>{candidate.agentType}</strong>
                </div>
                <h3>{candidate.title}</h3>
                <p>{candidate.summary}</p>
                {candidate.sourceUrl && (
                  <button onClick={() => window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: candidate.sourceUrl } })}>
                    {t(lang, 'discovery_view')}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="discovery-grid">
        {discoveries.map((discovery) => (
          <article className="discovery-card paper-photo-card" key={discovery.id}>
            <div className="photo-thumb" aria-hidden="true">
              <span>{discovery.source.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="card-topline">
              <span>{discovery.source}</span>
              <strong>{formatDiscoveryTime(discovery)}</strong>
            </div>
            <h3>{discovery.title}</h3>
            <p>{discovery.summary ?? discovery.shortMessage ?? t(lang, 'discovery_default_summary')}</p>
            <div className="tag-row">
              {discovery.tags.slice(0, 4).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="action-row">
              <button onClick={() => discovery.url && window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: discovery.url } })}>
                {t(lang, 'discovery_view')}
              </button>
              <button onClick={() => addToJourney(discovery.id)}>{t(lang, 'discovery_add')}</button>
              <button onClick={() => window.ourCompanion.discovery.markNotInterested(discovery.id).then(onRefresh)}>{t(lang, 'discovery_not_interested')}</button>
            </div>
          </article>
        ))}
        {discoveries.length === 0 && (
          <StickyNote title={t(lang, 'discovery_empty_title')}>
            <p>{t(lang, 'discovery_empty_body')}</p>
          </StickyNote>
        )}
      </div>
    </NotebookPage>
  );
}

function JourneyView({ journeys, timeline, onRefresh }: { journeys: CompanionJourney[]; timeline: JourneyMilestoneV2[]; onRefresh: () => Promise<void> }) {
  const lang = useLang();

  async function createNewJourney() {
    await window.ourCompanion.journey.create({ title: 'New exploration trail', description: 'A fresh path for saved discoveries.' });
    await onRefresh();
  }

  return (
    <NotebookPage eyebrow={t(lang, 'journey_eyebrow')} title={t(lang, 'journey_title')} note={t(lang, 'journey_note')}>
      <div className="toolbar notebook-toolbar">
        <div className="soft-filter-row" aria-label="Journey tabs">
          <button className="active">{t(lang, 'journey_filter_active')}</button>
          <button>{t(lang, 'journey_filter_completed')}</button>
        </div>
        <button onClick={createNewJourney}>{t(lang, 'journey_new')}</button>
      </div>
      <div className="journey-list">
        {journeys.map((journey, index) => (
          <PaperCard key={journey.id} className="journey-card" tape>
            <div className="journey-main">
              <span className="doodle-icon" aria-hidden="true">map</span>
              <div>
                <h3>{journey.title}</h3>
                <p>{journey.description ?? t(lang, 'journey_default_desc')}</p>
                <ProgressBar value={index === 0 ? 60 : 25} label={index === 0 ? '60%' : '25%'} />
              </div>
            </div>
            <StickyNote title={t(lang, 'journey_next_step')} compact>
              <p>{timeline[index]?.description ?? timeline[index]?.title ?? t(lang, 'journey_default_next_step')}</p>
            </StickyNote>
          </PaperCard>
        ))}
        {journeys.length === 0 && (
          <StickyNote title={t(lang, 'journey_empty_title')}>
            <p>{t(lang, 'journey_empty_body')}</p>
          </StickyNote>
        )}
      </div>
    </NotebookPage>
  );
}

function MemoryView({ graph, onRefresh }: { graph: KnowledgeGraph; onRefresh: () => Promise<void> }) {
  const lang = useLang();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<KnowledgeGraphNode | undefined>();

  async function saveMemory() {
    if (!draft.trim()) return;
    if (editing) {
      await window.ourCompanion.memory.updateNode({ id: editing.id, content: draft, summary: draft.slice(0, 120) });
    } else {
      await window.ourCompanion.memory.createNode({ type: 'topic', title: draft.slice(0, 42), summary: draft.slice(0, 120), content: draft });
    }
    setDraft('');
    setEditing(undefined);
    await onRefresh();
  }

  return (
    <NotebookPage eyebrow={t(lang, 'memory_eyebrow')} title={t(lang, 'memory_title')} note={t(lang, 'memory_note')}>
      <div className="memory-layout">
        <PaperCard title={t(lang, 'memory_add_card')} tape>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t(lang, 'memory_placeholder')} />
          <div className="action-row">
            <button onClick={saveMemory}>{editing ? t(lang, 'memory_update') : t(lang, 'memory_add')}</button>
            {editing && <button onClick={() => setEditing(undefined)}>{t(lang, 'memory_cancel')}</button>}
          </div>
        </PaperCard>
        <div className="memory-list">
          {graph.nodes.map((node) => (
            <article className="memory-card paper-card" key={node.id}>
              <h3>{node.title}</h3>
              <div className="tag-row">
                <span>{node.kind}</span>
              </div>
              <div className="action-row">
                <button onClick={() => { setEditing(node); setDraft(node.title); }}>
                  {t(lang, 'memory_edit')}
                </button>
              </div>
            </article>
          ))}
          {graph.nodes.length === 0 && (
            <StickyNote title={t(lang, 'memory_empty_title')}>
              <p>{t(lang, 'memory_empty_body')}</p>
            </StickyNote>
          )}
        </div>
      </div>
    </NotebookPage>
  );
}

function AskView({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const lang = useLang();
  const [input, setInput] = useState('Search web for PixiJS desktop pet tutorials');
  const [result, setResult] = useState<ToolExecutionResult | ToolPreview | { message: string } | ActionResult>();
  const [plan, setPlan] = useState<ActionPlanV2 | undefined>();
  const [permissionsNeeded, setPermissionsNeeded] = useState<PermissionScope[]>([]);
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  const parsedTool = useMemo(() => parseLocalCommand(input), [input]);

  async function submit() {
    setPermissionsNeeded([]);
    const actionPlan = await window.ourCompanion.action.plan(input);
    if (actionPlan) {
      setPlan(actionPlan);
      const output = await window.ourCompanion.action.executePlan(actionPlan);
      setResult(output);
      setPlan(undefined);
    } else if (parsedTool) {
      const output = await window.ourCompanion.tool.execute(parsedTool);
      setResult(output);
    } else {
      const output = await window.ourCompanion.ai.chat({ message: input });
      setResult(output);
    }
    await onRefresh();
  }

  async function confirmPermissions() {
    if (!plan) return;
    if (alwaysAllow) {
      const current = await window.ourCompanion.action.getPermissions();
      const updated = { ...current };
      for (const scope of permissionsNeeded) updated[scope] = 'granted';
      await window.ourCompanion.action.updatePermissions(updated);
    }
    setPermissionsNeeded([]);
    const output = await window.ourCompanion.action.executePlan(plan);
    setResult(output);
    setPlan(undefined);
    await onRefresh();
  }

  const prompts = [t(lang, 'ask_prompt_1'), t(lang, 'ask_prompt_2'), t(lang, 'ask_prompt_3')];

  return (
    <NotebookPage eyebrow={t(lang, 'ask_eyebrow')} title={t(lang, 'ask_title')} note={t(lang, 'ask_note')}>
      <section className="chat-paper">
        {result && (
          <NotebookChatBubble speaker="companion" time="Just now">
            {formatAskResult(result)}
          </NotebookChatBubble>
        )}
        {permissionsNeeded.length > 0 && (
          <div className="paper-card">
            <p className="eyebrow">Permission needed</p>
            <p>Companion needs access to: {permissionsNeeded.join(', ')}</p>
            <label className="checkbox-row">
              <input type="checkbox" checked={alwaysAllow} onChange={(e) => setAlwaysAllow(e.target.checked)} />
              <span>Always allow for this type of action</span>
            </label>
            <div className="action-row">
              <button onClick={confirmPermissions}>Allow</button>
              <button onClick={() => { setPermissionsNeeded([]); setPlan(undefined); }}>Deny</button>
            </div>
          </div>
        )}
        <div className="prompt-chip-row">
          {prompts.map((prompt) => (
            <button key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>
          ))}
        </div>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} />
        <div className="action-row">
          <button onClick={submit}>{t(lang, 'ask_send')}</button>
          {parsedTool && <button onClick={() => window.ourCompanion.tool.preview(parsedTool).then(setResult)}>{t(lang, 'ask_preview')}</button>}
        </div>
      </section>
    </NotebookPage>
  );
}

type ChatFilter = 'all' | CompanionMessageSource | 'errors';

function ChatView() {
  const lang = useLang();
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadHistory() {
    const all = await window.ourCompanion.companion.getHistory({ limit: 200 });
    setMessages(all);
  }

  useEffect(() => { void loadHistory(); }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const filtered = useMemo(() => {
    let list = messages;
    if (filter === 'errors') {
      list = list.filter((m) => m.status !== 'ok');
    } else if (filter !== 'all') {
      list = list.filter((m) => m.source === (filter as CompanionMessageSource));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.content.toLowerCase().includes(q));
    }
    return list;
  }, [messages, filter, search]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInput('');
    try {
      await window.ourCompanion.ai.chat({ message: trimmed });
      await loadHistory();
    } finally {
      setSending(false);
    }
  }

  async function clearHistory() {
    setClearing(true);
    try {
      await window.ourCompanion.companion.clearHistory();
      setMessages([]);
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  function bubbleSpeaker(msg: CompanionMessage): 'companion' | 'user' | 'system' {
    if (msg.role === 'assistant') return 'companion';
    if (msg.role === 'user') return 'user';
    return 'system';
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  const filters: { key: ChatFilter; label: string }[] = [
    { key: 'all', label: t(lang, 'chat_filter_all') },
    { key: 'voice', label: t(lang, 'chat_filter_voice') },
    { key: 'panel', label: t(lang, 'chat_filter_panel') },
    { key: 'errors', label: t(lang, 'chat_filter_errors') }
  ];

  function sourceBadge(msg: CompanionMessage): string | null {
    if (msg.status !== 'ok') return msg.status === 'empty_transcript' ? t(lang, 'badge_no_audio') : t(lang, 'badge_error');
    if (msg.source === 'voice') return t(lang, 'badge_voice');
    if (msg.source === 'panel') return t(lang, 'badge_panel');
    return null;
  }

  return (
    <NotebookPage eyebrow={t(lang, 'chat_eyebrow')} title={t(lang, 'chat_title')} note={t(lang, 'chat_note')}>
      <section className="chat-paper chat-view">
        <div className="chat-toolbar">
          <div className="chat-filter-chips">
            {filters.map(({ key, label }) => (
              <button key={key} className={`chip${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <input className="chat-search" placeholder={t(lang, 'chat_search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="chat-messages">
          {filtered.length === 0 && <p className="chat-empty">{t(lang, 'chat_empty')}</p>}
          {filtered.map((msg) => {
            const badge = sourceBadge(msg);
            return (
              <NotebookChatBubble
                key={msg.id}
                speaker={bubbleSpeaker(msg)}
                time={formatTime(msg.createdAt)}
                meta={badge ? <span className={`source-badge ${msg.status !== 'ok' ? 'error' : msg.source}`}>{badge}</span> : undefined}
              >
                {msg.source === 'voice' && msg.role === 'user' && <span className="voice-transcription-label">{t(lang, 'voice_transcribed')}</span>}
                {msg.content}
              </NotebookChatBubble>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="chat-composer">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={t(lang, 'chat_composer_placeholder')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} />
          <div className="action-row">
            <button onClick={() => void sendMessage()} disabled={sending || !input.trim()}>
              {sending ? t(lang, 'chat_sending') : t(lang, 'chat_send')}
            </button>
            {confirmClear ? (
              <>
                <span>{t(lang, 'chat_clear_confirm')}</span>
                <button onClick={() => void clearHistory()} disabled={clearing}>{t(lang, 'chat_clear_yes')}</button>
                <button onClick={() => setConfirmClear(false)}>{t(lang, 'chat_clear_cancel')}</button>
              </>
            ) : (
              <button className="btn-ghost" onClick={() => setConfirmClear(true)}>{t(lang, 'chat_clear')}</button>
            )}
          </div>
          <p className="chat-retention-note">{t(lang, 'chat_retention_note', { days: COMPANION_CHAT_RETENTION_DAYS })}</p>
        </div>
      </section>
    </NotebookPage>
  );
}

function SettingsView({ state, behaviorSettings, onRefresh, onLangChange, companionId, assetRoot }: {
  state?: CharacterRuntimeState;
  behaviorSettings?: CharacterBehaviorSettings;
  onRefresh: () => Promise<void>;
  onLangChange: (lang: Lang) => void;
  companionId?: string;
  assetRoot?: string;
}) {
  const lang = useLang();
  const [settings, setSettings] = useState<AiSettings>();
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [replyLang, setReplyLang] = useState<CompanionReplyLanguage>('en');
  const [uiLang, setUiLang] = useState<UiLang>('en');
  const [attentionMode, setAttentionMode] = useState<'available' | 'focused' | 'do_not_disturb'>('available');
  const [pendingActions, setPendingActions] = useState<PendingCompanionAction[]>([]);
  const [status, setStatus] = useState('Loading settings...');
  const [saving, setSaving] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(() => localStorage.getItem('companion:developer:enabled') === 'true');
  const [devAnimation, setDevAnimation] = useState<DevAnimation>('live');
  const previewState = devAnimation === 'live' ? state : createDevAnimationState(devAnimation);
  const animationOverride = devAnimation === 'live' ? undefined : devAnimation;

  async function loadSettings() {
    const next = await window.ourCompanion.ai.getSettings();
    setSettings(next);
    setModel(next.model);
    setEndpoint(next.endpoint);
    setReplyLang(next.replyLanguage ?? 'en');
    setUiLang(next.uiLang ?? 'en');
    setAttentionMode(await window.ourCompanion.companion.getAttentionMode());
    setPendingActions(await window.ourCompanion.companion.listPendingActions());
    setStatus(next.apiKeyConfigured ? 'API key saved.' : 'No API key saved.');
  }

  useEffect(() => { void loadSettings(); }, []);

  async function saveSettings(input: UpdateAiSettingsInput = {}) {
    setSaving(true);
    try {
      const next = await window.ourCompanion.ai.updateSettings({ model, endpoint, apiKey: apiKey.trim() || undefined, replyLanguage: replyLang, uiLang, ...input });
      setSettings(next);
      setModel(next.model);
      setEndpoint(next.endpoint);
      setApiKey('');
      localStorage.setItem('companion_uiLang', uiLang);
      onLangChange(uiLang as Lang);
      setStatus(next.apiKeyConfigured ? 'Saved. API key is configured.' : 'Saved. No API key configured.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <NotebookPage eyebrow={t(lang, 'settings_eyebrow')} title={t(lang, 'settings_title')} note={t(lang, 'settings_note')}>
      <div className="settings-layout">
        <PaperCard title={t(lang, 'settings_companion_behavior_title')} tape><p>{t(lang, 'settings_companion_behavior_desc')}</p></PaperCard>
        <PaperCard title={t(lang, 'settings_appearance_title')} tape><p>{t(lang, 'settings_appearance_desc')}</p></PaperCard>
        <PaperCard title={t(lang, 'settings_privacy_title')} tape><p>{t(lang, 'settings_privacy_desc')}</p></PaperCard>
        <VoiceSettingsCard />
        <OnlineModeCard />
        <SocialCard />
        <OnlineCompanionCard />
        <PaperCard title="Attention" tape>
          <label><span>Companion initiative</span><select value={attentionMode} onChange={(event) => {
            const mode = event.target.value as 'available' | 'focused' | 'do_not_disturb';
            setAttentionMode(mode);
            void window.ourCompanion.companion.setAttentionMode(mode);
          }}><option value="available">Available</option><option value="focused">Focus</option><option value="do_not_disturb">Do Not Disturb</option></select></label>
        </PaperCard>
        <PaperCard title="Queued discoveries" tape>
          {pendingActions.length === 0 ? <p>No discoveries are waiting.</p> : pendingActions.map((action) => <div key={action.id} className="action-row"><span>{action.deferReason ?? 'Deferred discovery'} — expires {new Date(action.expiresAt).toLocaleTimeString()}</span><button onClick={() => void window.ourCompanion.companion.cancelPendingAction(action.id).then(() => setPendingActions((items) => items.filter((item) => item.id !== action.id)))}>Cancel</button></div>)}
        </PaperCard>
        <ActionPermissionsCard />
        <PaperCard title={t(lang, 'settings_ai_title')} tape className="settings-panel">
          <h2>{t(lang, 'settings_ai_provider')}</h2>
          <label><span>{t(lang, 'settings_ai_model_label')}</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="deepseek-v4-flash" /></label>
          <label><span>{t(lang, 'settings_ai_endpoint_label')}</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.deepseek.com" /></label>
          <label><span>{t(lang, 'settings_ai_apikey_label')}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings?.apiKeyConfigured ? t(lang, 'settings_ai_apikey_placeholder_configured') : t(lang, 'settings_ai_apikey_placeholder_empty')} /></label>
          <label><span>{t(lang, 'settings_reply_lang_label')}</span><select value={replyLang} onChange={(e) => setReplyLang(e.target.value as CompanionReplyLanguage)}><option value="en">{t(lang, 'lang_en')}</option><option value="zh-CN">{t(lang, 'lang_zh_cn')}</option></select></label>
          <label><span>{t(lang, 'settings_ui_lang_label')}</span><select value={uiLang} onChange={(e) => setUiLang(e.target.value as UiLang)}><option value="en">{t(lang, 'lang_en')}</option><option value="zh-CN">{t(lang, 'lang_zh_cn')}</option></select></label>
          <div className="action-row">
            <button onClick={() => void saveSettings()} disabled={saving}>{saving ? t(lang, 'settings_saving') : t(lang, 'settings_save')}</button>
            <button onClick={() => void saveSettings({ clearApiKey: true })} disabled={saving}>{t(lang, 'settings_clear_apikey')}</button>
          </div>
          <p>{status}</p>
        </PaperCard>
        <PaperCard title={t(lang, 'settings_developer_title')} tape className="developer-card">
          <button onClick={() => setDeveloperOpen((open) => { const next = !open; localStorage.setItem('companion:developer:enabled', String(next)); return next; })}>
            {developerOpen ? t(lang, 'settings_developer_hide') : t(lang, 'settings_developer_show')}
          </button>
          {developerOpen && <DeveloperPreview state={previewState} devAnimation={devAnimation} animationOverride={animationOverride} onAnimationChange={setDevAnimation} settings={behaviorSettings} onRefresh={onRefresh} companionId={companionId} assetRoot={assetRoot} />}
        </PaperCard>
      </div>
    </NotebookPage>
  );
}

// ─── Debug / Developer Components ───────────────────────────────────────────

function VoiceSettingsCard() {
  const lang = useLang();
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>();
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>({ useGpu: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  async function refreshStatus() {
    setLoading(true);
    try {
      const [nextStatus, nextSettings] = await Promise.all([window.ourCompanion.speech.getStatus(), window.ourCompanion.speech.getSettings()]);
      setSpeechStatus(nextStatus);
      setSpeechSettings(nextSettings);
    } catch (error) {
      setSpeechStatus({ ready: false, model: 'ggml-small.bin', error: error instanceof Error ? error.message : 'Unable to read Whisper status.' });
    } finally {
      setLoading(false);
    }
  }

  async function saveSpeechSettings(input: UpdateSpeechSettingsInput) {
    setSaving(true);
    setSettingsMessage('');
    try {
      const next = await window.ourCompanion.speech.updateSettings(input);
      setSpeechSettings(next);
      setSettingsMessage(t(lang, 'voice_settings_saved'));
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : t(lang, 'voice_settings_save_failed'));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { void refreshStatus(); }, []);

  return (
    <PaperCard title={t(lang, 'voice_title')} tape className="settings-panel">
      <p>Talk to your companion on the desktop with double-click or Ctrl+Shift+Space.</p>
      <p><strong>Hotkey:</strong> Ctrl+Shift+Space</p>
      <p><strong>Whisper model:</strong> {speechStatus?.model ?? 'ggml-small.bin'}</p>
      <p><strong>Status:</strong> {loading ? t(lang, 'voice_download_checking') : speechStatus?.ready ? t(lang, 'voice_status_ready') : speechStatus?.error}</p>
      <label className="checkbox-row">
        <input type="checkbox" checked={speechSettings.useGpu} disabled={saving} onChange={(event) => void saveSpeechSettings({ useGpu: event.target.checked })} />
        <span>{t(lang, 'voice_use_gpu_label')}</span>
      </label>
      <p>{t(lang, 'voice_use_gpu_hint')}</p>
      <div className="action-row">
        <button onClick={() => void refreshStatus()} disabled={loading}>{loading ? t(lang, 'voice_download_checking') : t(lang, 'voice_refresh')}</button>
      </div>
      {settingsMessage && <p>{settingsMessage}</p>}
      {!loading && !speechStatus?.ready && <p>{t(lang, 'voice_download_hint')}</p>}
    </PaperCard>
  );
}

function OnlineCompanionCard() {
  const [companions, setCompanions] = useState<CompanionProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [includeVoices, setIncludeVoices] = useState(false);
  const [inspection, setInspection] = useState<{ totalFiles: number; totalBytes: number; manifestHash: string }>();
  const [networkCompanionId, setNetworkCompanionId] = useState<string>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [publishProgress, setPublishProgress] = useState<import('@our-companion/shared').AssetUploadProgress>();

  useEffect(() => { void Promise.all([window.ourCompanion.companionNew.list(), window.ourCompanion.network.companions.getMine().catch(() => undefined)]).then(([items, mine]) => { setCompanions(items); const first = items[0]; if (first) { setSelectedId(first.id); setName(first.name); } if (mine?.activeNetworkCompanionId) setNetworkCompanionId(mine.activeNetworkCompanionId); }); }, []);
  useEffect(() => {
    if (!busy) return;
    let active = true;
    const refresh = () => void window.ourCompanion.network.assets.getPublishStatus().then(progress => { if (active) setPublishProgress(progress); }).catch(() => undefined);
    refresh(); const timer = window.setInterval(refresh, 300);
    return () => { active = false; window.clearInterval(timer); };
  }, [busy]);
  const selected = companions.find((companion) => companion.id === selectedId);
  async function inspect() { if (!selectedId) return; setBusy(true); try { const result = await window.ourCompanion.network.assets.inspectLocalPack({ localCompanionId: selectedId, includeVoices }); setInspection(result); setStatus('Asset Pack is ready to publish.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to inspect Asset Pack.'); } finally { setBusy(false); } }
  async function publish() {
    if (!selectedId || !name.trim()) return; setPublishProgress(undefined); setBusy(true); setStatus('Preparing public profile…');
    try {
      const profile = await window.ourCompanion.network.companions.create({ localCompanionId: selectedId, name: name.trim(), publicDescription: description.trim() || undefined, publicTags: tags.split(',').map(tag => tag.trim()).filter(Boolean) });
      setNetworkCompanionId(profile.networkCompanionId);
      await window.ourCompanion.network.companions.activate(profile.networkCompanionId);
      setStatus('Uploading private Asset Pack…');
      await window.ourCompanion.network.assets.publishPack({ localCompanionId: selectedId, networkCompanionId: profile.networkCompanionId, includeVoices });
      await window.ourCompanion.network.companions.publish(profile.networkCompanionId);
      setStatus('Published for accepted friends only.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to publish Companion.'); } finally { setBusy(false); }
  }
  async function cancel() { await window.ourCompanion.network.assets.cancelPublish(); setStatus('Upload cancellation requested.'); }
  async function unpublish() { if (!networkCompanionId) return; setBusy(true); try { await window.ourCompanion.network.companions.unpublish(networkCompanionId); setStatus('Unpublished. Existing short-lived download URLs can remain valid until they expire.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to unpublish Companion.'); } finally { setBusy(false); } }
  return <PaperCard title="Online Companion" tape className="settings-panel">
    <p>Share only this approved profile and Asset Pack with accepted friends. Local Companion IDs, memories, personality and file paths stay on this device.</p>
    <label><span>Local Companion</span><select value={selectedId} disabled={busy} onChange={(event) => { const companion = companions.find(item => item.id === event.target.value); setSelectedId(event.target.value); if (companion) setName(companion.name); }}>{companions.map(companion => <option key={companion.id} value={companion.id}>{companion.name}</option>)}</select></label>
    <label><span>Public name</span><input value={name} maxLength={60} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
    <label><span>Public description</span><textarea value={description} maxLength={500} disabled={busy} onChange={(event) => setDescription(event.target.value)} /></label>
    <label><span>Tags (comma separated)</span><input value={tags} disabled={busy} onChange={(event) => setTags(event.target.value)} placeholder="friendly, curious" /></label>
    <p><strong>Visibility:</strong> Friends only</p>
    <label className="checkbox-row"><input type="checkbox" checked={includeVoices} disabled={busy} onChange={(event) => setIncludeVoices(event.target.checked)} /><span>Include voice assets</span></label>
    {includeVoices && <p>Voice files will be uploaded to private network storage and available to accepted friends.</p>}
    {inspection && <p>Ready: {inspection.totalFiles} files · {(inspection.totalBytes / 1024 / 1024).toFixed(2)} MB · <code>{inspection.manifestHash}</code></p>}
    {publishProgress && <p><strong>{publishProgress.state.replace(/_/g, ' ')}</strong> · {publishProgress.completedFiles}/{publishProgress.totalFiles} files · {publishProgress.totalBytes ? Math.round((publishProgress.uploadedBytes / publishProgress.totalBytes) * 100) : 0}%{publishProgress.currentFile ? ` · ${publishProgress.currentFile}` : ''}</p>}
    <div className="action-row"><button className="btn-secondary btn-sm" disabled={busy || !selected} onClick={() => void inspect()}>Build Asset Pack</button><button className="btn-primary btn-sm" disabled={busy || !selected || !name.trim()} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish'}</button><button className="btn-ghost btn-sm" disabled={!busy} onClick={() => void cancel()}>Cancel Upload</button><button className="btn-ghost btn-sm" disabled={busy || !networkCompanionId} onClick={() => void unpublish()}>Unpublish</button></div>
    {status && <p>{status}</p>}
  </PaperCard>;
}

function OnlineModeCard() {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>();
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [serverError, setServerError] = useState('');
  const [editingServer, setEditingServer] = useState(false);
  const [friendCodeCopied, setFriendCodeCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.ourCompanion.network.getStatus().then((status) => {
      if (!mounted) return;
      setNetworkStatus(status);
      setServerUrl(status.serverUrl);
      setLoading(false);
    }).catch(() => { if (mounted) setLoading(false); });
    const unsubscribe = window.ourCompanion.network.onStatusChanged((status) => {
      if (!mounted) return;
      setNetworkStatus(status);
      if (!editingServer) setServerUrl(status.serverUrl);
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  async function handleModeToggle() {
    if (!networkStatus) return;
    try {
      await (networkStatus.onlineModeEnabled
        ? window.ourCompanion.network.disableOnlineMode()
        : window.ourCompanion.network.enableOnlineMode());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to update mode');
    }
  }

  async function saveServerUrl() {
    if (!networkStatus) return;
    if (networkStatus.account && !window.confirm('Changing Network Server will sign you out from the current server. Continue?')) return;
    setSaving(true); setServerError('');
    try {
      const status = await window.ourCompanion.network.configureServer(serverUrl);
      setNetworkStatus(status);
      setServerUrl(status.serverUrl);
      setEditingServer(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Invalid Network Server URL.');
    } finally { setSaving(false); }
  }

  async function handleRegister() {
    if (!username.trim() || !password.trim() || !email.trim()) return;
    setSaving(true); setAuthError('');
    try {
      await window.ourCompanion.network.register({ username: username.trim(), email: email.trim(), password });
      setShowRegister(false); resetForm();
    } catch (err) { setAuthError(err instanceof Error ? err.message : 'Registration failed'); }
    finally { setSaving(false); }
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return;
    setSaving(true); setAuthError('');
    try {
      await window.ourCompanion.network.login({ email: email.trim(), password });
      setShowLogin(false); resetForm();
    } catch (err) { setAuthError(err instanceof Error ? err.message : 'Login failed'); }
    finally { setSaving(false); }
  }

  async function handleLogout() { await window.ourCompanion.network.logout(); }

  async function copyFriendCode() {
    const friendCode = networkStatus?.account?.friendCode;
    if (!friendCode) return;
    try {
      await navigator.clipboard.writeText(friendCode);
      setFriendCodeCopied(true);
      window.setTimeout(() => setFriendCodeCopied(false), 2_000);
    } catch {
      setAuthError('Unable to copy Friend Code. Select and copy it manually.');
    }
  }

  function resetForm() {
    setUsername(''); setDisplayName(''); setEmail(''); setPassword(''); setAuthError('');
  }

  const busy = saving || ['checking_server', 'connecting'].includes(networkStatus?.state ?? '');
  const label = networkStatus ? networkStatus.state.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Offline';

  if (loading) {
    return <PaperCard title="Online Mode" tape className="settings-panel"><p>Loading...</p></PaperCard>;
  }

  return (
    <PaperCard title="Online Mode" tape className="settings-panel">
      <div className="online-mode-header">
        <div className="online-mode-status">
          <span className={`online-mode-dot ${networkStatus?.state === 'online' ? 'online-mode-dot-active' : ''}`} />
          <span className="online-mode-label">{label}</span>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => void handleModeToggle()} disabled={busy}>
          {networkStatus?.onlineModeEnabled ? 'Go Offline' : 'Go Online'}
        </button>
      </div>
      <div className="online-auth-form">
        <label><span>Network Server</span><input value={serverUrl} disabled={busy || !editingServer} onChange={(event) => setServerUrl(event.target.value)} /></label>
        {!editingServer ? <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setEditingServer(true)}>Change Server</button> : <div className="action-row"><button className="btn-secondary btn-sm" disabled={saving} onClick={() => { setServerUrl(networkStatus?.serverUrl ?? ''); setEditingServer(false); }}>Cancel</button><button className="btn-primary btn-sm" disabled={saving} onClick={() => void saveServerUrl()}>Save Server</button></div>}
        <p>Changing the server signs you out. Production servers require HTTPS.</p>
        {serverError && <p className="creation-error">{serverError}</p>}
      </div>
      {networkStatus?.message && <p className="creation-error">{networkStatus.message}</p>}

      {networkStatus?.account ? (
        <div className="online-user-info online-account-card">
          <p className="online-account-identity"><strong>{networkStatus.account.username}</strong> (@{networkStatus.account.username}) <span className="online-friend-code-inline">Code: <code>{networkStatus.account.friendCode}</code></span></p>
          <p>{networkStatus.account.email}</p>
          <button className="btn-secondary btn-sm" onClick={() => void copyFriendCode()}>{friendCodeCopied ? 'Copied' : 'Copy Code'}</button>
          <button className="btn-ghost btn-sm online-logout-button" onClick={() => void handleLogout()}>Log out</button>
        </div>
      ) : showRegister ? (
        <div className="online-auth-form">
          <h3>Create Account</h3>
          <label><span>Username</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoFocus /></label>
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" /></label>
          {authError && <p className="creation-error">{authError}</p>}
          <div className="action-row"><button className="btn-secondary btn-sm" onClick={() => { setShowRegister(false); resetForm(); }}>Cancel</button><button className="btn-primary btn-sm" disabled={saving || !username.trim() || !password.trim() || !email.trim()} onClick={() => void handleRegister()}>{saving ? 'Creating...' : 'Create Account'}</button></div>
          <p className="online-auth-switch">Already have an account? <button className="btn-ghost btn-sm" onClick={() => { setShowRegister(false); setShowLogin(true); resetForm(); }}>Log in</button></p>
        </div>
      ) : showLogin ? (
        <div className="online-auth-form">
          <h3>Log In</h3>
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" autoFocus /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" /></label>
          {authError && <p className="creation-error">{authError}</p>}
          <div className="action-row"><button className="btn-secondary btn-sm" onClick={() => { setShowLogin(false); resetForm(); }}>Cancel</button><button className="btn-primary btn-sm" disabled={saving || !email.trim() || !password.trim()} onClick={() => void handleLogin()}>{saving ? 'Logging in...' : 'Log In'}</button></div>
          <p className="online-auth-switch">Don&apos;t have an account? <button className="btn-ghost btn-sm" onClick={() => { setShowLogin(false); setShowRegister(true); resetForm(); }}>Create one</button></p>
        </div>
      ) : (
        <div className="online-auth-buttons"><button className="btn-secondary btn-sm" onClick={() => setShowLogin(true)}>Log In</button><button className="btn-primary btn-sm" onClick={() => setShowRegister(true)}>Create Account</button></div>
      )}
    </PaperCard>
  );
}

function SocialCard() {
  const [status, setStatus] = useState<NetworkStatus>();
  const [friends, setFriends] = useState<Array<{ userId: string; username: string; friendCode: string; presence: string; hasPublishedCompanion: boolean }>>([]);
  const [incoming, setIncoming] = useState<Array<{ id: string; username: string }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ id: string; username: string }>>([]);
  const [blocked, setBlocked] = useState<Array<{ userId: string; username: string }>>([]);
  const [friendCode, setFriendCode] = useState('');
  const [lookup, setLookup] = useState<{ id: string; username: string; friendCode: string; relationship: string }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [friendCompanion, setFriendCompanion] = useState<{ id: string; ownerUserId: string; name: string; publicDescription?: string; publicTags: string[]; activeAssetPackId?: string }>();
  const [friendAssetStatus, setFriendAssetStatus] = useState('');
  const [visitIncoming, setVisitIncoming] = useState<VisitInvitationSummary[]>([]);
  const [visitOutgoing, setVisitOutgoing] = useState<VisitInvitationSummary[]>([]);
  const [visitSessions, setVisitSessions] = useState<VisitSessionSummary[]>([]);
  const scopeRef = useRef<string | undefined>(undefined);
  const lastRevisionRef = useRef<number | undefined>(undefined);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const available = status?.onlineModeEnabled && status.state === 'online' && Boolean(status.account);
  const scope = status?.account ? `${status.serverUrl}:${status.account.id}` : undefined;
  const clearSocialState = useCallback(() => {
    setFriends([]); setIncoming([]); setOutgoing([]); setBlocked([]); setVisitIncoming([]); setVisitOutgoing([]); setVisitSessions([]); setLookup(undefined); setFriendCompanion(undefined); setFriendAssetStatus(''); setError(''); setFriendCode('');
  }, []);
  const refresh = async () => {
    const scopeAtStart = scopeRef.current;
    if (!available || !scopeAtStart) return;
    setLoading(true);
    try {
      const [nextFriends, nextIncoming, nextOutgoing, nextBlocked, presence, nextVisitIncoming, nextVisitOutgoing, nextVisitSessions] = await Promise.all([
        window.ourCompanion.network.friends.getAll(), window.ourCompanion.network.friends.getIncomingRequests(), window.ourCompanion.network.friends.getOutgoingRequests(), window.ourCompanion.network.blocks.getAll(), window.ourCompanion.network.presence.getFriendPresence(), window.ourCompanion.network.visits.invitations.list({ direction: 'incoming' }), window.ourCompanion.network.visits.invitations.list({ direction: 'outgoing' }), window.ourCompanion.network.visits.sessions.list(),
      ]);
      if (scopeAtStart !== scopeRef.current) return;
      const presenceByUser = new Map(presence.map((item) => [item.userId, item.status]));
      setFriends(nextFriends.map((friend) => ({ ...friend, presence: presenceByUser.get(friend.userId) ?? 'offline' })));
      setIncoming(nextIncoming); setOutgoing(nextOutgoing); setBlocked(nextBlocked); setVisitIncoming(nextVisitIncoming); setVisitOutgoing(nextVisitOutgoing); setVisitSessions(nextVisitSessions); setError('');
    } catch (cause) { if (scopeAtStart === scopeRef.current) setError(messageForSocialError(cause)); }
    finally { if (scopeAtStart === scopeRef.current) setLoading(false); }
  };

  useEffect(() => {
    void window.ourCompanion.network.getStatus().then(setStatus);
    return window.ourCompanion.network.onStatusChanged((next) => setStatus(next));
  }, []);
  useEffect(() => {
    scopeRef.current = scope;
    if (!scope || !status?.onlineModeEnabled || ['disabled', 'authentication_required', 'authentication_failed', 'incompatible_client'].includes(status.state)) clearSocialState();
  }, [scope, status?.onlineModeEnabled, status?.state, clearSocialState]);
  useEffect(() => {
    if (!available) return;
    const revision = status?.socialRevision;
    if (revision && revision !== lastRevisionRef.current) {
      lastRevisionRef.current = revision;
      const invalidation = status?.socialInvalidation;
      if (invalidation?.type === 'presence') {
        setFriends((current) => current.map((friend) => friend.userId === invalidation.userId ? { ...friend, presence: invalidation.status } : friend));
        return;
      }
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => { void refresh(); }, 200);
      return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
    }
    void refresh();
  }, [available, scope, status?.socialRevision]);

  if (!available) return <PaperCard title="Social" tape className="settings-panel"><p>{socialAvailabilityMessage(status)}</p></PaperCard>;
  const action = async (operation: () => Promise<unknown>) => { if (busyAction) return; setBusyAction(true); try { await operation(); await window.ourCompanion.network.presence.sendActivity(); setLookup(undefined); await refresh(); } catch (cause) { setError(messageForSocialError(cause)); } finally { setBusyAction(false); } };
  const liveVisit = visitSessions.find((session) => ['preparing', 'ready', 'active', 'ending'].includes(session.state));
  const userId = status.account!.id;
  const friendsById = new Map(friends.map((friend) => [friend.userId, friend]));

  return <PaperCard title="Social" tape className="settings-panel">
    <div className="online-auth-form"><label><span>Add Friend by Code</span><input value={friendCode} onChange={(event) => setFriendCode(event.target.value.toUpperCase())} placeholder="ABC12345" /></label><button className="btn-secondary btn-sm" onClick={() => void action(async () => { const result = await window.ourCompanion.network.friends.lookup(friendCode.trim()); setLookup(result); })} disabled={!friendCode.trim() || busyAction}>Find</button></div>
    {lookup && <div className="online-user-info"><p><strong>{lookup.username}</strong> · {lookup.friendCode}</p>{lookup.relationship === 'none' && <button className="btn-primary btn-sm" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.sendRequest(lookup.id))}>Send Request</button>}<p>{lookup.relationship.replaceAll('_', ' ')}</p></div>}
    {error && <p className="creation-error">{error}</p>}
    {loading && <p>Loading Social data…</p>}
    <h3>Friends</h3>{friends.length ? friends.map((friend) => <div className="online-user-info" key={friend.userId}><strong>{friend.username}</strong><span> · {friend.friendCode} · {friend.presence}</span><div className="action-row"><button className="btn-ghost btn-sm" disabled={busyAction || !friend.hasPublishedCompanion} title={friend.hasPublishedCompanion ? undefined : 'This friend has not published a Companion yet.'} onClick={() => void action(async () => { setFriendCompanion(await window.ourCompanion.network.companions.getFriendCompanion(friend.userId)); setFriendAssetStatus(''); })}>{friend.hasPublishedCompanion ? 'View Companion' : 'No published Companion'}</button><button className="btn-secondary btn-sm" disabled={busyAction || Boolean(liveVisit) || visitOutgoing.some((invite) => invite.status === 'pending' && invite.hostUserId === friend.userId)} title={liveVisit ? 'Finish the current Visit first.' : undefined} onClick={() => void action(() => window.ourCompanion.network.visits.invitations.send(friend.userId))}>Send Visit Invitation</button><button className="btn-ghost btn-sm" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.remove(friend.userId))}>Remove</button><button className="btn-ghost btn-sm" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.blocks.block(friend.userId))}>Block</button></div></div>) : <p>No friends yet.</p>}
    {friendCompanion && <div className="online-user-info"><h3>{friendCompanion.name}</h3>{friendCompanion.publicDescription && <p>{friendCompanion.publicDescription}</p>}<p>{friendCompanion.publicTags.join(' · ')}</p>{friendCompanion.activeAssetPackId ? <button className="btn-secondary btn-sm" disabled={busyAction} onClick={() => void action(async () => { await window.ourCompanion.network.assets.downloadPack({ assetPackId: friendCompanion.activeAssetPackId!, networkCompanionId: friendCompanion.id }); setFriendAssetStatus('Asset Pack downloaded and integrity-verified.'); })}>Download Asset Pack</button> : <p>No active Asset Pack.</p>}{friendAssetStatus && <p>{friendAssetStatus}</p>}</div>}
    <h3>Visit Invitations</h3>
    {visitIncoming.filter((invite) => invite.status === 'pending').length ? visitIncoming.filter((invite) => invite.status === 'pending').map((invite) => <div className="online-user-info" key={invite.id}><strong>{friendsById.get(invite.visitorOwnerUserId)?.username ?? 'A friend'} would like to visit.</strong><p>{invite.companionName}</p>{invite.companionDescription && <p>{invite.companionDescription}</p>}<p>{invite.companionTags.join(' · ') || 'No public tags'} · Expires {new Date(invite.expiresAt).toLocaleString()}</p><div className="action-row"><button disabled={busyAction || Boolean(liveVisit)} onClick={() => void action(() => window.ourCompanion.network.visits.invitations.accept(invite.id))}>Accept</button><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.invitations.decline(invite.id))}>Decline</button></div></div>) : <p>No incoming Visit invitations.</p>}
    {visitOutgoing.filter((invite) => invite.status === 'pending').length ? <><h3>Outgoing Visit Invitations</h3>{visitOutgoing.filter((invite) => invite.status === 'pending').map((invite) => <div className="action-row" key={invite.id}><span>{friendsById.get(invite.hostUserId)?.username ?? 'Friend'} · {invite.companionName} · Pending</span><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.invitations.cancel(invite.id))}>Cancel</button></div>)}</> : null}
    <h3>Visit Session</h3>{liveVisit ? <div className="online-user-info"><strong>{visitSessionMessage(liveVisit, userId)}</strong><p>Snapshot pack: {liveVisit.assetPackId}</p><div className="action-row">{liveVisit.state === 'preparing' && <button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.prepare(liveVisit.id))}>Prepare</button>}{liveVisit.state === 'ready' && liveVisit.hostUserId === userId && <button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.start(liveVisit.id))}>Start Visit</button>}<button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.end(liveVisit.id))}>{liveVisit.state === 'preparing' || liveVisit.state === 'ready' ? 'Cancel Visit' : 'End Visit'}</button></div></div> : <p>No current Visit Session.</p>}
    <h3>Incoming Requests</h3>{incoming.length ? incoming.map((request) => <div className="action-row" key={request.id}><span>{request.username}</span><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.acceptRequest(request.id))}>Accept</button><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.rejectRequest(request.id))}>Reject</button></div>) : <p>No incoming requests.</p>}
    <h3>Outgoing Requests</h3>{outgoing.length ? outgoing.map((request) => <div className="action-row" key={request.id}><span>{request.username} · Pending</span><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.cancelRequest(request.id))}>Cancel</button></div>) : <p>No outgoing requests.</p>}
    <h3>Blocked Users</h3>{blocked.length ? blocked.map((user) => <div className="action-row" key={user.userId}><span>{user.username}</span><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.blocks.unblock(user.userId))}>Unblock</button></div>) : <p>No blocked users.</p>}
  </PaperCard>;
}

function socialAvailabilityMessage(status?: NetworkStatus): string {
  if (!status?.onlineModeEnabled || status.state === 'disabled') return 'Online Mode is disabled.';
  if (status.state === 'authentication_required' || status.state === 'authentication_failed') return 'Authentication is required to use Social.';
  if (status.state === 'reconnecting' || status.state === 'connecting' || status.state === 'checking_server') return 'Network is reconnecting.';
  if (status.state === 'server_unavailable') return 'Network Server is unavailable.';
  if (status.state === 'incompatible_client') return 'This client needs an update before Social can connect.';
  return 'Loading Social connection…';
}

function visitSessionMessage(session: VisitSessionSummary, userId: string): string {
  if (session.state === 'preparing') {
    const mineReady = session.visitorOwnerUserId === userId ? session.visitorOwnerReady : session.hostReady;
    return mineReady ? 'Waiting for the other participant to prepare.' : 'Preparing Visit assets and consent.';
  }
  if (session.state === 'ready') return session.hostUserId === userId ? 'Ready to start the Visit.' : 'Visit is ready; waiting for the host to start.';
  if (session.state === 'active') return 'Visit active. S4 does not render a remote Companion.';
  return `Visit ${session.state}.`;
}

function messageForSocialError(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : 'SOCIAL_ACTION_NOT_ALLOWED';
  return ({ INVALID_FRIEND_CODE: 'No account was found with that Friend Code.', FRIEND_REQUEST_ALREADY_EXISTS: 'A request is already pending.', FRIENDSHIP_ALREADY_EXISTS: 'This user is already your friend.', CANNOT_FRIEND_SELF: 'You cannot add your own account.', SOCIAL_ACTION_NOT_ALLOWED: 'This action is not available.', COMPANION_NOT_AVAILABLE: 'This Companion is not available.', ASSET_STORAGE_UNAVAILABLE: 'Private asset storage is currently unavailable.', RATE_LIMITED: 'Too many attempts. Try again later.' } as Record<string, string>)[code] ?? 'Unable to synchronize Social.';
}

const ALL_PERMISSION_SCOPES: PermissionScope[] = ['browser', 'automation', 'files', 'clipboard', 'calendar'];

function ActionPermissionsCard() {
  const [permissions, setPermissions] = useState<ActionPermissionState | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => { void window.ourCompanion.action.getPermissions().then(setPermissions); }, []);

  async function update(scope: PermissionScope, value: 'granted' | 'ask' | 'denied') {
    if (!permissions) return;
    setSaving(true);
    try {
      const next = { ...permissions, [scope]: value };
      const saved = await window.ourCompanion.action.updatePermissions(next);
      setPermissions(saved);
    } finally {
      setSaving(false);
    }
  }

  if (!permissions) return null;

  return (
    <PaperCard title="Action Permissions" tape className="settings-panel">
      <p>Control what your companion is allowed to do when you ask it to perform desktop actions.</p>
      {ALL_PERMISSION_SCOPES.map((scope) => (
        <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ flex: 1, textTransform: 'capitalize' }}>{scope}</span>
          <select value={permissions[scope]} disabled={saving} onChange={(e) => void update(scope, e.target.value as 'granted' | 'ask' | 'denied')}>
            <option value="ask">Ask each time</option>
            <option value="granted">Always allow</option>
            <option value="denied">Always deny</option>
          </select>
        </label>
      ))}
    </PaperCard>
  );
}

function BehaviorPanel({ settings, onRefresh }: { settings?: CharacterBehaviorSettings; onRefresh: () => Promise<void> }) {
  const [draftMovement, setDraftMovement] = useState(settings?.effectiveMovement ?? 25);
  const range = getWalkDelayRange(settings?.effectiveMovement ?? draftMovement);

  useEffect(() => { if (settings) setDraftMovement(settings.effectiveMovement); }, [settings?.effectiveMovement]);

  async function saveMovement(value: number) {
    setDraftMovement(value);
    await window.ourCompanion.character.updateBehaviorSettings({ movementOverride: value });
    await onRefresh();
  }

  async function resetMovement() {
    await window.ourCompanion.character.updateBehaviorSettings({ resetMovement: true });
    await onRefresh();
  }

  return (
    <div className="paper-card behavior-panel">
      <p className="eyebrow">Behavior</p>
      <h2>Movement</h2>
      <label>
        <span>Movement score: {settings?.effectiveMovement ?? draftMovement}</span>
        <input type="range" min="0" max="100" value={draftMovement} onChange={(event) => setDraftMovement(Number(event.target.value))} onMouseUp={() => saveMovement(draftMovement)} onKeyUp={(event) => { if (event.key === 'Enter') saveMovement(draftMovement); }} />
      </label>
      <p>{settings?.source === 'override' ? 'Using your override.' : 'Using companion personality default.'} Current walk rest is about {Math.round(range.minMs / 1000)}-{Math.round(range.maxMs / 1000)} seconds.</p>
      <div className="action-row">
        <button onClick={() => saveMovement(draftMovement)}>Save movement</button>
        <button onClick={resetMovement}>Reset to default</button>
      </div>
    </div>
  );
}

function DeveloperPreview({ state, devAnimation, animationOverride, onAnimationChange, settings, onRefresh, companionId, assetRoot }: {
  state?: CharacterRuntimeState;
  devAnimation: DevAnimation;
  animationOverride?: AnimationName;
  onAnimationChange: (animation: DevAnimation) => void;
  settings?: CharacterBehaviorSettings;
  onRefresh: () => Promise<void>;
  companionId?: string;
  assetRoot?: string;
}) {
  return (
    <div className="developer-tools">
      <div className="developer-preview-canvas">
        {assetRoot && companionId ? <CompanionCanvas state={state} compact animationOverride={animationOverride} companionId={companionId} assetRoot={assetRoot} /> : <p>No Companion assets available.</p>}
      </div>
      <div className="dev-animation-panel">
        <p className="eyebrow">Developer use</p>
        <h2>Animation review</h2>
        <div className="segmented-control" aria-label="Preview companion animation">
          {devAnimations.map((animation) => (
            <button key={animation} className={devAnimation === animation ? 'active' : ''} onClick={() => onAnimationChange(animation)}>
              {animation === 'live' ? 'Live' : readable(animation)}
            </button>
          ))}
        </div>
        <p>Previewing: {devAnimation === 'live' ? 'engine state' : readable(devAnimation)}</p>
      </div>
      <BehaviorPanel settings={settings} onRefresh={onRefresh} />
      <EngineObservatory />
      <DebugAudioTestPanel />
      <DebugAiLog />
      <DebugDataResetPanel onRefresh={onRefresh} />
    </div>
  );
}

function DebugAiLog() {
  const [log, setLog] = useState<AiDebugEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLog(await window.ourCompanion.ai.getDebugLog()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="debug-ai-log">
      <div className="debug-ai-log-header">
        <span className="debug-ai-log-title">AI Request / Response Log</span>
        <span className="debug-ai-log-count">{log.length} calls</span>
        <button className="debug-ai-log-refresh" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {log.length === 0 ? (
        <p className="debug-ai-log-empty">No AI calls recorded yet.</p>
      ) : (
        <div className="debug-ai-log-list">
          {log.map((entry) => (
            <div key={entry.id} className="debug-ai-log-entry">
              <button className="debug-ai-log-summary" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)} aria-expanded={expanded === entry.id}>
                <span className={`debug-channel-badge debug-channel-${entry.channel}`}>{entry.channel}</span>
                <span className={`debug-status-badge debug-status-${entry.status}`}>{entry.status}</span>
                <span className="debug-source-badge">{entry.source}</span>
                <span className="debug-ai-log-time">{new Date(entry.createdAt).toLocaleTimeString()}</span>
                <span className="debug-ai-log-preview">{debugPreview(entry)}</span>
                <span className="debug-ai-log-chevron">{expanded === entry.id ? '▲' : '▼'}</span>
              </button>
              {expanded === entry.id && (
                <div className="debug-ai-log-detail">
                  <DebugJsonBlock title="Request body" value={entry.requestBody ?? { messages: entry.requestMessages }} />
                  <DebugTextBlock title="Response content" value={entry.content || '(empty)'} />
                  {entry.rawResponse !== undefined && <DebugJsonBlock title="Raw response" value={entry.rawResponse} />}
                  {entry.error && <DebugTextBlock title="Error" value={entry.error} tone="error" />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const debugResetOptions: Array<{ target: DebugDataResetTarget; label: string; detail: string }> = [
  { target: 'discoveries', label: 'Clear discoveries', detail: 'Discovery feed and announced discovery markers.' },
  { target: 'memory', label: 'Clear memory', detail: 'Memory nodes and memory edges.' },
  { target: 'journeys', label: 'Clear journeys', detail: 'Journeys and journey milestones.' },
  { target: 'diary', label: 'Clear diary', detail: 'Diary entries only.' },
  { target: 'chat', label: 'Clear chat', detail: 'Companion conversation messages.' },
  { target: 'autonomy', label: 'Clear autonomy', detail: 'Exploration cycles, events, insights, candidates, patterns, and interest graph.' },
  { target: 'all_debug_data', label: 'Clear all debug data', detail: 'All groups above. Character, settings, and API key stay untouched.' }
];

function DebugDataResetPanel({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [pendingTarget, setPendingTarget] = useState<DebugDataResetTarget | null>(null);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState('No reset run yet.');

  async function resetTarget(target: DebugDataResetTarget) {
    setResetting(true);
    setStatus('Clearing data...');
    try {
      const result = await window.ourCompanion.debug.resetData({ targets: [target] });
      await onRefresh();
      setStatus(`Cleared ${result.clearedTables.length} table groups at ${new Date(result.completedAt).toLocaleTimeString()}.`);
      setPendingTarget(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to clear data.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="debug-reset-panel">
      <div className="debug-reset-header">
        <span className="debug-ai-log-title">Database Reset Tools</span>
        <span className="debug-reset-status">{status}</span>
      </div>
      <div className="debug-reset-grid">
        {debugResetOptions.map((option) => (
          <div key={option.target} className="debug-reset-item">
            <div><strong>{option.label}</strong><span>{option.detail}</span></div>
            {pendingTarget === option.target ? (
              <div className="debug-reset-confirm">
                <button className={option.target === 'all_debug_data' ? 'debug-reset-danger' : ''} onClick={() => void resetTarget(option.target)} disabled={resetting}>Confirm</button>
                <button onClick={() => setPendingTarget(null)} disabled={resetting}>Cancel</button>
              </div>
            ) : (
              <button className={option.target === 'all_debug_data' ? 'debug-reset-danger' : ''} onClick={() => setPendingTarget(option.target)} disabled={resetting}>Clear</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DebugAudioTestPanel() {
  const [recording, setRecording] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('Ready.');
  const [result, setResult] = useState<{ text?: string; language?: string; size?: number; durationMs?: number; mimeType?: string; error?: string }>({});
  const audio = useAudioCapture({ silenceDurationMs: 120000, onError: (message) => { setStatus(message); setResult({ error: message }); setRecording(false); setTesting(false); } });

  async function startTest() {
    setResult({});
    setStatus('Requesting microphone...');
    const started = await audio.startRecording();
    setRecording(started);
    setStatus(started ? 'Recording test audio...' : 'Microphone was not started.');
  }

  async function stopAndTranscribe() {
    setTesting(true);
    setStatus('Stopping recording...');
    try {
      const captured = await audio.stopRecording();
      setRecording(false);
      if (!captured || captured.blob.size === 0) { setResult({ error: 'No audio was captured.' }); setStatus('No audio was captured.'); return; }
      if (captured.durationMs < 500) { setResult({ error: 'Recording was too short to transcribe.', size: captured.blob.size, durationMs: captured.durationMs, mimeType: captured.mimeType }); setStatus('Recording too short.'); return; }
      setStatus('Transcribing test audio...');
      const buffer = await captured.blob.arrayBuffer();
      const transcribed = await window.ourCompanion.speech.transcribe({ audio: buffer, mimeType: captured.mimeType });
      setResult({ text: transcribed.text, language: transcribed.language, size: captured.blob.size, durationMs: captured.durationMs, mimeType: captured.mimeType });
      setStatus('Transcription complete.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to transcribe test audio.';
      setResult({ error: message });
      setStatus('Transcription failed.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="debug-audio-panel">
      <div className="debug-reset-header">
        <span className="debug-ai-log-title">Audio Transcription Test</span>
        <span className="debug-reset-status">{status}</span>
      </div>
      <div className="debug-audio-actions">
        <button onClick={() => void startTest()} disabled={recording || testing}>Start recording</button>
        <button onClick={() => void stopAndTranscribe()} disabled={!recording || testing}>{testing ? 'Testing...' : 'Stop & transcribe'}</button>
      </div>
      {(result.text || result.error || result.size) && (
        <div className="debug-audio-result">
          {result.size !== undefined && <span>{result.mimeType ?? 'audio'} · {Math.round(result.size / 1024)} KB · {formatDuration(result.durationMs)} · language {result.language ?? 'auto'}</span>}
          {result.text && <pre>{result.text}</pre>}
          {result.error && <pre className="debug-audio-error">{result.error}</pre>}
        </div>
      )}
    </div>
  );
}
