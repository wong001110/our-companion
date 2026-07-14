import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Presence } from '../motion/Presence';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastMessage { id: number; message: string; kind: ToastKind; present: boolean; }

const ToastContext = createContext<{ pushToast(message: string, kind?: ToastKind): void }>({ pushToast: () => undefined });

/** A small, reusable live-region for cross-section feedback. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const pushToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1_000);
    setToasts((current) => [...current, { id, message, kind, present: true }]);
    window.setTimeout(() => setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, present: false } : toast)), 4_000);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4_160);
  }, []);
  const value = useMemo(() => ({ pushToast }), [pushToast]);
  return <ToastContext.Provider value={value}>{children}<div className="toast-region" aria-live="polite" aria-atomic="true">{toasts.map((toast) => <Presence key={toast.id} present={toast.present} exitDurationMs={140}>{(state) => <div className={`toast toast-${toast.kind}`} data-motion-state={state}>{toast.message}</div>}</Presence>)}</div></ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}
