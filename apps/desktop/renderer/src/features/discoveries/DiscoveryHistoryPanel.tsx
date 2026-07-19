import { useCallback, useEffect, useState } from 'react';
import type { ExplorationCycle } from '@our-companion/shared';
import { EmptyState } from '../../components/feedback/EmptyState';
import { InlineNotice } from '../../components/feedback/InlineNotice';
import { LoadingState } from '../../components/feedback/LoadingState';
import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

export function DiscoveryHistoryPanel() {
  const lang = useLang();
  const [cycles, setCycles] = useState<ExplorationCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCycles(await window.ourCompanion.autonomy.getCycleHistory({ limit: 50 }));
    } catch {
      setError(t(lang, 'discovery_history_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [lang]);
  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error) return <InlineNotice tone="error" action={<button type="button" onClick={() => void load()}>{t(lang, 'feedback_retry')}</button>}>{error}</InlineNotice>;
  if (!cycles.length) return <EmptyState title={t(lang, 'discovery_history_empty_title')}>{t(lang, 'discovery_history_empty_body')}</EmptyState>;
  return (
    <section className="discovery-history-list" aria-labelledby="discovery-history-heading">
      <div className="discovery-section-heading">
        <div>
          <h2 id="discovery-history-heading">{t(lang, 'discovery_history_title')}</h2>
          <p>{t(lang, 'discovery_history_note')}</p>
        </div>
      </div>
      {cycles.map((cycle) => (
        <article key={cycle.id} className="paper-photo-card discovery-history-card">
          <div>
            <strong>{t(lang, 'discovery_history_exploration')}</strong>
            <span className="source-state-badge">{cycle.state}</span>
          </div>
          <p>{t(lang, 'discovery_history_summary', {
            accepted: cycle.discoveryCandidateIds.length,
            time: new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(cycle.completedAt ?? cycle.startedAt)),
          })}</p>
          <small>{cycle.trigger} · {cycle.id}</small>
        </article>
      ))}
    </section>
  );
}
