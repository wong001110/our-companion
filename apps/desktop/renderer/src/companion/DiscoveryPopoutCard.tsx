import { useEffect, useRef, useState } from 'react';
import type { PresentationCandidate } from './PresentationCandidate';
import { titleFallback, bodyFallback } from './PresentationCandidate';

export interface DiscoveryPopoutCardProps {
  candidate: PresentationCandidate;
  onView?: () => void;
  onSave?: () => void;
  onAddToJourney?: () => void;
  onIgnore?: () => void;
  onClose?: () => void;
  style?: React.CSSProperties;
}

const AUTO_DISMISS_MS = 12000;

export function DiscoveryPopoutCard({
  candidate,
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
    if (!visible) return;
    timerRef.current = window.setTimeout(() => {
      handleClose();
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, [visible]);

  function handleClose() {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => onClose?.(), 300);
  }

  function handleAction(action: () => void) {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    action();
    handleClose();
  }

  const displayTitle = titleFallback(candidate);
  const displayBody = bodyFallback(candidate);

  const moodClass = 'card-mood-calm';

  return (
    <div
      className={`discovery-popout-card ${moodClass} ${visible && !exiting ? 'card-visible' : ''} ${exiting ? 'card-exiting' : ''}`}
      role="article"
      aria-label={`Discovery: ${displayTitle}`}
      style={style}
    >
      <div className="card-header">
        <span className="card-source-badge">{candidate.sourceName ?? 'discovery'}</span>
        <button className="card-close-btn" onClick={handleClose} aria-label="Close">✕</button>
      </div>
      <h3 className="card-title">{displayTitle}</h3>
      <p className="card-hook">{candidate.oneLineHook}</p>
      <p className="card-body">{displayBody}</p>
      {candidate.sourceUrl && (
        <a className="card-source-link" href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">
          View source
        </a>
      )}
      {candidate.tags && candidate.tags.length > 0 && (
        <div className="card-tags">
          {candidate.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="card-tag">{tag}</span>
          ))}
        </div>
      )}
      <div className="card-actions">
        {onView && <button className="card-action-btn" onClick={() => handleAction(onView)}>View</button>}
        {onSave && <button className="card-action-btn card-action-primary" onClick={() => handleAction(onSave)}>Save</button>}
        {onAddToJourney && <button className="card-action-btn" onClick={() => handleAction(onAddToJourney)}>Add to Journey</button>}
        {onIgnore && <button className="card-action-btn card-action-ghost" onClick={() => handleAction(onIgnore)}>Ignore</button>}
      </div>
    </div>
  );
}
