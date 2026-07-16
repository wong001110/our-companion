import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompanionMessage, CompanionMessageSource } from '@our-companion/shared';
import { COMPANION_CHAT_RETENTION_DAYS } from '@our-companion/shared';
import { t } from '../i18n';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { NotebookChatBubble, NotebookPage, useLang } from '../ui/NotebookPrimitives';

type ChatFilter = 'all' | CompanionMessageSource | 'errors';

export function ChatPage() {
  const lang = useLang();
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadHistory() { setMessages(await window.ourCompanion.companion.getHistory({ limit: 200 })); }
  useEffect(() => { void loadHistory(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  const filtered = useMemo(() => {
    let list = messages;
    if (filter === 'errors') list = list.filter((message) => message.status !== 'ok');
    else if (filter !== 'all') list = list.filter((message) => message.source === filter);
    if (search.trim()) { const query = search.trim().toLowerCase(); list = list.filter((message) => message.content.toLowerCase().includes(query)); }
    return list;
  }, [messages, filter, search]);
  async function sendMessage() {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true); setInput('');
    try { await window.ourCompanion.ai.chat({ message }); await loadHistory(); } finally { setSending(false); }
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
      <NotebookPage eyebrow={t(lang, 'chat_eyebrow')} title={t(lang, 'chat_title')} note={t(lang, 'chat_note')}>
        <section className="chat-paper chat-view">
          <div className="chat-toolbar"><div className="chat-filter-chips">{filters.map(({ key, label }) => <button key={key} className={`chip${filter === key ? ' active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div><input className="chat-search" placeholder={t(lang, 'chat_search_placeholder')} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="chat-messages">
            {filtered.length === 0 && <p className="chat-empty">{t(lang, 'chat_empty')}</p>}
            {filtered.map((message) => { const badge = sourceBadge(message); return <NotebookChatBubble key={message.id} speaker={bubbleSpeaker(message)} time={formatTime(message.createdAt)} meta={badge ? <span className={`source-badge ${message.status !== 'ok' ? 'error' : message.source}`}>{badge}</span> : undefined}>{message.source === 'voice' && message.role === 'user' && <span className="voice-transcription-label">{t(lang, 'voice_transcribed')}</span>}{message.content}</NotebookChatBubble>; })}
            <div ref={bottomRef} />
          </div>
          <div className="chat-composer">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={t(lang, 'chat_composer_placeholder')} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} />
            <div className="action-row"><button onClick={() => void sendMessage()} disabled={sending || !input.trim()}>{sending ? t(lang, 'chat_sending') : t(lang, 'chat_send')}</button><button className="btn-ghost" onClick={() => { setClearError(''); setConfirmClear(true); }}>{t(lang, 'chat_clear')}</button></div>
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
