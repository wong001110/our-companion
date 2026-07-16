import type { Discovery, ExplorationCycleResult } from '@our-companion/shared';
import { t } from '../i18n';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { useDiscoveriesViewModel } from '../features/discoveries/useDiscoveriesViewModel';
import { NotebookPage, StickyNote, useLang } from '../ui/NotebookPrimitives';
import { formatDiscoveryTime } from '../ui/utils';

interface DiscoveriesPageProps {
  discoveries: Discovery[];
  exploration?: ExplorationCycleResult;
  exploring: boolean;
  onStartExploration: () => Promise<void>;
  onSubmitFeedback: (value: 'saved' | 'not_interested' | 'later' | 'talk_about_this' | 'opened_evidence') => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function DiscoveriesPage({ discoveries, exploration, exploring, onStartExploration, onSubmitFeedback, onRefresh }: DiscoveriesPageProps) {
  const lang = useLang();
  const { addToJourney, busy, error, filters, markNotInterested, refreshDiscovery, selectedFilter, setSelectedFilter, visibleDiscoveries } = useDiscoveriesViewModel({ discoveries, lang, onRefresh });

  return (
    <NotebookPage eyebrow={t(lang, 'discovery_eyebrow')} title={t(lang, 'discovery_title')} note={t(lang, 'discovery_note')} marker="discovery">
      <div className="toolbar notebook-toolbar">
        <div className="soft-filter-row" aria-label={t(lang, 'discovery_filters_label')}>
          {filters.map(({ key, label }) => (
            <button key={key} className={selectedFilter === key ? 'active' : ''} aria-pressed={selectedFilter === key} onClick={() => setSelectedFilter(key)}>{label}</button>
          ))}
        </div>
        <div className="action-row">
          <button onClick={() => void onStartExploration()} disabled={exploring}>{exploring ? t(lang, 'discovery_exploring') : t(lang, 'discovery_send_exploring')}</button>
          <button disabled={busy} onClick={() => void refreshDiscovery()}>{t(lang, 'discovery_refresh')}</button>
        </div>
      </div>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {exploration?.selectedInsight && (
        <section className="insight-archive-panel">
          <div><p className="eyebrow">{t(lang, 'discovery_returned_insight')}</p><h2>{exploration.selectedInsight.title}</h2><p>{exploration.selectedInsight.summary}</p></div>
          <div className="action-row">
            <button onClick={() => void onSubmitFeedback('opened_evidence')}>{t(lang, 'discovery_explore_evidence')}</button>
            <button onClick={() => void onSubmitFeedback('saved')}>{t(lang, 'discovery_save')}</button>
            <button onClick={() => void onSubmitFeedback('not_interested')}>{t(lang, 'discovery_not_interested')}</button>
            <button onClick={() => void onSubmitFeedback('talk_about_this')}>{t(lang, 'discovery_talk_about')}</button>
          </div>
          <div className="discovery-grid evidence-grid">
            {exploration.discoveryCandidates.slice(0, 4).map((candidate) => (
              <article className="discovery-card paper-photo-card" key={candidate.id}>
                <div className="card-topline"><span>{candidate.sourceType}</span><strong>{candidate.agentType}</strong></div>
                <h3>{candidate.title}</h3><p>{candidate.summary}</p>
                {candidate.sourceUrl && <button onClick={() => window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: candidate.sourceUrl } })}>{t(lang, 'discovery_view')}</button>}
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="discovery-grid">
        {visibleDiscoveries.map((discovery) => (
          <article className="discovery-card paper-photo-card" key={discovery.id}>
            <div className="photo-thumb" aria-hidden="true"><span>{discovery.source.slice(0, 2).toUpperCase()}</span></div>
            <div className="card-topline"><span>{discovery.source}</span><strong>{formatDiscoveryTime(discovery, lang)}</strong></div>
            <h3>{discovery.title}</h3><p>{discovery.summary ?? discovery.shortMessage ?? t(lang, 'discovery_default_summary')}</p>
            <div className="tag-row">{discovery.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="action-row">
              <button onClick={() => discovery.url && window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: discovery.url } })}>{t(lang, 'discovery_view')}</button>
              <button disabled={busy} onClick={() => void addToJourney(discovery.id)}>{t(lang, 'discovery_add')}</button>
              <button disabled={busy} onClick={() => void markNotInterested(discovery.id)}>{t(lang, 'discovery_not_interested')}</button>
            </div>
          </article>
        ))}
        {visibleDiscoveries.length === 0 && <StickyNote title={t(lang, 'discovery_empty_title')}><p>{t(lang, 'discovery_empty_body')}</p></StickyNote>}
      </div>
    </NotebookPage>
  );
}
