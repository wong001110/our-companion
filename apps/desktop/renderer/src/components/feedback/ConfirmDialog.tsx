import { useCallback, useEffect, useRef, useState } from 'react';
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
  const initialFocusPendingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const setCancelRef = useCallback((node: HTMLButtonElement | null) => {
    cancelRef.current = node;
    if (!node || !initialFocusPendingRef.current) return;
    initialFocusPendingRef.current = false;
    node.focus();
  }, []);
  const requestClose = useCallback(() => {
    setClosing(true);
    onClose();
  }, [onClose]);
  useEffect(() => {
    if (open) {
      setClosing(false);
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      initialFocusPendingRef.current = true;
      if (cancelRef.current) {
        initialFocusPendingRef.current = false;
        cancelRef.current.focus();
      }
    } else if (openerRef.current) {
      initialFocusPendingRef.current = false;
      setClosing(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open && !closing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) requestClose();
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
  }, [busy, closing, open, requestClose]);
  return <Presence present={open} exitDurationMs={150} onExited={() => { setClosing(false); openerRef.current?.focus(); }}>{(state) => <div className="confirm-dialog-backdrop" data-motion-state={state} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) requestClose(); }}><section ref={dialogRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description"><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-description">{description}</p><div className="action-row"><button ref={setCancelRef} type="button" className="btn-secondary" disabled={busy} onClick={requestClose}>{t(lang, 'common_cancel')}</button><button type="button" className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{busy ? t(lang, 'common_working') : (confirmLabel ?? t(lang, 'common_confirm'))}</button></div></section></div>}</Presence>;
}
