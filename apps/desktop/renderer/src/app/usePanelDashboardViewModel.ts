import { useCallback, useEffect, useState } from 'react';
import type { CharacterBehaviorSettings, CharacterProfile, CharacterRuntimeState, CompanionJourney, DiaryEntry, Discovery, ExplorationCycleResult, ExplorationLoopEvent, JourneyTimelineEntry, KnowledgeGraph } from '@our-companion/shared';
import type { Lang } from '../i18n';

/** Owns Panel dashboard reads and mutations, leaving PanelShell to render navigation. */
export function usePanelDashboardViewModel(onInitialLanguage: (lang: Lang) => void) {
  const [state, setState] = useState<CharacterRuntimeState>();
  const [behaviorSettings, setBehaviorSettings] = useState<CharacterBehaviorSettings>();
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [primaryCompanion, setPrimaryCompanion] = useState<import('@our-companion/shared').CompanionProfile | null>(null);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [journeys, setJourneys] = useState<CompanionJourney[]>([]);
  const [timeline, setTimeline] = useState<JourneyTimelineEntry[]>([]);
  const [memoryGraph, setMemoryGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [exploration, setExploration] = useState<ExplorationCycleResult>();
  const [explorationEvents, setExplorationEvents] = useState<ExplorationLoopEvent[]>([]);
  const [exploring, setExploring] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refreshAll = useCallback(async () => {
    const results = await Promise.allSettled([
      window.ourCompanion.character.getState(), window.ourCompanion.character.getBehaviorSettings(), window.ourCompanion.character.getActive(),
      window.ourCompanion.discovery.getFeed({ limit: 12 }), window.ourCompanion.journey.getActive(), window.ourCompanion.journey.getTimeline(),
      window.ourCompanion.memory.getGraph(), window.ourCompanion.diary.getEntries({ limit: 6 }), window.ourCompanion.companionNew.getPrimary(),
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
  }, []);

  useEffect(() => {
    void window.ourCompanion.companionNew.getPrimary().then((companion) => {
      setOnboardingRequired(!companion);
      if (companion) void refreshAll();
    });
    void window.ourCompanion.ai.getSettings().then((settings) => { if (settings.uiLang) onInitialLanguage(settings.uiLang as Lang); });
    return window.ourCompanion.autonomy.onExplorationEvent((event) => setExplorationEvents((events) => [event, ...events].slice(0, 12)));
  }, [onInitialLanguage, refreshAll]);

  const sendCompanionExploring = useCallback(async () => {
    if (exploring) return;
    setExploring(true);
    try { setExploration(await window.ourCompanion.autonomy.startExploration({ trigger: 'manual' })); await refreshAll(); }
    finally { setExploring(false); }
  }, [exploring, refreshAll]);

  const submitExplorationFeedback = useCallback(async (value: 'saved' | 'not_interested' | 'later' | 'talk_about_this' | 'opened_evidence') => {
    const cycle = exploration?.cycle;
    if (!cycle) return;
    await window.ourCompanion.autonomy.submitFeedback({ cycleId: cycle.id, insightId: exploration?.selectedInsight?.id, value, note: exploration?.selectedInsight?.title });
    await refreshAll();
    setExploration((current) => current ? { ...current, cycle: { ...current.cycle, state: 'reflecting', completedAt: new Date().toISOString() } } : current);
  }, [exploration, refreshAll]);

  return { state, behaviorSettings, characters, primaryCompanion, discoveries, journeys, timeline, memoryGraph, diary, exploration, explorationEvents, exploring, onboardingRequired, loadError, refreshAll, sendCompanionExploring, submitExplorationFeedback };
}
