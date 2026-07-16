import type { NetworkStatus } from '@our-companion/shared';
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';
import {
  canRetryNetworkState,
  networkStatePresentation,
  type OperationalTone,
} from '../../features/operational/operationalState';
import { LoadingState } from './LoadingState';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: OperationalTone }) {
  return <span className={`status-badge status-badge-${tone}`}><span className="status-badge-marker" aria-hidden="true" />{label}</span>;
}

export function ConnectionBanner({ status, stale = false, onRetry, action }: { status: NetworkStatus; stale?: boolean; onRetry?: () => void; action?: ReactNode }) {
  const lang = useLang();
  const presentation = networkStatePresentation(status.state);
  return <section className={`connection-banner connection-banner-${presentation.tone}`} data-connection-state={status.state} aria-live="polite">
    <div className="connection-banner-copy">
      <div className="connection-banner-heading">
        <StatusBadge label={t(lang, status.onlineModeEnabled ? 'online_mode_enabled' : 'online_mode_disabled')} tone={status.onlineModeEnabled ? 'info' : 'neutral'} />
        <StatusBadge label={t(lang, presentation.labelKey)} tone={presentation.tone} />
      </div>
      {presentation.detailKey && <p>{t(lang, presentation.detailKey)}</p>}
      {stale && <p className="connection-banner-stale">{t(lang, 'operational_content_stale')}</p>}
    </div>
    {action ?? (onRetry && canRetryNetworkState(status.state) && <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>{t(lang, 'feedback_retry')}</button>)}
  </section>;
}

export function StateReason({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} className="state-reason">{children}</p>;
}

export function OperationalRow({ label, identity, status, supporting, actions, reason, testId }: {
  label: string;
  identity: ReactNode;
  status?: { label: string; tone?: OperationalTone };
  supporting?: ReactNode;
  actions?: ReactNode;
  reason?: ReactNode;
  testId?: string;
}) {
  return <div role="group" aria-label={label} data-testid={testId} className="operational-row">
    <div className="operational-row-main"><div className="operational-row-identity">{identity}</div>{status && <StatusBadge label={status.label} tone={status.tone} />}</div>
    {supporting && <div className="operational-row-supporting">{supporting}</div>}
    {actions && <div className="operational-row-actions">{actions}</div>}
    {reason && <StateReason>{reason}</StateReason>}
  </div>;
}

export function SectionLoading({ label }: { label?: string }) {
  return <div className="section-feedback"><LoadingState label={label} /></div>;
}

export function SectionPartialError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const lang = useLang();
  return <div className="section-partial-error" role="status" aria-live="polite"><span>{message}</span>{onRetry && <button type="button" className="btn-ghost btn-sm" onClick={onRetry}>{t(lang, 'feedback_retry')}</button>}</div>;
}
