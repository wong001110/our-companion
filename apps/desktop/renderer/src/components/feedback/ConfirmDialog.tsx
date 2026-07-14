import { useEffect, useRef } from 'react';
import { Presence } from '../motion/Presence';
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
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, open]);
  useEffect(() => {
    if (!open) openerRef.current?.focus();
  }, [open]);
  return <Presence present={open} exitDurationMs={150}>{(state) => <div className="confirm-dialog-backdrop" data-motion-state={state} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section ref={dialogRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description"><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-description">{description}</p><div className="action-row"><button ref={cancelRef} type="button" className="btn-secondary" disabled={busy} onClick={onClose}>{t(lang, 'common_cancel')}</button><button type="button" className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{busy ? t(lang, 'common_working') : (confirmLabel ?? t(lang, 'common_confirm'))}</button></div></section></div>}</Presence>;
}
