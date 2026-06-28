import { useEffect, useRef, useState } from 'react';
import type { PresentationCandidate } from './PresentationCandidate';
import { titleFallback, bodyFallback } from './PresentationCandidate';

export interface DiscoveryPopoutCardProps {
  candidate: PresentationCandidate;
  loading?: boolean;
  error?: string | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onView?: () => void;
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
  onView,
  onSave,
  onAddToJourney,
  onIgnore,
  onClose,
  style
}: DiscoveryPopoutCardProps) {
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

  const displayTitle = titleFallback(candidate);
  const displayBody = bodyFallback(candidate);

  return (
    <div
      className={`discovery-popout-card card-mood-calm ${visible && !exiting ? 'card-visible' : ''} ${exiting ? 'card-exiting' : ''}`}
      role="article"
      aria-label={`Discovery: ${displayTitle}`}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="card-header">
        <span className="card-source-badge">{candidate.sourceName ?? 'discovery'}</span>
        <button className="card-close-btn" onClick={handleClose} aria-label="Close">✕</button>
      </div>
      <h3 className="card-title">{displayTitle}</h3>
      <p className="card-hook">{candidate.oneLineHook}</p>
      <p className="card-body">{displayBody}</p>
      {candidate.sourceUrl && (
        <button className="card-source-link" onClick={handleOpenSource}>
          View source
        </button>
      )}
      {candidate.tags && candidate.tags.length > 0 && (
        <div className="card-tags">
          {candidate.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="card-tag">{tag}</span>
          ))}
        </div>
      )}
      {error && <p className="card-error">{error}</p>}
      <div className="card-actions">
        {onView && <button className="card-action-btn" disabled={loading} onClick={onView}>View</button>}
        {onSave && <button className="card-action-btn card-action-primary" disabled={loading} onClick={() => void handleAsyncAction(onSave)}>{loading ? 'Saving…' : 'Save'}</button>}
        {onAddToJourney && <button className="card-action-btn" disabled={loading} onClick={() => void handleAsyncAction(onAddToJourney)}>{loading ? 'Adding…' : 'Add to Journey'}</button>}
        {onIgnore && <button className="card-action-btn card-action-ghost" disabled={loading} onClick={() => void handleAsyncAction(onIgnore)}>Ignore</button>}
      </div>
    </div>
  );
}
