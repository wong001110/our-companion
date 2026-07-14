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
import { CompanionCanvas, type AnimationName, type CompanionDragPoint } from '../ui/CompanionCanvas';
import { LangContext, useLang, NotebookPage, PaperCard, StickyNote, NotebookChatBubble } from '../ui/NotebookPrimitives';
import { EngineObservatory } from '../features/developer/EngineObservatory';
import { EngineObservatoryToolbar, loadObservatoryState, type EnginePanelKey } from '../features/developer/EngineObservatoryToolbar';
import { EngineSnapshotCard } from '../features/developer/EngineSnapshotCard';
import { useAudioCapture } from '../companion/useAudioCapture';
import {
  type Tab, type DevAnimation, devAnimations, formatJson, formatDuration,
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
import { SettingsPage } from '../pages/SettingsPage';
import { SocialPage } from '../pages/SocialPage';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { ResponsiveNavigation } from '../layouts/ResponsiveNavigation';
import { CompanionEntryShell, PresenceActivityReporter } from '../app/CompanionEntryShell';
import { CreationShell } from '../app/CreationShell';
import { DragHandle } from '../companion/DragHandle';
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
import { RemoteVisitorLayer, useVisualVisitState } from '../visits/RemoteVisitorLayer';

export function PanelShell() {
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
  const [loadError, setLoadError] = useState(false);

  async function refreshAll() {
    const results = await Promise.allSettled([
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
    const [nextState, nextBehavior, nextCharacters, feed, activeJourneys, milestones, graph, entries, companion] = results;
    if (nextState.status === 'fulfilled') setState(nextState.value);
    if (nextBehavior.status === 'fulfilled') setBehaviorSettings(nextBehavior.value);
    if (nextCharacters.status === 'fulfilled') setCharacters(nextCharacters.value);
    if (feed.status === 'fulfilled') setDiscoveries(feed.value);
    if (activeJourneys.status === 'fulfilled') setJourneys(activeJourneys.value);
    if (milestones.status === 'fulfilled') setTimeline(milestones.value);
    if (graph.status === 'fulfilled') setMemoryGraph(graph.value);
    if (entries.status === 'fulfilled') setDiary(entries.value);
    if (companion.status === 'fulfilled') setPrimaryCompanion(companion.value);
    setLoadError(results.some((result) => result.status === 'rejected'));
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
        {onboardingRequired === null ? <p>{t(lang, 'onboarding_checking')}</p> : (
          <>
            <h1>{t(lang, 'onboarding_none_title')}</h1>
            <p>{t(lang, 'onboarding_none_body')}</p>
            <button onClick={() => void window.ourCompanion.creation.openWindow()}>{t(lang, 'onboarding_create')}</button>
          </>
        )}
      </main>
    );
  }

  return (
    <LangContext.Provider value={lang}>
      <main className="panel-shell">
        <ResponsiveNavigation tab={tab} lang={lang} onSelect={setTab} onExit={() => void window.ourCompanion.app.exitWithAnimation()} />
        <section className="workspace">
          {loadError && <InlineNotice action={<button onClick={() => void refreshAll()}>{t(lang, 'feedback_retry')}</button>}>{t(lang, 'panel_partial_load_error')}</InlineNotice>}
          {tab === 'home' && (
            <HomePage
              state={state}
              character={characters[0]}
              companion={primaryCompanion ?? undefined}
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
            <DiscoveriesPage
              discoveries={discoveries}
              exploration={exploration}
              exploring={exploring}
              onStartExploration={sendCompanionExploring}
              onSubmitFeedback={submitExplorationFeedback}
              onRefresh={refreshAll}
            />
          )}
          {tab === 'journey' && <JourneysPage journeys={journeys} timeline={timeline} onRefresh={refreshAll} />}
          {tab === 'memory' && <MemoriesPage graph={memoryGraph} onRefresh={refreshAll} />}
          {tab === 'chat' && <ChatPage />}
          {tab === 'social' && <SocialPage />}
          {tab === 'settings' && <SettingsPage state={state} behaviorSettings={behaviorSettings} onRefresh={refreshAll} onLangChange={setLang} companionId={primaryCompanion?.id} assetRoot={primaryCompanion?.assetRoot} />}
        </section>
      </main>
    </LangContext.Provider>
  );
}

// ─── View Components ────────────────────────────────────────────────────────
