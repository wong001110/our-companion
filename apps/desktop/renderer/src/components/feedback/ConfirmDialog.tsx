import { useEffect, useRef } from 'react';
import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

export function ConfirmDialog({ open, title, description, confirmLabel, busy = false, danger = false, onConfirm, onClose }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm(): void;
  onClose(): void;
}) {
  const lang = useLang();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, open]);
  if (!open) return null;
  return <div className="confirm-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description"><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-description">{description}</p><div className="action-row"><button ref={cancelRef} type="button" className="btn-secondary" disabled={busy} onClick={onClose}>{t(lang, 'common_cancel')}</button><button type="button" className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{busy ? t(lang, 'common_working') : (confirmLabel ?? t(lang, 'common_confirm'))}</button></div></section></div>;
}
