import { useState } from 'react';
import type { Discovery, ExplorationCycleResult } from '@our-companion/shared';
import { t } from '../i18n';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { useDiscoveriesViewModel } from '../features/discoveries/useDiscoveriesViewModel';
import { DiscoveryHistoryPanel } from '../features/discoveries/DiscoveryHistoryPanel';
import { DiscoverySourcesPanel } from '../features/discoveries/DiscoverySourcesPanel';
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

interface DiscoveryDetail {
  title: string;
  summary: string;
  source: string;
  url?: string;
  tags: string[];
}

export function shortDiscoverySummary(value: string, maximum = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

export function compactDiscoveryTags(values: string[]): string[] {
  const tags: string[] = [];
  for (const value of values) {
    for (const part of value.split(/[，,。.!?！？;；|/:：—–]+/u)) {
      const normalized = part.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      const compact = /\p{Script=Han}/u.test(normalized)
        ? normalized.slice(0, 10)
        : normalized.split(' ').slice(0, 3).join(' ').slice(0, 30);
      if (compact.length < 2 || tags.some((tag) => tag.toLocaleLowerCase() === compact.toLocaleLowerCase())) continue;
      tags.push(compact);
      if (tags.length >= 4) return tags;
    }
  }
  return tags;
}

export function DiscoveriesPage({ discoveries, exploration, exploring, onStartExploration, onSubmitFeedback, onRefresh }: DiscoveriesPageProps) {
  const lang = useLang();
  const [section, setSection] = useState<'feed' | 'sources' | 'history'>('feed');
  const [detail, setDetail] = useState<DiscoveryDetail>();
  const { addToJourney, busy, error, filters, markNotInterested, refreshDiscovery, selectedFilter, setSelectedFilter, visibleDiscoveries } = useDiscoveriesViewModel({ discoveries, lang, onRefresh });
  const detailsLabel = lang === 'zh-CN' ? '查看详情' : 'Details';
  const closeLabel = lang === 'zh-CN' ? '关闭' : 'Close';

  return (
    <NotebookPage eyebrow={t(lang, 'discovery_eyebrow')} title={t(lang, 'discovery_title')} note={t(lang, 'discovery_note')} marker="discovery">
      <div className="soft-filter-row discovery-section-tabs" role="tablist" aria-label={t(lang, 'discovery_sections_label')}>
        {(['feed', 'sources', 'history'] as const).map((item) => (
          <button key={item} id={`discovery-tab-${item}`} type="button" role="tab" aria-selected={section === item} aria-controls={`discovery-panel-${item}`} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>
            {t(lang, `discovery_section_${item}`)}
          </button>
        ))}
      </div>
      <div id="discovery-panel-feed" role="tabpanel" aria-labelledby="discovery-tab-feed" hidden={section !== 'feed'}>
        {section === 'feed' && <>
          <div className="toolbar notebook-toolbar">
            <div className="soft-filter-row" aria-label={t(lang, 'discovery_filters_label')}>
              {filters.map(({ key, label }) => <button key={key} className={selectedFilter === key ? 'active' : ''} aria-pressed={selectedFilter === key} onClick={() => setSelectedFilter(key)}>{label}</button>)}
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
                  <article className="discovery-card discovery-card--evidence paper-photo-card" key={candidate.id}>
                    <div className="card-topline"><span>{candidate.sourceType}</span><strong>{candidate.agentType}</strong></div>
                    <h3>{candidate.title}</h3><p className="discovery-card-summary">{shortDiscoverySummary(candidate.summary)}</p>
                    <div className="action-row">
                      <button onClick={() => setDetail({ title: candidate.title, summary: candidate.summary, source: candidate.sourceName ?? candidate.sourceType, url: candidate.sourceUrl, tags: [] })}>{detailsLabel}</button>
                      {candidate.sourceUrl && <button onClick={() => window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: candidate.sourceUrl } })}>{t(lang, 'discovery_view')}</button>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          <div className="discovery-grid">
            {visibleDiscoveries.map((discovery) => {
              const summary = discovery.summary ?? discovery.shortMessage ?? t(lang, 'discovery_default_summary');
              const tags = compactDiscoveryTags(discovery.tags);
              return (
                <article className="discovery-card paper-photo-card" key={discovery.id}>
                  <div className="photo-thumb" aria-hidden="true"><span>{discovery.source.slice(0, 2).toUpperCase()}</span></div>
                  <div className="card-topline"><span>{discovery.source}</span><strong>{formatDiscoveryTime(discovery, lang)}</strong></div>
                  <h3>{discovery.title}</h3><p className="discovery-card-summary">{shortDiscoverySummary(summary)}</p>
                  <div className="tag-row">{tags.map((tag) => <span title={tag} key={tag}>{tag}</span>)}</div>
                  <div className="action-row">
                    <button onClick={() => setDetail({ title: discovery.title, summary, source: discovery.source, url: discovery.url, tags })}>{detailsLabel}</button>
                    <button disabled={!discovery.url} onClick={() => discovery.url && window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: discovery.url } })}>{t(lang, 'discovery_view')}</button>
                    <button disabled={busy} onClick={() => void addToJourney(discovery.id)}>{t(lang, 'discovery_add')}</button>
                    <button disabled={busy} onClick={() => void markNotInterested(discovery.id)}>{t(lang, 'discovery_not_interested')}</button>
                  </div>
                </article>
              );
            })}
            {visibleDiscoveries.length === 0 && <StickyNote title={t(lang, 'discovery_empty_title')}><p>{t(lang, 'discovery_empty_body')}</p></StickyNote>}
          </div>
        </>}
      </div>
      <div id="discovery-panel-sources" role="tabpanel" aria-labelledby="discovery-tab-sources" hidden={section !== 'sources'}>{section === 'sources' && <DiscoverySourcesPanel onFeedRefresh={onRefresh} />}</div>
      <div id="discovery-panel-history" role="tabpanel" aria-labelledby="discovery-tab-history" hidden={section !== 'history'}>{section === 'history' && <DiscoveryHistoryPanel />}</div>
      {detail && (
        <div className="discovery-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(undefined); }}>
          <section className="discovery-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="discovery-detail-title">
            <div className="card-topline"><span>{detail.source}</span><button type="button" onClick={() => setDetail(undefined)}>{closeLabel}</button></div>
            <h2 id="discovery-detail-title">{detail.title}</h2>
            <p>{detail.summary}</p>
            {detail.tags.length > 0 && <div className="tag-row">{detail.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            {detail.url && <button onClick={() => window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: detail.url! } })}>{t(lang, 'discovery_view')}</button>}
          </section>
        </div>
      )}
    </NotebookPage>
  );
}
