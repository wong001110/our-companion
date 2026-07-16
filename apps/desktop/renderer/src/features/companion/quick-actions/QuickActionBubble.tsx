import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { QuickActionSide } from './quickActionLayout';

export function QuickActionBubble({ side, active, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { side: QuickActionSide; active?: boolean; children: ReactNode }) {
  return (
    <span className="quick-action-bubble-position" style={props.style}>
      <button
        {...props}
        style={undefined}
        className={`quick-action-bubble${active ? ' is-active' : ''}${props.className ? ` ${props.className}` : ''}`}
        data-side={side}
        type="button"
      >
        <span className="quick-action-bubble-float">
          <span className={`quick-action-bubble-surface quick-action-bubble-${side}`}>{children}</span>
        </span>
      </button>
    </span>
  );
}
