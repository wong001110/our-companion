import { createContext, useContext, type ReactNode } from 'react';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import { formatShortDate } from './utils';

export const LangContext = createContext<Lang>('en');
export function useLang(): Lang { return useContext(LangContext); }

export function NotebookPage({ eyebrow, title, note, children }: { eyebrow: string; title: string; note?: string; children: ReactNode }) {
  return (
    <div className="notebook-page">
      <header className="notebook-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {note && <p>{note}</p>}
        </div>
        <span className="notebook-date">{formatShortDate(new Date().toISOString())}</span>
      </header>
      {children}
    </div>
  );
}

export function NotebookSectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="notebook-section-title">{children}</h2>;
}

export function PaperCard({
  title,
  tape,
  compact,
  className = '',
  children
}: {
  title?: string;
  tape?: boolean;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`paper-card ${compact ? 'paper-card-compact' : ''} ${className}`}>
      {title && (tape ? <NotebookSectionTitle>{title}</NotebookSectionTitle> : <h2>{title}</h2>)}
      {children}
    </section>
  );
}

export function StickyNote({ title, compact, className = '', children }: { title?: string; compact?: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={`sticky-note ${compact ? 'sticky-note-compact' : ''} ${className}`}>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

export function NotebookChatBubble({
  speaker,
  time,
  meta,
  children
}: {
  speaker: 'ann' | 'user' | 'system';
  time: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`notebook-chat-bubble ${speaker}`}>
      <p>{children}</p>
      <span className="bubble-footer">
        {meta && <span className="bubble-meta">{meta}</span>}
        {time}
      </span>
    </div>
  );
}

export function MiniAnnSticker() {
  return (
    <div className="mini-ann-sticker" aria-hidden="true">
      <span className="mini-ann-hair" />
      <span className="mini-ann-face" />
      <span className="mini-ann-eye left" />
      <span className="mini-ann-eye right" />
      <span className="mini-ann-body" />
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-row">
      <span className="progress-track">
        <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
      <strong>{label}</strong>
    </div>
  );
}
