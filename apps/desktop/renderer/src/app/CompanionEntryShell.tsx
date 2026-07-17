import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActionPermissionState,
  ActionPlan,
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
  JourneyTimelineEntry,
  KnowledgeGraph,
  KnowledgeGraphNode,
  NetworkStatus,
  VisitInvitationSummary,
  VisitSessionSummary,
  PermissionScope,
  PerformanceScript,
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
import { SpeechBubbleOverlay } from '../companion/SpeechBubbleOverlay';
import { DiscoveryPopoutCard } from '../companion/DiscoveryPopoutCard';
import { useCompanionSession } from '../companion/useCompanionSession';
import { useSpeech } from '../companion/useSpeech';
import { useDiscoveryPresentation } from '../companion/useDiscoveryPresentation';
import type { PresentationCandidate } from '../companion/PresentationCandidate';
import { CompanionCanvas, type AnimationName, type CompanionDragPoint } from '../ui/CompanionCanvas';
import { LangContext, useLang, NotebookPage, PaperCard, StickyNote, NotebookChatBubble } from '../ui/NotebookPrimitives';
import { EngineObservatory } from '../features/developer/EngineObservatory';
import { EngineObservatoryToolbar, loadObservatoryState, type EnginePanelKey } from '../features/developer/EngineObservatoryToolbar';
import { EngineSnapshotCard } from '../features/developer/EngineSnapshotCard';
import { useAudioCapture } from '../companion/useAudioCapture';
import {
  type Tab, type DevAnimation, formatJson, formatDuration,
  formatDiscoveryTime, formatRelativeDate, formatShortDate, formatAskResult,
  readable, capitalize, randomBetween, clamp, easeInOut,
  companionStatusMessage, companionMoodLabel, debugPreview,
  createDevAnimationState, parseLocalCommand
} from '../ui/utils';
import { DebugJsonBlock, DebugTextBlock } from '../ui/DebugComponents';
import { useFloatingPlacement } from '../companion/useFloatingPlacement';
import { CompanionQuickActions } from '../companion/CompanionQuickActions';
import { useQuickActionVisibility } from '../features/companion/quick-actions/useQuickActionVisibility';
import { MemoriesPage } from '../pages/MemoriesPage';
import { HomePage } from '../pages/HomePage';
import { DiscoveriesPage } from '../pages/DiscoveriesPage';
import { JourneysPage } from '../pages/JourneysPage';
import { ChatPage } from '../pages/ChatPage';
import { SocialPage } from '../pages/SocialPage';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { ResponsiveNavigation } from '../layouts/ResponsiveNavigation';
import { DragHandle } from '../companion/DragHandle';
import { useCompanionBehavior } from '../companion/behavior/useCompanionBehavior';
import type { CommandExecutionHandle } from '../companion/behavior/commandLifecycle';
import { createDiscoveryCommandPresentationHandle } from '../companion/behavior/discoveryCommandPresentation';
import { useInteractiveRegion } from '../companion/useInteractiveRegion';
import type { CompanionProfile } from '@our-companion/shared';
import { CompanionCreationPage } from '../companion/creation/CompanionCreationPage';
import { CompanionEditPage } from '../companion/creation/CompanionEditPage';
import { CompanionSelectionPage } from '../companion/selection/CompanionSelectionPage';
import { getCreationCompletionAction, switchToSelectedCompanion } from '../companion/creation/creationCompletionFlow';
import { isCompanionAnimationName, resolveWalkDirection } from '../character/animationSelection';
import { startPerformancePlayback, type ActivePerformancePlayback } from '../character/performancePlayback';
import { RemoteVisitorLayer, useVisualVisitState } from '../visits/RemoteVisitorLayer';
import { Presence } from '../components/motion/Presence';

export function PresenceActivityReporter() {
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

export function CompanionEntryShell() {
  const [activeCompanion, setActiveCompanion] = useState<CompanionProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    void initCompanion();
  }, []);

  useEffect(() => {
    void window.ourCompanion.ai.getSettings().then((settings) => {
      if (settings.uiLang === 'zh-CN') setLang('zh-CN');
    }).catch(() => undefined);
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
    return <LangContext.Provider value={lang}><CompanionShell companion={activeCompanion} onSwitchCompanion={() => {
      void window.ourCompanion.window.openPanelForSwitch();
    }} /></LangContext.Provider>;
  }

  return <LangContext.Provider value={lang}><div className="companion-onboarding-required">{t(lang, 'companion_onboarding_required')}</div></LangContext.Provider>;
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
  const visualVisit = useVisualVisitState();
  const localCompanionAway = visualVisit.ownerPresenceMode === 'away_visiting';
  const [ownerVisualPhase, setOwnerVisualPhase] = useState<'home' | 'leaving' | 'hidden' | 'entering'>('home');
  const localCompanionVisible = !localCompanionAway || ownerVisualPhase !== 'hidden';

  useEffect(() => {
    if (localCompanionAway) {
      setOwnerVisualPhase((current) => current === 'hidden' || current === 'leaving' ? current : 'leaving');
      return;
    }
    setOwnerVisualPhase((current) => current === 'home' || current === 'entering' ? current : 'entering');
  }, [localCompanionAway]);

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
  const [dragHandleVisible, setDragHandleVisible] = useState(false);
  const quickActions = useQuickActionVisibility();
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
    if (!quickActions.visible) {
      interactive.leave('quick-actions');
    }
  }, [quickActions.visible, interactive]);

  useEffect(() => {
    if (localCompanionAway) quickActions.close();
  }, [localCompanionAway, quickActions]);

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

  const quickActionsAnchor = useMemo(() => ({
    x: companionPosition.x,
    y: companionPosition.y,
    width: COMPANION_SPRITE.width,
    height: COMPANION_SPRITE.height,
  }), [companionPosition.x, companionPosition.y]);

  function applyState(next: CharacterRuntimeState) {
    stateRef.current = next;
    setState(next);
  }

  const [textInput, setTextInput] = useState('');
  const [textOpen, setTextOpen] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  const { phase, toggleListening, runTurn, onTypewriterComplete, isSessionActive } = useCompanionSession({
    characterId: companion.id,
    lang,
    stateRef,
    applyState,
    onInstantSpeech: speech.showInstant,
    onTypewriterSpeech: speech.showTypewriter,
    pauseAmbient: (paused) => {
      sessionActiveRef.current = paused;
    }
  });
  const [softHintVisible, setSoftHintVisible] = useState(false);
  const [softHintDiscoveryId, setSoftHintDiscoveryId] = useState<string>();
  const softHintPresentationCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => softHintPresentationCancelRef.current?.(), []);
  const behaviorCommandActionsRef = useRef<{ recordSpeech: () => void; recordDiscoveryPresented: () => void }>({
    recordSpeech: () => undefined,
    recordDiscoveryPresented: () => undefined,
  });
  const commandCompletionRef = useRef<{ commandId: string; complete: () => void } | null>(null);
  const commandPresentationRef = useRef({ discovery, softHintVisible, speech, companionName: companion.name });
  commandPresentationRef.current = { discovery, softHintVisible, speech, companionName: companion.name };

  const handleCompanionCommand = useCallback((command: import('@our-companion/shared').CompanionCommand): CommandExecutionHandle => {
    const presentation = commandPresentationRef.current;
    return createDiscoveryCommandPresentationHandle({
      command,
      popup: presentation.discovery.popup,
      softHintVisible: presentation.softHintVisible,
      companionName: presentation.companionName,
      waitForCandidate: presentation.discovery.waitForCandidate,
      presentWhenAvailable: presentation.discovery.presentWhenAvailable,
      setSoftHintVisible,
      setSoftHintDiscoveryId,
      showInstant: presentation.speech.showInstant,
      showTypewriter: presentation.speech.showTypewriter,
      recordSpeech: behaviorCommandActionsRef.current.recordSpeech,
      recordDiscoveryPresented: behaviorCommandActionsRef.current.recordDiscoveryPresented,
      scheduleFrame: (callback) => { window.requestAnimationFrame(callback); },
      registerCommandCompletion: (commandId, complete) => {
        commandCompletionRef.current = { commandId, complete };
      },
      clearCommandCompletion: (commandId) => {
        if (commandCompletionRef.current?.commandId === commandId) commandCompletionRef.current = null;
      },
    });
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
    quickActions.close();
    interactive.leave('chat-input');
    interactive.leave('companion-hover');
    interactive.leave('quick-actions');
  }, [interactive, quickActions.close]);

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
      speech.showInstant(t(langRef.current, 'companion_hover_hint'));
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
    const unsubscribePerformance = window.ourCompanion.action.onPerformance((script: PerformanceScript) => {
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
    if (name === 'Leave' && localCompanionAway) {
      setOwnerVisualPhase('hidden');
      return;
    }
    if (name === 'Enter' && !localCompanionAway && ownerVisualPhase === 'entering') {
      setOwnerVisualPhase('home');
    }
    if (name === 'Leave' && exitRequestedRef.current) {
      exitRequestedRef.current = false;
      void window.ourCompanion.app.quit();
      return;
    }
    if (name === performanceAnimation) setPerformanceAnimation(undefined);
  }, [performanceAnimation, localCompanionAway, ownerVisualPhase]);

  function handleCompanionHoverEnter() {
    if (localCompanionAway || isDraggingRef.current) return;
    quickActions.enterGroup();
    setDragHandleVisible(true);
    interactive.enter('companion-hover');
  }

  function handleCompanionHoverLeave() {
    quickActions.leaveGroup();
    interactive.leave('companion-hover');
  }

  function handleActionsHoverEnter() {
    quickActions.enterGroup();
    interactive.enter('quick-actions');
  }

  function handleActionsHoverLeave() {
    quickActions.leaveGroup();
    interactive.leave('quick-actions');
  }

  function handleDragStart(point: CompanionDragPoint) {
    isDraggingRef.current = true;
    setMovementAnimation(undefined);
    dragOriginRef.current = undefined;
    quickActions.close();
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
    <LangContext.Provider value={lang}><main
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
      <RemoteVisitorLayer visitor={visualVisit.visitor} />
      {localCompanionVisible && <>
      <div
        data-testid="local-companion-runtime"
        data-presence-mode={visualVisit.ownerPresenceMode}
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
          animationOverride={ownerVisualPhase === 'leaving' ? 'Leave' : ownerVisualPhase === 'entering' ? 'Enter' : performanceAnimation}
          onPointerHitChange={handlePointerHitChange}
          onActivate={() => {
            if (localCompanionAway || isDraggingRef.current) return;
            quickActions.togglePinned();
            setDragHandleVisible(true);
          }}
          onOpenPanel={() => undefined}
          onToggleListen={toggleListening}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onAnimationComplete={handleAnimationComplete}
        />
      </div>
      <SpeechBubbleOverlay
        typewriterMessage={speech.typewriterMessage}
        typewriterGeneration={speech.typewriterGeneration}
        speech={speech.speech}
        onTypewriterComplete={handleTypewriterComplete}
        onMouseEnter={() => interactive.enter('speech-bubble')}
        onMouseLeave={() => interactive.leave('speech-bubble')}
        style={floatingPositions.bubble ? { position: 'absolute', left: floatingPositions.bubble.rect.x, top: floatingPositions.bubble.rect.y, width: floatingPositions.bubble.rect.width, transform: 'none' } : undefined}
      />
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
      <Presence present={softHintVisible && !discovery.popup && discovery.hasCandidate(softHintDiscoveryId)} exitDurationMs={150}>{(motionState) => (
        <div
          className="companion-soft-hint"
          data-motion-state={motionState}
          style={floatingPositions.card ? {
            position: 'absolute',
            left: floatingPositions.card.rect.x,
            top: floatingPositions.card.rect.y,
            width: floatingPositions.card.rect.width,
            right: 'auto',
          } : undefined}
        >
          <p>{t(lang, 'companion_discovery_hint', { name: companion.name })}</p>
          <div className="soft-hint-actions">
            <button className="companion-quick-btn" onClick={() => {
              softHintPresentationCancelRef.current?.();
              softHintPresentationCancelRef.current = discovery.presentWhenAvailable(softHintDiscoveryId, (next) => {
                setSoftHintVisible(false);
                setSoftHintDiscoveryId(undefined);
                behavior.setDiscoveryPresentationState('presented');
                const completedImmediately = speech.showTypewriter(next.shareMessage);
                behavior.recordDiscoveryPresented();
                if (completedImmediately) onTypewriterComplete();
              });
            }}>{t(lang, 'companion_show_me')}</button>
            <button className="companion-quick-btn soft-hint-dismiss" onClick={() => {
              softHintPresentationCancelRef.current?.();
              softHintPresentationCancelRef.current = null;
              setSoftHintVisible(false);
              setSoftHintDiscoveryId(undefined);
              behavior.recordDismiss();
            }}>{t(lang, 'companion_not_now')}</button>
          </div>
        </div>
      )}</Presence>
      <CompanionQuickActions
        visible={quickActions.visible && !isDraggingRef.current && !localCompanionAway}
        anchorRect={quickActionsAnchor}
        screenWorkArea={{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }}
        listening={phase === 'listening'}
        talkOpen={textOpen}
        extraInteractiveRects={floatingPositions.textInput ? [floatingPositions.textInput.rect] : []}
        onTextChat={() => {
          quickActions.pin();
          openTextInput();
        }}
        onVoiceChat={() => {
          quickActions.close();
          toggleListening();
        }}
        onOpenPanel={() => {
          quickActions.close();
          void window.ourCompanion.window.openPanel({ companionX: companionPositionRef.current.x, companionY: companionPositionRef.current.y });
        }}
        onSwitchCompanion={() => {
          quickActions.close();
          onSwitchCompanion();
        }}
        onOpenSettings={() => { void window.ourCompanion.window.openPanel({ companionX: companionPositionRef.current.x, companionY: companionPositionRef.current.y, initialTab: 'settings' }); }}
        onExit={() => { void window.ourCompanion.app.exitWithAnimation(); }}
        onClose={() => { quickActions.close(); setDragHandleVisible(false); }}
        onMouseEnter={handleActionsHoverEnter}
        onMouseLeave={handleActionsHoverLeave}
        onInteractiveLayoutChange={interactive.setLayout}
      />
      <Presence present={phase === 'idle' && textOpen} exitDurationMs={150}>{(motionState) => (
        <form
          className="companion-text-input"
          data-motion-state={motionState}
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
          onSubmit={(e) => { if (motionState !== 'exiting') void handleTextSubmit(e); }}
        >
          <input
            ref={textInputRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={t(lang, 'companion_text_placeholder', { name: companion.name })}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeTextInput();
            }}
          />
        </form>
      )}</Presence>
      </>}
    </main></LangContext.Provider>
  );
}
