import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  KnowledgeGraph,
  MemoryImpactReport,
  MemoryReviewItem,
  MemoryReviewState,
  TypedMemoryType,
} from '@our-companion/shared';
import { t } from '../i18n';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { NotebookPage, PaperCard, StickyNote, useLang } from '../ui/NotebookPrimitives';

const REVIEW_FILTERS: Array<{ value: 'all' | MemoryReviewState; label: string }> = [
  { value: 'all', label: 'memory_review_filter_all' },
  { value: 'confirmed', label: 'memory_review_filter_confirmed' },
  { value: 'needs_confirmation', label: 'memory_review_filter_needs_confirmation' },
  { value: 'user_disputed', label: 'memory_review_filter_paused' },
];

const TYPE_FILTERS: Array<{ value: 'all' | TypedMemoryType; label: string }> = [
  { value: 'all', label: 'memory_type_all' },
  { value: 'user_preference', label: 'memory_type_user_preference' },
  { value: 'goal', label: 'memory_type_goal' },
  { value: 'user_boundary', label: 'memory_type_user_boundary' },
  { value: 'shared_experience', label: 'memory_type_shared_experience' },
  { value: 'conversation_episode', label: 'memory_type_conversation_episode' },
  { value: 'external_knowledge', label: 'memory_type_external_knowledge' },
];

function percentage(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function readable(value: string | undefined): string {
  return value ? value.replaceAll('_', ' ') : '—';
}

export function MemoriesPage({ graph, onRefresh }: { graph: KnowledgeGraph; onRefresh: () => Promise<void> }) {
  const lang = useLang();
  const [items, setItems] = useState<MemoryReviewItem[]>([]);
  const [search, setSearch] = useState('');
  const [reviewFilter, setReviewFilter] = useState<'all' | MemoryReviewState>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TypedMemoryType>('all');
  const [busyId, setBusyId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [impact, setImpact] = useState<MemoryImpactReport>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setItems(await window.ourCompanion.memory.listReview({
        search,
        memoryTypes: typeFilter === 'all' ? undefined : [typeFilter],
        reviewStates: reviewFilter === 'all' ? undefined : [reviewFilter],
        limit: 300,
      }));
    } catch {
      setError(t(lang, 'memory_review_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [lang, reviewFilter, search, typeFilter]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 120); return () => window.clearTimeout(timer); }, [load]);

  async function updateReview(id: string, state: MemoryReviewState) {
    setBusyId(id);
    setError(undefined);
    try {
      await window.ourCompanion.memory.updateReview({ id, state });
      if (impact?.memory.id === id) setImpact(undefined);
      await Promise.all([load(), onRefresh()]);
    } catch {
      setError(t(lang, 'memory_review_update_failed'));
    } finally {
      setBusyId(undefined);
    }
  }

  async function inspectImpact(id: string) {
    setBusyId(id);
    setError(undefined);
    try {
      setImpact(await window.ourCompanion.memory.inspectImpact(id));
    } catch {
      setError(t(lang, 'memory_review_impact_failed'));
    } finally {
      setBusyId(undefined);
    }
  }

  const activeCount = useMemo(() => items.filter((item) => item.status === 'active').length, [items]);

  return (
    <NotebookPage eyebrow={t(lang, 'memory_eyebrow')} title={t(lang, 'memory_title')} note={t(lang, 'memory_review_note')} marker="memory">
      <div className="memory-layout">
        <PaperCard title={t(lang, 'memory_review_controls_title')} tape>
          <p>{t(lang, 'memory_review_controls_desc')}</p>
          <div className="soft-filter-row" aria-label={t(lang, 'memory_review_filters_label')}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(lang, 'memory_review_search_placeholder')} />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
              {TYPE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{t(lang, filter.label as never)}</option>)}
            </select>
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)}>
              {REVIEW_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{t(lang, filter.label as never)}</option>)}
            </select>
            <button type="button" onClick={() => void load()} disabled={loading}>{t(lang, 'discovery_refresh')}</button>
          </div>
          <p>{t(lang, 'memory_review_summary', { active: activeCount, total: items.length || graph.nodes.length })}</p>
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
        </PaperCard>

        <div className="memory-list">
          {items.map((item) => (
            <article className="memory-card paper-card paper-card-taped" key={item.id}>
              <div className="tag-row">
                <span>{readable(item.memoryType ?? item.nodeType)}</span>
                <span>{readable(item.reviewState)}</span>
                <span>{item.status === 'active' ? t(lang, 'memory_review_active') : t(lang, 'memory_review_paused')}</span>
              </div>
              <h3>{item.title}</h3>
              {item.summary && <p>{item.summary}</p>}
              <dl className="engine-research-grid">
                <div><dt>{t(lang, 'memory_review_source')}</dt><dd>{readable(item.sourceType)}</dd></div>
                <div><dt>{t(lang, 'memory_review_evidence')}</dt><dd>{readable(item.canonicalSource)}</dd></div>
                <div><dt>{t(lang, 'memory_review_confidence')}</dt><dd>{percentage(item.confidence)}</dd></div>
                <div><dt>{t(lang, 'memory_review_last_used')}</dt><dd>{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleDateString() : t(lang, 'memory_review_never_used')}</dd></div>
                <div><dt>{t(lang, 'memory_review_observations')}</dt><dd>{item.observationCount}</dd></div>
                <div><dt>{t(lang, 'memory_review_updated')}</dt><dd>{new Date(item.updatedAt).toLocaleDateString()}</dd></div>
              </dl>
              {item.reviewState === 'user_disputed' && <InlineNotice>{t(lang, 'memory_review_disputed_notice')}</InlineNotice>}
              {item.reviewState === 'needs_confirmation' && <InlineNotice>{t(lang, 'memory_review_confirmation_notice')}</InlineNotice>}
              <div className="action-row">
                <button disabled={busyId === item.id} onClick={() => void updateReview(item.id, 'confirmed')}>{t(lang, 'memory_review_confirm')}</button>
                <button disabled={busyId === item.id} onClick={() => void updateReview(item.id, 'needs_confirmation')}>{t(lang, 'memory_review_ask_again')}</button>
                <button disabled={busyId === item.id} onClick={() => void updateReview(item.id, 'user_disputed')}>{t(lang, 'memory_review_pause_use')}</button>
                <button disabled={busyId === item.id} onClick={() => void inspectImpact(item.id)}>{t(lang, 'memory_review_view_influence')}</button>
              </div>
            </article>
          ))}
          {!loading && items.length === 0 && <StickyNote title={t(lang, 'memory_empty_title')}><p>{t(lang, 'memory_review_empty_body')}</p></StickyNote>}
          {loading && <p>{t(lang, 'feedback_loading')}</p>}
        </div>

        {impact && (
          <PaperCard title={t(lang, 'memory_review_influence_title')} className="memory-impact-inspector">
            <p>{t(lang, 'memory_review_influence_desc')}</p>
            <dl className="engine-research-grid">
              <div><dt>{t(lang, 'memory_review_patterns')}</dt><dd>{impact.patternIds.length}</dd></div>
              <div><dt>{t(lang, 'memory_review_interests')}</dt><dd>{impact.interestNodeIds.length}</dd></div>
              <div><dt>{t(lang, 'memory_review_curiosity')}</dt><dd>{impact.curiosityTargetIds.length}</dd></div>
              <div><dt>{t(lang, 'memory_review_research')}</dt><dd>{impact.researchIntentIds.length}</dd></div>
              <div><dt>{t(lang, 'memory_review_discoveries')}</dt><dd>{impact.discoveryCandidateIds.length}</dd></div>
              <div><dt>{t(lang, 'memory_review_insights')}</dt><dd>{impact.insightIds.length}</dd></div>
            </dl>
            <div className="action-row"><button onClick={() => setImpact(undefined)}>{t(lang, 'common_cancel')}</button></div>
          </PaperCard>
        )}
      </div>
    </NotebookPage>
  );
}
