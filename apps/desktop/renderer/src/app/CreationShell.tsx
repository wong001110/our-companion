import { useEffect, useState } from 'react';
import type { CompanionProfile } from '@our-companion/shared';
import { CompanionCreationPage } from '../companion/creation/CompanionCreationPage';
import { CompanionEditPage } from '../companion/creation/CompanionEditPage';
import { CompanionSelectionPage } from '../companion/selection/CompanionSelectionPage';
import { getCreationCompletionAction, switchToSelectedCompanion } from '../companion/creation/creationCompletionFlow';
import { t, type Lang } from '../i18n';
import { LangContext } from '../ui/NotebookPrimitives';

export function CreationShell() {
  const [lang, setLang] = useState<Lang>('en');
  const [view, setView] = useState<'select' | 'create' | 'edit'>('select');
  const [editingCompanion, setEditingCompanion] = useState<CompanionProfile | undefined>(undefined);
  const [selectionRefreshKey, setSelectionRefreshKey] = useState(0);
  const [startupState, setStartupState] = useState<'idle' | 'starting' | 'recovery'>('idle');

  useEffect(() => {
    document.documentElement.classList.add('creation-mode');
    return () => document.documentElement.classList.remove('creation-mode');
  }, []);

  useEffect(() => {
    void window.ourCompanion.ai.getSettings().then((settings) => {
      if (settings.uiLang === 'zh-CN') setLang('zh-CN');
    }).catch(() => undefined);
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
      <LangContext.Provider value={lang}><main className="creation-shell">
        <CreationDragHandle />
        <button className="creation-close-btn" onClick={handleClose} title={t(lang, 'creation_close')}>
          &#x2715;
        </button>
        <div className="companion-creation-page">
          <div className="creation-card">
            <h1>{recovering ? t(lang, 'creation_retry_ready') : t(lang, 'creation_starting')}</h1>
            <p className="creation-subtitle">
              {recovering
                ? t(lang, 'creation_retry_body')
                : t(lang, 'creation_starting_body')}
            </p>
            {recovering && (
              <div className="creation-actions">
                <button className="btn-secondary" onClick={handleClose}>{t(lang, 'creation_quit')}</button>
                <button className="btn-primary" onClick={() => void handleRetryStartup()}>{t(lang, 'creation_retry_window')}</button>
              </div>
            )}
          </div>
        </div>
      </main></LangContext.Provider>
    );
  }

  if (view === 'edit' && editingCompanion) {
    return (
      <LangContext.Provider value={lang}><main className="creation-shell">
        <CreationDragHandle />
        <button className="creation-close-btn" onClick={handleClose} title={t(lang, 'creation_close')}>
          &#x2715;
        </button>
        <CompanionEditPage
          companion={editingCompanion}
          onComplete={handleEditComplete}
          onCancel={() => { setEditingCompanion(undefined); setView('select'); }}
        />
      </main></LangContext.Provider>
    );
  }

  if (view === 'create') {
    return (
      <LangContext.Provider value={lang}><main className="creation-shell">
        <CreationDragHandle />
        <button className="creation-close-btn" onClick={handleClose} title={t(lang, 'creation_close')}>
          &#x2715;
        </button>
        <CompanionCreationPage
          onComplete={handleCreationComplete}
          onCancel={() => setView('select')}
        />
      </main></LangContext.Provider>
    );
  }

  return (
    <LangContext.Provider value={lang}><main className="creation-shell">
      <CreationDragHandle />
      <button className="creation-close-btn" onClick={handleClose} title={t(lang, 'creation_close')}>
        &#x2715;
      </button>
      <CompanionSelectionPage
        refreshKey={selectionRefreshKey}
        onSelect={(companion) => { void handleSelectCompanion(companion); }}
        onCreateNew={() => { setEditingCompanion(undefined); setView('create'); }}
        onEdit={handleEdit}
      />
    </main></LangContext.Provider>
  );
}

function CreationDragHandle() {
  return (
    <div
      className="creation-drag-handle"
    />
  );
}
