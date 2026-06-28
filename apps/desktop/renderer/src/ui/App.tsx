import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActionPermissionState,
  ActionPlan,
  ActionRunResult,
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
  ExplorationCycleResult,
  ExplorationLoopEvent,
  Journey,
  JourneyMilestone,
  MemoryGraph,
  MemoryNode,
  PermissionScope,
  PerformanceScript,
  SpeechSettings,
  SpeechStatus,
  ToolExecutionResult,
  ToolPreview,
  UiLang,
  UpdateAiSettingsInput,
  UpdateSpeechSettingsInput
} from '@our-companion/shared';
import { COMPANION_CHAT_RETENTION_DAYS } from '@our-companion/shared';
import { t, type Lang } from '../i18n';
import { getSpeechDuration, getWalkDelay, getWalkDelayRange, selectSpeechLine } from '../character/ann/companionBehavior';
import { getIdleRotationDelay, isIdleState, selectWeightedIdleAnimation } from '../character/ann/idleBehavior';
import { TypewriterSpeechBubble } from '../companion/TypewriterSpeechBubble';
import { DiscoveryPopoutCard } from '../companion/DiscoveryPopoutCard';
import { useCompanionSession } from '../companion/useCompanionSession';
import { DiscoveryQueueManager } from '../companion/DiscoveryQueueManager';
import type { PresentationCandidate } from '../companion/PresentationCandidate';
import { CompanionCanvas, type AnimationName, type CompanionDragPoint } from './CompanionCanvas';
import { LangContext, useLang, NotebookPage, PaperCard, StickyNote, MiniAnnSticker, ProgressBar, NotebookChatBubble } from './NotebookPrimitives';
import { EngineObservatory } from '../features/developer/EngineObservatory';
import { useAudioCapture } from '../companion/useAudioCapture';
import {
  type Tab, type DevAnimation, devAnimations, formatJson, formatDuration,
  formatDiscoveryTime, formatRelativeDate, formatShortDate, formatAskResult,
  readable, capitalize, randomBetween, clamp, easeInOut,
  annStatusMessage, annMoodLabel, tabLabel, debugPreview,
  createDevAnimationState, parseLocalCommand
} from './utils';
import { DebugJsonBlock, DebugTextBlock } from './DebugComponents';
import { useFloatingPlacement } from '../companion/useFloatingPlacement';

export function App() {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'companion') return <CompanionShell />;
  return <PanelShell />;
}

function CompanionShell() {
  const [state, setState] = useState<CharacterRuntimeState>();
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [idleAnimation, setIdleAnimation] = useState<AnimationName>('idle_laptop');
  const [speech, setSpeech] = useState<string>();
  const [typewriterMessage, setTypewriterMessage] = useState<string>();
  const [discoveryPopup, setDiscoveryPopup] = useState<PresentationCandidate | null>(null);
  const queueManagerRef = useRef(new DiscoveryQueueManager());

  const floatingPositions = useFloatingPlacement({
    hasBubble: !!(typewriterMessage || speech),
    hasCard: !!discoveryPopup,
  });

  useEffect(() => {
    window.__discoveryQueue = queueManagerRef.current;
    return () => { delete window.__discoveryQueue; };
  }, []);
  const [lang, setLang] = useState<Lang>('en');
  const behaviorRef = useRef<CharacterBehaviorSettings | undefined>(undefined);
  const stateRef = useRef<CharacterRuntimeState | undefined>(undefined);
  const langRef = useRef<Lang>('en');
  const mousePassthroughRef = useRef<boolean | undefined>(undefined);
  const speechTimeoutRef = useRef<number | undefined>(undefined);
  const isDraggingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const dragOriginRef = useRef<{ windowX: number; windowY: number; screenX: number; screenY: number } | undefined>(undefined);

  function applyState(next: CharacterRuntimeState) {
    stateRef.current = next;
    setState(next);
  }

  function showInstantSpeech(message: string) {
    setTypewriterMessage(undefined);
    setSpeech(message);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
    }
    speechTimeoutRef.current = window.setTimeout(() => setSpeech(undefined), getSpeechDuration(message));
  }

  function showTypewriterSpeech(message: string) {
    setSpeech(undefined);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = undefined;
    }
    setTypewriterMessage(message);
  }

  const [textInput, setTextInput] = useState('');
  const [textOpen, setTextOpen] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  const { phase, toggleListening, runTurn, onTypewriterComplete, isSessionActive } = useCompanionSession({
    stateRef,
    applyState,
    onInstantSpeech: showInstantSpeech,
    onTypewriterSpeech: showTypewriterSpeech,
    pauseAmbient: (paused) => {
      sessionActiveRef.current = paused;
    }
  });

  const handleTypewriterComplete = useCallback(() => {
    setTypewriterMessage(undefined);
    onTypewriterComplete();
  }, [onTypewriterComplete]);

  const openTextInput = useCallback(() => {
    setTextOpen(true);
    void setMousePassthrough(false);
  }, []);

  const closeTextInput = useCallback(() => {
    setTextOpen(false);
    setTextInput('');
  }, []);

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
    if (!textOpen) {
      void setMousePassthrough(true);
    }
  }, [textOpen]);

  useEffect(() => {
    document.documentElement.classList.add('companion-mode');
    return () => document.documentElement.classList.remove('companion-mode');
  }, []);

  useEffect(() => {
    if (localStorage.getItem('ann_onboarded')) return;
    const timer = window.setTimeout(() => {
      showInstantSpeech("Hi! Single-click to open my notebook. Double-click to talk to me.");
      localStorage.setItem('ann_onboarded', '1');
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    void setMousePassthrough(true);
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
    const stored = localStorage.getItem('ann_uiLang');
    if (stored) applyLang(stored);
    void window.ourCompanion.ai.getSettings().then((settings) => {
      if (settings.uiLang) applyLang(settings.uiLang);
    }).catch(() => undefined);
    function onStorage(e: StorageEvent) {
      if (e.key === 'ann_uiLang' && e.newValue) applyLang(e.newValue);
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
      queueManagerRef.current.enqueue(pc);
      const current = queueManagerRef.current.presentNext();
      if (current) {
        showTypewriterSpeech(current.candidate.shareMessage);
        setDiscoveryPopup(current.candidate);
      }
    });
    const unsubscribePerformance = window.ourCompanion.action.onPerformance((script: PerformanceScript) => {
      let delay = 0;
      for (const step of script.steps) {
        const animKey = step.animationKey as AnimationName;
        window.setTimeout(() => {
          setIdleAnimation(animKey);
        }, delay);
        delay += step.durationMs;
      }
    });
    return () => {
      unsubscribeState();
      unsubscribeAnnounce();
      unsubscribePerformance();
    };
  }, []);

  async function setMousePassthrough(passthrough: boolean) {
    if (mousePassthroughRef.current === passthrough) return;
    mousePassthroughRef.current = passthrough;
    try {
      await window.ourCompanion.window.setMousePassthrough({ passthrough });
    } catch {
      mousePassthroughRef.current = undefined;
    }
  }

  function handlePointerHitChange(isHit: boolean) {
    void setMousePassthrough(!isHit);
  }

  function handleDragStart(point: CompanionDragPoint) {
    isDraggingRef.current = true;
    dragOriginRef.current = undefined;
    void window.ourCompanion.companion.reportDragging({ dragging: true });
    void setMousePassthrough(false);
    window.ourCompanion.window
      .getBounds()
      .then((bounds) => {
        if (!isDraggingRef.current) return;
        dragOriginRef.current = {
          windowX: bounds.x,
          windowY: bounds.y,
          screenX: point.screenX,
          screenY: point.screenY
        };
      })
      .catch(() => undefined);
  }

  function handleDragMove(point: CompanionDragPoint) {
    const origin = dragOriginRef.current;
    if (!origin) return;
    void window.ourCompanion.window.moveTo({
      x: origin.windowX + point.screenX - origin.screenX,
      y: origin.windowY + point.screenY - origin.screenY
    });
  }

  function handleDragEnd() {
    isDraggingRef.current = false;
    dragOriginRef.current = undefined;
    void window.ourCompanion.companion.reportDragging({ dragging: false });
    window.ourCompanion.window
      .getBounds()
      .then((bounds) => window.ourCompanion.character.updatePosition({ x: bounds.x, y: bounds.y }))
      .then((nextState) => {
        stateRef.current = nextState;
        setState(nextState);
      })
      .catch(() => undefined);
  }

  function showSpeech(message: string) {
    showTypewriterSpeech(message);
  }

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

    function previewState(coreState: CharacterRuntimeState['coreState'], intent: CharacterRuntimeState['intent']) {
      const base = stateRef.current;
      if (!base) return;
      applyStateFromEffect({
        ...base,
        coreState,
        intent,
        updatedAt: new Date().toISOString()
      });
    }

    function isAmbientPaused() {
      return sessionActiveRef.current || stateRef.current?.intent === 'sharing_discovery';
    }

    async function walkRandomly() {
      try {
        if (cancelled || isDraggingRef.current || isAmbientPaused()) return;

        const [bounds, workArea] = await Promise.all([window.ourCompanion.window.getBounds(), window.ourCompanion.window.getWorkArea()]);
        if (cancelled || isDraggingRef.current) return;

        const minX = workArea.x + 12;
        const maxX = workArea.x + workArea.width - bounds.width - 12;
        if (maxX <= minX) return;

        let targetX = randomBetween(minX, maxX);
        if (Math.abs(targetX - bounds.x) < 80) {
          targetX = bounds.x < (minX + maxX) / 2 ? maxX : minX;
        }

        const direction = targetX < bounds.x ? 'left' : 'right';
        setFacing(direction);
        showSpeech(selectSpeechLine('walk_start', Math.random, langRef.current));
        previewState('walking', 'wandering');

        const startX = bounds.x;
        const startY = clamp(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height);
        const distance = Math.abs(targetX - startX);
        const durationMs = clamp((distance / 115) * 1000, 900, 5200);
        const startedAt = performance.now();
        let lastMoveAt = 0;

        await new Promise<void>((resolve) => {
          const step = (now: number) => {
            if (cancelled || isDraggingRef.current) {
              resolve();
              return;
            }

            const progress = Math.min(1, (now - startedAt) / durationMs);
            const nextX = startX + (targetX - startX) * easeInOut(progress);

            if (now - lastMoveAt > 28 || progress === 1) {
              lastMoveAt = now;
              window.ourCompanion.window.moveTo({ x: nextX, y: startY }).catch(() => undefined);
            }

            if (progress < 1) {
              animationFrame = window.requestAnimationFrame(step);
            } else {
              animationFrame = undefined;
              resolve();
            }
          };

          animationFrame = window.requestAnimationFrame(step);
        });
      } catch (error) {
        console.warn('[our-companion] Companion walk failed; scheduling next walk.', error);
      } finally {
        if (!isDraggingRef.current) {
          previewState('idle', 'waiting');
          if (!cancelled) showSpeech(selectSpeechLine('walk_end', Math.random, langRef.current));
        }
      }
    }

    async function refreshBehaviorSettings() {
      try {
        behaviorRef.current = await window.ourCompanion.character.getBehaviorSettings();
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
          showInstantSpeech(selectSpeechLine('ambient', Math.random, langRef.current));
        }
        scheduleAmbientSpeech();
      }, randomBetween(30000, 65000));
    }

    Promise.all([window.ourCompanion.character.getState(), window.ourCompanion.character.getBehaviorSettings()]).then(([next, behavior]) => {
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
      if (speechTimeoutRef.current !== undefined) window.clearTimeout(speechTimeoutRef.current);
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <main className="companion-shell">
      <CompanionCanvas
        state={state}
        facing={facing}
        isListening={phase === 'listening'}
        animationOverride={isIdleState(state) && !isSessionActive && state?.intent !== 'sharing_discovery' ? idleAnimation : undefined}
        onPointerHitChange={handlePointerHitChange}
        onOpenPanel={() => {
          if (phase === 'idle' && !textOpen) {
            openTextInput();
          } else {
            closeTextInput();
            void window.ourCompanion.window.openPanel();
          }
        }}
        onToggleListen={toggleListening}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
      {typewriterMessage && (
        <TypewriterSpeechBubble
          message={typewriterMessage}
          onComplete={handleTypewriterComplete}
          style={floatingPositions.bubble ? {
            position: 'absolute',
            left: floatingPositions.bubble.rect.x,
            top: floatingPositions.bubble.rect.y,
            width: floatingPositions.bubble.rect.width,
            transform: 'none',
          } : undefined}
        />
      )}
      {!typewriterMessage && speech && (
        <div
          className="speech-bubble"
          style={floatingPositions.bubble ? {
            left: floatingPositions.bubble.rect.x,
            top: floatingPositions.bubble.rect.y,
            width: floatingPositions.bubble.rect.width,
            transform: 'none',
          } : undefined}
        >
          {speech}
        </div>
      )}
      {discoveryPopup && (
        <DiscoveryPopoutCard
          candidate={discoveryPopup}
          style={floatingPositions.card ? {
            position: 'absolute',
            left: floatingPositions.card.rect.x,
            top: floatingPositions.card.rect.y,
            width: floatingPositions.card.rect.width,
            right: 'auto',
          } : undefined}
          onClose={() => {
            queueManagerRef.current.dismissCurrent();
            setDiscoveryPopup(null);
            const next = queueManagerRef.current.presentNext();
            if (next) {
              showTypewriterSpeech(next.candidate.shareMessage);
              setDiscoveryPopup(next.candidate);
            }
          }}
        />
      )}
      {phase === 'idle' && textOpen && (
        <form className="companion-text-input" onSubmit={(e) => { void handleTextSubmit(e); }}>
          <input
            ref={textInputRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type to Ann…"
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

function PanelShell() {
  const [tab, setTab] = useState<Tab>('home');
  const [lang, setLang] = useState<Lang>('en');
  const [state, setState] = useState<CharacterRuntimeState>();
  const [behaviorSettings, setBehaviorSettings] = useState<CharacterBehaviorSettings>();
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [timeline, setTimeline] = useState<JourneyMilestone[]>([]);
  const [memoryGraph, setMemoryGraph] = useState<MemoryGraph>({ nodes: [], edges: [] });
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [exploration, setExploration] = useState<ExplorationCycleResult>();
  const [explorationEvents, setExplorationEvents] = useState<ExplorationLoopEvent[]>([]);
  const [exploring, setExploring] = useState(false);

  async function refreshAll() {
    const [nextState, nextBehavior, nextCharacters, feed, activeJourneys, milestones, graph, entries] = await Promise.all([
      window.ourCompanion.character.getState(),
      window.ourCompanion.character.getBehaviorSettings(),
      window.ourCompanion.character.getActive(),
      window.ourCompanion.discovery.getFeed({ limit: 12 }),
      window.ourCompanion.journey.getActive(),
      window.ourCompanion.journey.getTimeline(),
      window.ourCompanion.memory.getGraph(),
      window.ourCompanion.diary.getEntries({ limit: 6 })
    ]);
    setState(nextState);
    setBehaviorSettings(nextBehavior);
    setCharacters(nextCharacters);
    setDiscoveries(feed);
    setJourneys(activeJourneys);
    setTimeline(milestones);
    setMemoryGraph(graph);
    setDiary(entries);
  }

  useEffect(() => {
    void refreshAll();
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

  async function sendAnnExploring() {
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

  return (
    <LangContext.Provider value={lang}>
      <main className="panel-shell">
        <aside className="sidebar">
          <div className="brand-mark">
            <span>{t(lang, 'brand_name')}</span>
            <small>{t(lang, 'brand_subtitle')}</small>
          </div>
          <nav>
            {(['home', 'discovery', 'journey', 'memory', 'chat', 'ask', 'settings'] as Tab[]).map((item) => (
              <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
                {tabLabel(item, lang)}
              </button>
            ))}
          </nav>
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
              onStartExploration={sendAnnExploring}
              onSubmitFeedback={submitExplorationFeedback}
              onRefresh={refreshAll}
            />
          )}
          {tab === 'discovery' && (
            <DiscoveryView
              discoveries={discoveries}
              exploration={exploration}
              exploring={exploring}
              onStartExploration={sendAnnExploring}
              onSubmitFeedback={submitExplorationFeedback}
              onRefresh={refreshAll}
            />
          )}
          {tab === 'journey' && <JourneyView journeys={journeys} timeline={timeline} onRefresh={refreshAll} />}
          {tab === 'memory' && <MemoryView graph={memoryGraph} onRefresh={refreshAll} />}
          {tab === 'chat' && <ChatView />}
          {tab === 'ask' && <AskView onRefresh={refreshAll} />}
          {tab === 'settings' && <SettingsView state={state} behaviorSettings={behaviorSettings} onRefresh={refreshAll} onLangChange={setLang} />}
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
  journeys: Journey[];
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
    <NotebookPage eyebrow={t(lang, 'home_eyebrow')} title={t(lang, 'home_title')} note={`${character?.name ?? 'Ann'} is keeping a soft page open for the things we are building together.`}>
      <div className="home-notebook-grid">
        <PaperCard className="ann-status-card" title={t(lang, 'home_ann_status_card')} tape>
          <div className="ann-status-content">
            <MiniAnnSticker />
            <div>
              <p>{annStatusMessage(state)}</p>
              <span className="soft-pill">{annMoodLabel(state)}</span>
            </div>
          </div>
        </PaperCard>

        <StickyNote title={t(lang, 'home_ann_message_title')} className="ann-message-note">
          <p>{t(lang, 'home_ann_message_body')}</p>
          <button onClick={() => void onStartExploration()} disabled={exploring} className="primary-notebook-action">
            {exploring ? 'Ann is exploring...' : 'Send Ann exploring'}
          </button>
        </StickyNote>

        {exploration?.selectedInsight && (
          <PaperCard title="Ann returned" tape className="wide-card insight-return-card">
            <p className="focus-title">{exploration.selectedInsight.title}</p>
            <p>{exploration.selectedInsight.narration ?? exploration.selectedInsight.summary}</p>
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
            <strong>{annMoodLabel(state)}</strong>
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
            {exploring ? 'Exploring...' : 'Send Ann exploring'}
          </button>
          <button onClick={refreshDiscovery}>{t(lang, 'discovery_refresh')}</button>
        </div>
      </div>
      {exploration?.selectedInsight && (
        <section className="insight-archive-panel">
          <div>
            <p className="eyebrow">Returned insight</p>
            <h2>{exploration.selectedInsight.title}</h2>
            <p>{exploration.selectedInsight.narration ?? exploration.selectedInsight.summary}</p>
            <p>{exploration.selectedInsight.suggestedQuestion}</p>
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

function JourneyView({ journeys, timeline, onRefresh }: { journeys: Journey[]; timeline: JourneyMilestone[]; onRefresh: () => Promise<void> }) {
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
              <p>{timeline[index]?.summary ?? timeline[index]?.title ?? t(lang, 'journey_default_next_step')}</p>
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

function MemoryView({ graph, onRefresh }: { graph: MemoryGraph; onRefresh: () => Promise<void> }) {
  const lang = useLang();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<MemoryNode | undefined>();

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
              <p>{node.summary ?? node.content}</p>
              <div className="tag-row">
                <span>{node.type}</span>
                {node.isPinned && <span>{t(lang, 'memory_favorite')}</span>}
              </div>
              <div className="action-row">
                <button onClick={() => { setEditing(node); setDraft(node.content ?? node.summary ?? node.title); }}>
                  {t(lang, 'memory_edit')}
                </button>
                <button onClick={() => window.ourCompanion.memory.updateNode({ id: node.id, isMarkedWrong: true }).then(onRefresh)}>
                  {t(lang, 'memory_mark_wrong')}
                </button>
                <button onClick={() => window.ourCompanion.memory.deleteNode(node.id).then(onRefresh)}>{t(lang, 'memory_delete')}</button>
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
  const [result, setResult] = useState<ToolExecutionResult | ToolPreview | { message: string } | ActionRunResult>();
  const [plan, setPlan] = useState<ActionPlan | undefined>();
  const [permissionsNeeded, setPermissionsNeeded] = useState<PermissionScope[]>([]);
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  const parsedTool = useMemo(() => parseLocalCommand(input), [input]);

  async function submit() {
    setPermissionsNeeded([]);
    const actionPlan = await window.ourCompanion.action.plan(input);
    if (actionPlan) {
      setPlan(actionPlan);
      const output = await window.ourCompanion.action.executePlan(actionPlan);
      if (output.status === 'await_permission') {
        setPermissionsNeeded(output.requiredScopes);
      } else {
        setResult(output);
        setPlan(undefined);
      }
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
          <NotebookChatBubble speaker="ann" time="Just now">
            {formatAskResult(result)}
          </NotebookChatBubble>
        )}
        {permissionsNeeded.length > 0 && (
          <div className="paper-card">
            <p className="eyebrow">Permission needed</p>
            <p>Ann needs access to: {permissionsNeeded.join(', ')}</p>
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

  function bubbleSpeaker(msg: CompanionMessage): 'ann' | 'user' | 'system' {
    if (msg.role === 'assistant') return 'ann';
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

function SettingsView({ state, behaviorSettings, onRefresh, onLangChange }: {
  state?: CharacterRuntimeState;
  behaviorSettings?: CharacterBehaviorSettings;
  onRefresh: () => Promise<void>;
  onLangChange: (lang: Lang) => void;
}) {
  const lang = useLang();
  const [settings, setSettings] = useState<AiSettings>();
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [replyLang, setReplyLang] = useState<CompanionReplyLanguage>('en');
  const [uiLang, setUiLang] = useState<UiLang>('en');
  const [status, setStatus] = useState('Loading settings...');
  const [saving, setSaving] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
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
      localStorage.setItem('ann_uiLang', uiLang);
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
        <PaperCard title={t(lang, 'settings_ann_behavior_title')} tape><p>{t(lang, 'settings_ann_behavior_desc')}</p></PaperCard>
        <PaperCard title={t(lang, 'settings_appearance_title')} tape><p>{t(lang, 'settings_appearance_desc')}</p></PaperCard>
        <PaperCard title={t(lang, 'settings_privacy_title')} tape><p>{t(lang, 'settings_privacy_desc')}</p></PaperCard>
        <VoiceSettingsCard />
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
          <button onClick={() => setDeveloperOpen((open) => !open)}>
            {developerOpen ? t(lang, 'settings_developer_hide') : t(lang, 'settings_developer_show')}
          </button>
          {developerOpen && <DeveloperPreview state={previewState} devAnimation={devAnimation} animationOverride={animationOverride} onAnimationChange={setDevAnimation} settings={behaviorSettings} onRefresh={onRefresh} />}
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
      <p>Talk to Ann on the desktop companion with double-click or Ctrl+Shift+Space.</p>
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
      <p>Control what Ann is allowed to do when you ask her to perform desktop actions.</p>
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
      <p>{settings?.source === 'override' ? 'Using your override.' : 'Using Ann personality default.'} Current walk rest is about {Math.round(range.minMs / 1000)}-{Math.round(range.maxMs / 1000)} seconds.</p>
      <div className="action-row">
        <button onClick={() => saveMovement(draftMovement)}>Save movement</button>
        <button onClick={resetMovement}>Reset to Ann</button>
      </div>
    </div>
  );
}

function DeveloperPreview({ state, devAnimation, animationOverride, onAnimationChange, settings, onRefresh }: {
  state?: CharacterRuntimeState;
  devAnimation: DevAnimation;
  animationOverride?: AnimationName;
  onAnimationChange: (animation: DevAnimation) => void;
  settings?: CharacterBehaviorSettings;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="developer-tools">
      <div className="developer-preview-canvas">
        <CompanionCanvas state={state} compact animationOverride={animationOverride} />
      </div>
      <div className="dev-animation-panel">
        <p className="eyebrow">Developer use</p>
        <h2>Animation review</h2>
        <div className="segmented-control" aria-label="Preview Ann animation">
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


