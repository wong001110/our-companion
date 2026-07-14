import { useState } from 'react';
import type { KnowledgeGraphNode } from '@our-companion/shared';
import { t, type Lang } from '../../i18n';
import { useToast } from '../../components/feedback/ToastProvider';
import { emptyMemoryDraft, memoryDraftFromNode, type MemoryDraft } from './memoryDraft';

/** Keeps the page focused on rendering while memory reads and writes stay recoverable. */
export function useMemoriesViewModel({ lang, onRefresh }: { lang: Lang; onRefresh: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<MemoryDraft>(emptyMemoryDraft);
  const [editing, setEditing] = useState<KnowledgeGraphNode>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const cancelEditing = () => {
    setEditing(undefined);
    setDraft(emptyMemoryDraft());
    setError(undefined);
  };

  const saveMemory = async () => {
    if (!draft.content.trim() && !draft.title.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const title = draft.title.trim() || draft.content.slice(0, 42);
      if (editing) {
        await window.ourCompanion.memory.updateNode({ id: editing.id, title, content: draft.content, summary: draft.summary });
      } else {
        await window.ourCompanion.memory.createNode({ type: 'topic', title, summary: draft.summary || draft.content.slice(0, 120), content: draft.content });
      }
      cancelEditing();
      await onRefresh();
      pushToast(t(lang, 'memory_saved'), 'success');
    } catch {
      setError(t(lang, 'memory_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const editMemory = async (node: KnowledgeGraphNode) => {
    setBusy(true);
    setError(undefined);
    try {
      const fullNode = await window.ourCompanion.memory.getNode(node.id);
      if (!fullNode) {
        setError(t(lang, 'memory_load_failed'));
        return;
      }
      setEditing(node);
      setDraft(memoryDraftFromNode(fullNode));
    } catch {
      setError(t(lang, 'memory_load_failed'));
    } finally {
      setBusy(false);
    }
  };

  return { busy, cancelEditing, draft, editMemory, editing, error, saveMemory, setDraft };
}
