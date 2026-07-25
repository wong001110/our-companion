import { useCallback, useEffect, useState } from 'react';
import type { MemoryVectorProductStatus } from '@our-companion/shared';
import { InlineNotice } from '../../components/feedback/InlineNotice';
import { t } from '../../i18n';
import { PaperCard, useLang } from '../../ui/NotebookPrimitives';

export function MemoryIntelligenceSettingsCard() {
  const lang = useLang();
  const [status, setStatus] = useState<MemoryVectorProductStatus>();
  const [busy, setBusy] = useState<'install' | 'rebuild'>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setStatus(await window.ourCompanion.memory.getVectorStatus());
      setError(undefined);
    } catch {
      setError(t(lang, 'memory_vector_status_failed'));
    }
  }, [lang]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function install() {
    setBusy('install');
    setError(undefined);
    try {
      await window.ourCompanion.memory.installVectorModel();
      await refresh();
    } catch {
      setError(t(lang, 'memory_vector_install_failed'));
    } finally {
      setBusy(undefined);
    }
  }

  async function rebuild() {
    setBusy('rebuild');
    setError(undefined);
    try {
      await window.ourCompanion.memory.rebuildVectorIndex();
      await refresh();
    } catch {
      setError(t(lang, 'memory_vector_rebuild_failed'));
    } finally {
      setBusy(undefined);
    }
  }

  const stateLabel = status ? t(lang, `memory_vector_state_${status.state}` as never) : t(lang, 'feedback_loading');
  return (
    <PaperCard title={t(lang, 'memory_vector_title')} className="settings-panel">
      <p>{t(lang, 'memory_vector_desc')}</p>
      <dl className="engine-research-grid">
        <div><dt>{t(lang, 'memory_vector_status')}</dt><dd>{stateLabel}</dd></div>
        <div><dt>{t(lang, 'memory_vector_model')}</dt><dd>{status?.modelId ?? 'Xenova/multilingual-e5-small'}</dd></div>
        <div><dt>{t(lang, 'memory_vector_indexed')}</dt><dd>{status ? `${status.indexedCount}/${status.eligibleCount}` : '—'}</dd></div>
        <div><dt>{t(lang, 'memory_vector_jobs')}</dt><dd>{status ? `${status.pendingJobs + status.runningJobs} / ${status.failedJobs}` : '—'}</dd></div>
        <div><dt>{t(lang, 'memory_vector_local_only')}</dt><dd>{t(lang, 'memory_vector_yes')}</dd></div>
        <div><dt>{t(lang, 'memory_vector_fallback')}</dt><dd>{t(lang, 'memory_vector_fallback_ready')}</dd></div>
      </dl>
      {status && <p aria-live="polite">{status.message}</p>}
      {status?.lastError && status.state !== 'ready' && <InlineNotice>{status.lastError}</InlineNotice>}
      <div className="action-row">
        <button type="button" disabled={Boolean(busy)} onClick={() => void install()}>
          {busy === 'install' ? t(lang, 'memory_vector_installing') : t(lang, 'memory_vector_install')}
        </button>
        <button type="button" disabled={Boolean(busy) || status?.state === 'not_installed'} onClick={() => void rebuild()}>
          {busy === 'rebuild' ? t(lang, 'memory_vector_rebuilding') : t(lang, 'memory_vector_rebuild')}
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void refresh()}>{t(lang, 'discovery_refresh')}</button>
      </div>
      <p>{t(lang, 'memory_vector_privacy_note')}</p>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
    </PaperCard>
  );
}
