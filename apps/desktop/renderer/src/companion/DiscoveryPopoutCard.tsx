import { useEffect, useRef, useState } from 'react';
import type { PresentationCandidate } from './PresentationCandidate';
import { titleFallback, bodyFallback } from './PresentationCandidate';
import { t } from '../i18n';
import { useLang } from '../ui/NotebookPrimitives';

export interface DiscoveryPopoutCardProps {
  candidate: PresentationCandidate;
  loading?: boolean;
  error?: string | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onSave?: () => Promise<void>;
  onAddToJourney?: () => Promise<void>;
  onIgnore?: () => Promise<void>;
  onClose?: () => void;
  style?: React.CSSProperties;
}

const AUTO_DISMISS_MS = 12000;

export function DiscoveryPopoutCard({
  candidate,
  loading = false,
  error = null,
  onMouseEnter,
  onMouseLeave,
  onSave,
  onAddToJourney,
  onIgnore,
  onClose,
  style
}: DiscoveryPopoutCardProps) {
  const lang = useLang();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const enterTimer = window.setTimeout(() => setVisible(true), 50);
    return () => window.clearTimeout(enterTimer);
  }, []);

  useEffect(() => {
    if (!visible || loading) return;
    timerRef.current = window.setTimeout(() => {
      handleClose();
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, [visible, loading]);

  function handleClose() {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => onClose?.(), 300);
  }

  async function handleAsyncAction(action: () => Promise<void>) {
    if (loading) return;
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    await action();
  }

  function handleOpenSource() {
    if (!candidate.sourceUrl) return;
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    void window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: candidate.sourceUrl } }).catch(() => undefined);
    handleClose();
  }

  const source = candidate.sourceName ?? t(lang, 'discovery_source_fallback');
  const displayTitle = titleFallback(candidate, t(lang, 'discovery_title_fallback', { source }));
  const displayBody = bodyFallback(candidate, t(lang, 'discovery_body_fallback'));

  return (
    <div
      className={`discovery-popout-card card-mood-calm ${visible && !exiting ? 'card-visible' : ''} ${exiting ? 'card-exiting' : ''}`}
      role="article"
      aria-label={t(lang, 'discovery_card_label', { title: displayTitle })}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="card-header">
        <span className="card-source-badge">{source}</span>
        <button className="card-close-btn" onClick={handleClose} aria-label={t(lang, 'aria_close')}>✕</button>
      </div>
      <h3 className="card-title">{displayTitle}</h3>
      <p className="card-hook">{candidate.oneLineHook}</p>
      <p className="card-body">{displayBody}</p>
      {candidate.tags && candidate.tags.length > 0 && (
        <div className="card-tags">
          {candidate.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="card-tag">{tag}</span>
          ))}
        </div>
      )}
      {error && <p className="card-error">{error}</p>}
      <div className="card-actions">
        {candidate.sourceUrl && <button className="card-action-btn" disabled={loading} onClick={handleOpenSource}>{t(lang, 'discovery_view_source')}</button>}
        {onSave && <button className="card-action-btn card-action-primary" disabled={loading} onClick={() => void handleAsyncAction(onSave)}>{loading ? t(lang, 'discovery_saving') : t(lang, 'discovery_save')}</button>}
        {onAddToJourney && <button className="card-action-btn" disabled={loading} onClick={() => void handleAsyncAction(onAddToJourney)}>{loading ? t(lang, 'discovery_adding') : t(lang, 'discovery_add_to_journey')}</button>}
        {onIgnore && <button className="card-action-btn card-action-ghost" disabled={loading} onClick={() => void handleAsyncAction(onIgnore)}>{t(lang, 'discovery_ignore')}</button>}
      </div>
    </div>
  );
}
