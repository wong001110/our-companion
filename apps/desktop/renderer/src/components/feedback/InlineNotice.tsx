import type { ReactNode } from 'react';

export function InlineNotice({ children, tone = 'warning', action }: { children: ReactNode; tone?: 'warning' | 'error' | 'success'; action?: ReactNode }) {
  return <div className={`inline-notice inline-notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'}><span>{children}</span>{action}</div>;
}
