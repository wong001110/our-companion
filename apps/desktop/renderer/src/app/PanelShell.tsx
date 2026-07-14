import { useCallback, useEffect, useRef, useState } from 'react';
import { t, type Lang } from '../i18n';
import { LangContext } from '../ui/NotebookPrimitives';
import { type Tab } from '../ui/utils';
import { MemoriesPage } from '../pages/MemoriesPage';
import { HomePage } from '../pages/HomePage';
import { DiscoveriesPage } from '../pages/DiscoveriesPage';
import { JourneysPage } from '../pages/JourneysPage';
import { ChatPage } from '../pages/ChatPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SocialPage } from '../pages/SocialPage';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { ResponsiveNavigation } from '../layouts/ResponsiveNavigation';
import { usePanelDashboardViewModel } from './usePanelDashboardViewModel';

export function PanelShell() {
  return <PanelDashboard />;
}

function PanelDashboard() {
  const [tab, setTab] = useState<Tab>('home');
  const [lang, setLang] = useState<Lang>('en');
  const [pageMotionState, setPageMotionState] = useState<'entering' | 'entered'>('entering');
  const workspaceRef = useRef<HTMLElement>(null);
  const pageHeadingRef = useRef<HTMLDivElement>(null);
  const onInitialLanguage = useCallback((nextLang: Lang) => setLang(nextLang), []);
  const { state, behaviorSettings, characters, primaryCompanion, discoveries, journeys, timeline, memoryGraph, diary, exploration, explorationEvents, exploring, onboardingRequired, loadError, refreshAll, sendCompanionExploring, submitExplorationFeedback } = usePanelDashboardViewModel(onInitialLanguage);

  const selectTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
  }, []);

  useEffect(() => {
    workspaceRef.current?.scrollTo({ top: 0 });
    setPageMotionState('entering');
    const enteredFrame = window.requestAnimationFrame(() => setPageMotionState('entered'));
    const focusFrame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => pageHeadingRef.current?.focus()));
    return () => {
      window.cancelAnimationFrame(enteredFrame);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [tab]);

  useEffect(() => window.ourCompanion.window.onPanelNavigate(selectTab), [selectTab]);

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
        <ResponsiveNavigation tab={tab} lang={lang} onSelect={selectTab} onExit={() => void window.ourCompanion.app.exitWithAnimation()} />
        <section ref={workspaceRef} className="workspace">
          {loadError && <InlineNotice action={<button onClick={() => void refreshAll()}>{t(lang, 'feedback_retry')}</button>}>{t(lang, 'panel_partial_load_error')}</InlineNotice>}
          <div key={tab} ref={pageHeadingRef} className="panel-page-transition" data-motion-state={pageMotionState} tabIndex={-1} data-testid={`panel-page-${tab}`}>
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
          </div>
        </section>
      </main>
    </LangContext.Provider>
  );
}

// ─── View Components ────────────────────────────────────────────────────────
