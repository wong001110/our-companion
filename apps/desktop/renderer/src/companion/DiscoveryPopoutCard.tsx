import { useEffect, useRef, useState } from 'react';

export interface DiscoveryPopoutCardProps {
  title: string;
  cardBody: string;
  tags?: string[];
  source?: string;
  sourceUrl?: string;
  recommendedAction?: 'view' | 'save' | 'ignore' | 'add_to_journey';
  onView?: () => void;
  onSave?: () => void;
  onAddToJourney?: () => void;
  onIgnore?: () => void;
  onClose?: () => void;
}

const AUTO_DISMISS_MS = 12000;

export function DiscoveryPopoutCard({
  title,
  cardBody,
  tags,
  source,
  sourceUrl,
  recommendedAction,
  onView,
  onSave,
  onAddToJourney,
  onIgnore,
  onClose
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

  const moodClass = recommendedAction === 'save' ? 'card-mood-excited'
    : recommendedAction === 'add_to_journey' ? 'card-mood-curious'
    : recommendedAction === 'ignore' ? 'card-mood-calm'
    : 'card-mood-calm';

  const displayTitle = title || `Discovery from ${source ?? 'unknown'}`;
  const displayBody = cardBody || 'Ann found something worth looking at.';

  return (
    <div
      className={`discovery-popout-card ${moodClass} ${visible && !exiting ? 'card-visible' : ''} ${exiting ? 'card-exiting' : ''}`}
      role="article"
      aria-label={`Discovery: ${displayTitle}`}
    >
      <div className="card-header">
        <span className="card-source-badge">{source ?? 'discovery'}</span>
        <button className="card-close-btn" onClick={handleClose} aria-label="Close">✕</button>
      </div>
      <h3 className="card-title">{displayTitle}</h3>
      <p className="card-body">{displayBody}</p>
      {sourceUrl && (
        <a className="card-source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
          View source
        </a>
      )}
      {tags && tags.length > 0 && (
        <div className="card-tags">
          {tags.slice(0, 5).map((tag) => (
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
