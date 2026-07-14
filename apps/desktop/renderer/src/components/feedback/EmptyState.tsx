import type { ReactNode } from 'react';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <section className="empty-state" aria-live="polite"><h2>{title}</h2>{children && <p>{children}</p>}{action}</section>;
}
