import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CompanionMessage,
  CompanionMessageSource,
  CompanionTurnResult,
  RememberedMemoryMutation,
} from '@our-companion/shared';
import { COMPANION_CHAT_RETENTION_DAYS } from '@our-companion/shared';
import { t } from '../i18n';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { LoadingState } from '../components/feedback/LoadingState';
import { NotebookChatBubble, NotebookPage, useLang } from '../ui/NotebookPrimitives';
import { chatScrollBehavior, isChatNearBottom } from './chatScroll';

type ChatFilter = 'all' | CompanionMessageSource | 'errors';

export function ChatPage() {
  const lang = useLang();
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [sendError, setSendError] = useState('');
  const [clearError, setClearError] = useState('');
  const [pendingPermission, setPendingPermission] = useState<CompanionTurnResult>();
  const [remembered, setRemembered] = useState<RememberedMemoryMutation[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  const followMessagesRef = useRef(true);

  async function loadHistory({ initial = false }: { initial?: boolean } = {}) {
    if (initial) setLoading(true);
    setHistoryError('');
    try {
      setMessages(await window.ourCompanion.companion.getHistory({ limit: 200 }));
    } catch {
      setHistoryError(t(lang, 'chat_history_error'));
    } finally {
      if (initial) setLoading(false);
    }
  }
  useEffect(() => { void loadHistory({ initial: true }); }, []);
  useEffect(() => {
    const container = messagesRef.current;
    if (!container || !followMessagesRef.current) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    container.scrollTo({ top: container.scrollHeight, behavior: chatScrollBehavior(reducedMotion) });
  }, [messages]);
  const filtered = useMemo(() => {
    let list = messages;
    if (filter === 'errors') list = list.filter((message) => message.status !== 'ok');
    else if (filter !== 'all') list = list.filter((message) => message.source === filter);
    if (search.trim()) { const query = search.trim().toLowerCase(); list = list.filter((message) => message.content.toLowerCase().includes(query)); }
    return list;
  }, [messages, filter, search]);
  async function sendMessage() {
    const draft = input;
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setSendError('');
    try {
      const result = await window.ourCompanion.companion.turn({ message, source: 'panel_text' });
      setPendingPermission(result.kind === 'awaiting_permission' ? result : undefined);
      setRemembered(result.remembered ?? []);
      setInput((current) => current === draft ? '' : current);
      await loadHistory();
    } catch {
      setSendError(t(lang, 'chat_send_error'));
    } finally {
      setSending(false);
    }
  }
  async function resolvePermission(decision: 'allow_once' | 'always_allow' | 'cancel') {
    if (!pendingPermission) return;
    setSending(true);
    setSendError('');
    try {
      const result = await window.ourCompanion.companion.resolveTurnPermission({
        turnId: pendingPermission.turnId,
        decision,
      });
      setPendingPermission(undefined);
      setRemembered(result.remembered ?? remembered);
      await loadHistory();
    } catch {
      setSendError(t(lang, 'chat_send_error'));
    } finally {
      setSending(false);
    }
  }
  async function undoMemory(item: RememberedMemoryMutation) {
    const result = await window.ourCompanion.companion.undoRememberedMemory(item.undoToken);
    if (result.undone) setRemembered((current) => current.filter((memory) => memory.undoToken !== item.undoToken));
  }
  async function clearHistory() {
    setClearing(true);
    setClearError('');
    try {
      await window.ourCompanion.companion.clearHistory();
      setMessages([]);
      setConfirmClear(false);
    } catch {
      setClearError(t(lang, 'chat_clear_error'));
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  }
  const filters: { key: ChatFilter; label: string }[] = [
    { key: 'all', label: t(lang, 'chat_filter_all') }, { key: 'voice', label: t(lang, 'chat_filter_voice') }, { key: 'panel', label: t(lang, 'chat_filter_panel') }, { key: 'errors', label: t(lang, 'chat_filter_errors') },
  ];
  const bubbleSpeaker = (message: CompanionMessage): 'companion' | 'user' | 'system' => message.role === 'assistant' ? 'companion' : message.role === 'user' ? 'user' : 'system';
  const sourceBadge = (message: CompanionMessage): string | null => message.status !== 'ok' ? message.status === 'empty_transcript' ? t(lang, 'badge_no_audio') : t(lang, 'badge_error') : message.source === 'voice' ? t(lang, 'badge_voice') : message.source === 'panel' ? t(lang, 'badge_panel') : null;
  const formatTime = (iso: string) => { const date = new Date(iso); return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`; };
  return (
    <>
      <NotebookPage eyebrow={t(lang, 'chat_eyebrow')} title={t(lang, 'chat_title')} note={t(lang, 'chat_note')} marker="conversation">
        <section className="chat-paper chat-view">
          <div className="chat-toolbar"><div className="chat-filter-chips">{filters.map(({ key, label }) => <button key={key} className={`chip${filter === key ? ' active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div><input className="chat-search" placeholder={t(lang, 'chat_search_placeholder')} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div
            className="chat-messages"
            ref={messagesRef}
            onScroll={(event) => { followMessagesRef.current = isChatNearBottom(event.currentTarget); }}
          >
            {loading && <LoadingState label={t(lang, 'chat_loading')} />}
            {historyError && <InlineNotice tone="error" action={<button type="button" onClick={() => void loadHistory({ initial: true })}>{t(lang, 'feedback_retry')}</button>}>{historyError}</InlineNotice>}
            {!loading && !historyError && filtered.length === 0 && <p className="chat-empty">{t(lang, 'chat_empty')}</p>}
            {filtered.map((message) => { const badge = sourceBadge(message); return <NotebookChatBubble key={message.id} speaker={bubbleSpeaker(message)} time={formatTime(message.createdAt)} meta={badge ? <span className={`source-badge ${message.status !== 'ok' ? 'error' : message.source}`}>{badge}</span> : undefined}>{message.source === 'voice' && message.role === 'user' && <span className="voice-transcription-label">{t(lang, 'voice_transcribed')}</span>}{message.content}</NotebookChatBubble>; })}
          </div>
          <div className="chat-composer">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={t(lang, 'chat_composer_placeholder')} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} />
            <div className="action-row"><button onClick={() => void sendMessage()} disabled={sending || clearing || !input.trim()}>{sending ? t(lang, 'chat_sending') : t(lang, 'chat_send')}</button><button className="btn-ghost" disabled={sending || clearing} onClick={() => { setClearError(''); setConfirmClear(true); }}>{t(lang, 'chat_clear')}</button></div>
            {sendError && <InlineNotice tone="error">{sendError}</InlineNotice>}
            {pendingPermission && (
              <InlineNotice
                tone="warning"
                action={(
                <div className="action-row">
                  <button disabled={sending} onClick={() => void resolvePermission('allow_once')}>{t(lang, 'turn_allow_once')}</button>
                  <button disabled={sending} onClick={() => void resolvePermission('always_allow')}>{t(lang, 'turn_always_allow')}</button>
                  <button disabled={sending} onClick={() => void resolvePermission('cancel')}>{t(lang, 'turn_cancel')}</button>
                </div>
                )}
              >
                {pendingPermission.message}
              </InlineNotice>
            )}
            {remembered.map((item) => (
              <InlineNotice
                key={item.undoToken}
                tone="success"
                action={<button type="button" onClick={() => void undoMemory(item)}>{t(lang, 'memory_undo')}</button>}
              >
                {t(lang, 'memory_remembered', { summary: item.summary })}
              </InlineNotice>
            ))}
            {clearError && <InlineNotice tone="error">{clearError}</InlineNotice>}
            <p className="chat-retention-note">{t(lang, 'chat_retention_note', { days: COMPANION_CHAT_RETENTION_DAYS })}</p>
          </div>
        </section>
      </NotebookPage>
      <ConfirmDialog
        open={confirmClear}
        title={t(lang, 'chat_clear_confirm')}
        description={t(lang, 'chat_clear_description')}
        confirmLabel={t(lang, 'chat_clear_yes')}
        busy={clearing}
        danger
        onConfirm={() => void clearHistory()}
        onClose={() => setConfirmClear(false)}
      />
    </>
  );
}
