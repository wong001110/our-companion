import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { QuickActionSide } from './quickActionLayout';

export function QuickActionBubble({ side, active, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { side: QuickActionSide; active?: boolean; children: ReactNode }) {
  return (
    <button
      {...props}
      className={`quick-action-bubble quick-action-bubble-${side}${active ? ' is-active' : ''}${props.className ? ` ${props.className}` : ''}`}
      data-side={side}
      type="button"
    >
      {children}
    </button>
  );
}
