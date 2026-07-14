import type { KnowledgeGraph } from '@our-companion/shared';
import { t } from '../i18n';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { useMemoriesViewModel } from '../features/memories/useMemoriesViewModel';
import { NotebookPage, PaperCard, StickyNote, useLang } from '../ui/NotebookPrimitives';

export function MemoriesPage({ graph, onRefresh }: { graph: KnowledgeGraph; onRefresh: () => Promise<void> }) {
  const lang = useLang();
  const { busy, cancelEditing, draft, editMemory, editing, error, saveMemory, setDraft } = useMemoriesViewModel({ lang, onRefresh });

  return (
    <NotebookPage eyebrow={t(lang, 'memory_eyebrow')} title={t(lang, 'memory_title')} note={t(lang, 'memory_note')}>
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
            <article className="memory-card paper-card" key={node.id}>
              <h3>{node.title}</h3>
              <div className="tag-row"><span>{node.kind}</span></div>
              <div className="action-row"><button disabled={busy} onClick={() => void editMemory(node)}>{t(lang, 'memory_edit')}</button></div>
            </article>
          ))}
          {graph.nodes.length === 0 && <StickyNote title={t(lang, 'memory_empty_title')}><p>{t(lang, 'memory_empty_body')}</p></StickyNote>}
        </div>
      </div>
    </NotebookPage>
  );
}
