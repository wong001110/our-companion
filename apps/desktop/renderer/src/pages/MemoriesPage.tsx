import { useState } from 'react';
import type { KnowledgeGraph, MemoryImpactRecomputeReport, MemoryImpactReport } from '@our-companion/shared';
import { t } from '../i18n';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { useMemoriesViewModel } from '../features/memories/useMemoriesViewModel';
import { NotebookPage, PaperCard, StickyNote, useLang } from '../ui/NotebookPrimitives';

export function MemoriesPage({ graph, onRefresh }: { graph: KnowledgeGraph; onRefresh: () => Promise<void> }) {
  const lang = useLang();
  const { busy, cancelEditing, draft, editMemory, editing, error, saveMemory, setDraft } = useMemoriesViewModel({ lang, onRefresh });
  const [impact, setImpact] = useState<MemoryImpactReport>();
  const [recompute, setRecompute] = useState<MemoryImpactRecomputeReport>();
  const [impactBusy, setImpactBusy] = useState(false);
  const [impactError, setImpactError] = useState<string>();

  async function inspectImpact(id: string) {
    setImpactBusy(true);
    setImpactError(undefined);
    try {
      setImpact(await window.ourCompanion.memory.inspectImpact(id));
      setRecompute(undefined);
    } catch {
      setImpactError('Unable to inspect Memory impact for this record.');
    } finally {
      setImpactBusy(false);
    }
  }

  async function recomputeImpact(explore = false) {
    if (!impact) return;
    setImpactBusy(true);
    setImpactError(undefined);
    try {
      setRecompute(await window.ourCompanion.memory.recomputeImpact({ id: impact.memory.id, explore }));
      setImpact(await window.ourCompanion.memory.inspectImpact(impact.memory.id));
      await onRefresh();
    } catch {
      setImpactError('Unable to recompute Memory impact. Please try again.');
    } finally {
      setImpactBusy(false);
    }
  }

  return (
    <NotebookPage eyebrow={t(lang, 'memory_eyebrow')} title={t(lang, 'memory_title')} note={t(lang, 'memory_note')} marker="memory">
      <div className="memory-layout">
        <PaperCard title={t(lang, 'memory_add_card')} tape>
          <label><span>{t(lang, 'memory_title_label')}</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={t(lang, 'memory_title_placeholder')} /></label>
          <label><span>{t(lang, 'memory_content_label')}</span><textarea value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder={t(lang, 'memory_placeholder')} /></label>
          <label><span>{t(lang, 'memory_summary_label')}</span><input value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} placeholder={t(lang, 'memory_summary_placeholder')} /></label>
          <div className="action-row">
            <button disabled={busy} onClick={() => void saveMemory()}>{editing ? t(lang, 'memory_update') : t(lang, 'memory_add')}</button>
            {editing && <button disabled={busy} onClick={cancelEditing}>{t(lang, 'memory_cancel')}</button>}
          </div>
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
        </PaperCard>
        <div className="memory-list">
          {graph.nodes.map((node) => (
            <article className="memory-card paper-card paper-card-taped" key={node.id}>
              <h3>{node.title}</h3>
              <div className="tag-row"><span>{node.kind}</span></div>
              <div className="action-row">
                <button disabled={busy} onClick={() => void editMemory(node)}>{t(lang, 'memory_edit')}</button>
                <button disabled={impactBusy} onClick={() => void inspectImpact(node.id)}>Inspect impact</button>
              </div>
            </article>
          ))}
          {graph.nodes.length === 0 && <StickyNote title={t(lang, 'memory_empty_title')}><p>{t(lang, 'memory_empty_body')}</p></StickyNote>}
        </div>
        {impact && (
          <PaperCard title="Memory Impact Inspector" className="memory-impact-inspector">
            <dl className="engine-research-grid">
              <div><dt>Memory ID</dt><dd>{impact.memory.id}</dd></div>
              <div><dt>Companion ID</dt><dd>{impact.memory.companionId ?? 'active'}</dd></div>
              <div><dt>Type</dt><dd>{impact.memory.type}</dd></div>
              <div><dt>Title</dt><dd>{impact.memory.title}</dd></div>
              <div><dt>Summary</dt><dd>{impact.memory.summary ?? '—'}</dd></div>
              <div><dt>Importance</dt><dd>{impact.memory.importance}</dd></div>
              <div><dt>Created at</dt><dd>{impact.memory.createdAt}</dd></div>
              <div><dt>Updated at</dt><dd>{impact.memory.updatedAt}</dd></div>
              <div><dt>Normalized topics</dt><dd>{impact.normalizedTopics.join(', ') || 'none'}</dd></div>
              <div><dt>Interest Graph nodes</dt><dd>{impact.interestNodeIds.join(', ') || 'none'}</dd></div>
              <div><dt>Related Pattern IDs</dt><dd>{impact.patternIds.join(', ') || 'none'}</dd></div>
              <div><dt>Related Curiosity target IDs</dt><dd>{impact.curiosityTargetIds.join(', ') || 'none'}</dd></div>
              <div><dt>Related Research Intent IDs</dt><dd>{impact.researchIntentIds.join(', ') || 'none'}</dd></div>
              <div><dt>Related Exploration Cycle IDs</dt><dd>{impact.explorationCycleIds.join(', ') || 'none'}</dd></div>
              <div><dt>Related Discovery Candidate IDs</dt><dd>{impact.discoveryCandidateIds.join(', ') || 'none'}</dd></div>
              <div><dt>Related Insight IDs</dt><dd>{impact.insightIds.join(', ') || 'none'}</dd></div>
              <div><dt>Last cognitive evaluation</dt><dd>{impact.lastCognitiveEvaluation ?? 'not evaluated'}</dd></div>
            </dl>
            <div className="action-row">
              <button disabled={impactBusy} onClick={() => void recomputeImpact(false)}>Recompute cognition from this Memory</button>
              <button disabled={impactBusy} onClick={() => void recomputeImpact(true)}>Recompute and explore</button>
              <button disabled={impactBusy} onClick={() => setImpact(undefined)}>Close</button>
            </div>
            {impactError && <InlineNotice tone="error">{impactError}</InlineNotice>}
            {recompute && <pre className="debug-ai-log-raw">{JSON.stringify(recompute, null, 2)}</pre>}
          </PaperCard>
        )}
        {impactError && !impact && <InlineNotice tone="error">{impactError}</InlineNotice>}
      </div>
    </NotebookPage>
  );
}
