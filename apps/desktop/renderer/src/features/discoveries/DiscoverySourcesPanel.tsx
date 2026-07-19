import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  AddDiscoveryBaseInput,
  DiscoveryBase,
  DiscoveryBaseState,
  UserDiscoverySourceType,
} from '@our-companion/shared';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { EmptyState } from '../../components/feedback/EmptyState';
import { InlineNotice } from '../../components/feedback/InlineNotice';
import { LoadingState } from '../../components/feedback/LoadingState';
import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

const SOURCE_TYPES: UserDiscoverySourceType[] = ['query', 'domain', 'page', 'feed'];

function sourceType(base: DiscoveryBase): UserDiscoverySourceType {
  if (base.connectorId === 'rss' || base.scope === 'feed') return 'feed';
  if (base.scope === 'domain') return 'domain';
  if (base.scope === 'page') return 'page';
  return 'query';
}

function sourceTypeKey(type: UserDiscoverySourceType) {
  return `discovery_source_type_${type}` as const;
}

function stateKey(state: DiscoveryBaseState) {
  return `discovery_source_state_${state}` as const;
}

function formatDate(value: string | undefined, lang: 'en' | 'zh-CN', never: string) {
  if (!value) return never;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function friendlySourceError(message: string, fallback: string): string {
  if (message.includes('DISCOVERY_SOURCE_URL_NOT_PUBLIC')) return 'This address is not a public HTTP or HTTPS source.';
  if (message.includes('DISCOVERY_SOURCE_FEED_FORMAT_INVALID')) return 'This address did not return a valid RSS or Atom feed.';
  if (message.includes('DISCOVERY_SOURCE_QUERY_INVALID')) return 'Enter a topic between 3 and 500 characters.';
  if (message.includes('DISCOVERY_SOURCE_DOMAIN_INVALID')) return 'Enter a valid public domain.';
  if (message.includes('DISCOVERY_SOURCE_LIMIT')) return 'This Companion has reached the active Source limit.';
  return fallback;
}

export function DiscoverySourcesPanel({ onFeedRefresh }: { onFeedRefresh(): Promise<void> }) {
  const lang = useLang();
  const [bases, setBases] = useState<DiscoveryBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DiscoveryBase>();
  const [sourceTypeValue, setSourceTypeValue] = useState<UserDiscoverySourceType>('query');
  const [locator, setLocator] = useState('');
  const [label, setLabel] = useState('');
  const [initialState, setInitialState] = useState<'trial' | 'active'>('trial');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBases(await window.ourCompanion.discovery.listBases());
    } catch {
      setError(t(lang, 'discovery_sources_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSource(event: FormEvent) {
    event.preventDefault();
    setBusyId('add');
    setError('');
    const input: AddDiscoveryBaseInput = {
      sourceType: sourceTypeValue,
      locator,
      label: label.trim() || undefined,
      initialState,
    };
    try {
      await window.ourCompanion.discovery.addBase(input);
      setAddOpen(false);
      setLocator('');
      setLabel('');
      setInitialState('trial');
      await load();
    } catch (caught) {
      setError(friendlySourceError(
        caught instanceof Error ? caught.message : '',
        t(lang, 'discovery_source_action_failed'),
      ));
    } finally {
      setBusyId('');
    }
  }

  async function updateState(base: DiscoveryBase, state: DiscoveryBaseState) {
    setBusyId(base.id);
    setError('');
    try {
      await window.ourCompanion.discovery.updateBaseState({ baseId: base.id, state });
      await load();
    } catch {
      setError(t(lang, 'discovery_source_action_failed'));
    } finally {
      setBusyId('');
    }
  }

  async function runNow(base: DiscoveryBase) {
    setBusyId(base.id);
    setError('');
    try {
      await window.ourCompanion.discovery.runBaseNow(base.id);
      await Promise.all([load(), onFeedRefresh()]);
    } catch {
      setError(t(lang, 'discovery_source_run_failed'));
    } finally {
      setBusyId('');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await window.ourCompanion.discovery.deleteBase(deleteTarget.id);
      setDeleteTarget(undefined);
      await load();
    } catch {
      setError(t(lang, 'discovery_source_delete_failed'));
      setBusyId('');
    }
  }

  return (
    <section className="discovery-sources-panel" aria-labelledby="discovery-sources-heading">
      <div className="discovery-section-heading">
        <div>
          <h2 id="discovery-sources-heading">{t(lang, 'discovery_sources_title')}</h2>
          <p>{t(lang, 'discovery_sources_note')}</p>
        </div>
        <button type="button" className="primary-notebook-action" onClick={() => setAddOpen(true)}>
          {t(lang, 'discovery_source_add')}
        </button>
      </div>
      {error && <InlineNotice tone="error" action={<button type="button" onClick={() => void load()}>{t(lang, 'feedback_retry')}</button>}>{error}</InlineNotice>}
      {loading ? <LoadingState /> : bases.length === 0 ? (
        <EmptyState title={t(lang, 'discovery_sources_empty_title')} action={<button type="button" onClick={() => setAddOpen(true)}>{t(lang, 'discovery_source_add')}</button>}>
          {t(lang, 'discovery_sources_empty_body')}
        </EmptyState>
      ) : (
        <div className="discovery-source-table-wrap">
          <table className="discovery-source-table">
            <thead>
              <tr>
                <th>{t(lang, 'discovery_source_column_source')}</th>
                <th>{t(lang, 'discovery_source_column_type_state')}</th>
                <th>{t(lang, 'discovery_source_column_origin')}</th>
                <th>{t(lang, 'discovery_source_column_checked')}</th>
                <th>{t(lang, 'discovery_source_column_result')}</th>
                <th>{t(lang, 'discovery_source_column_created')}</th>
                <th>{t(lang, 'discovery_source_column_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {bases.map((base) => {
                const type = sourceType(base);
                const isBusy = busyId === base.id;
                const runnable = base.state === 'trial' || base.state === 'active';
                return (
                  <tr key={base.id}>
                    <td data-label={t(lang, 'discovery_source_column_source')}>
                      <strong>{typeof base.data.label === 'string' ? base.data.label : base.locator}</strong>
                      {typeof base.data.label === 'string' && <small>{base.locator}</small>}
                    </td>
                    <td data-label={t(lang, 'discovery_source_column_type_state')}>
                      <span>{t(lang, sourceTypeKey(type))}</span>
                      <span className={`source-state-badge source-state-${base.state}`}>{t(lang, stateKey(base.state))}</span>
                    </td>
                    <td data-label={t(lang, 'discovery_source_column_origin')}>{t(lang, `discovery_source_origin_${base.origin}` as Parameters<typeof t>[1])}</td>
                    <td data-label={t(lang, 'discovery_source_column_checked')}>{formatDate(base.lastCheckedAt, lang, t(lang, 'discovery_source_never'))}</td>
                    <td data-label={t(lang, 'discovery_source_column_result')}>{typeof base.data.lastResult === 'string' ? base.data.lastResult.replaceAll('_', ' ') : t(lang, 'discovery_source_no_result')}</td>
                    <td data-label={t(lang, 'discovery_source_column_created')}>{formatDate(base.discoveredAt, lang, t(lang, 'discovery_source_never'))}</td>
                    <td data-label={t(lang, 'discovery_source_column_actions')}>
                      <div className="source-action-menu">
                        <button type="button" disabled={isBusy || !runnable} onClick={() => void runNow(base)}>{t(lang, 'discovery_source_run_now')}</button>
                        {base.state !== 'active' && <button type="button" disabled={isBusy} onClick={() => void updateState(base, 'active')}>{t(lang, 'discovery_source_activate')}</button>}
                        {base.state !== 'muted' && <button type="button" disabled={isBusy} onClick={() => void updateState(base, 'muted')}>{t(lang, 'discovery_source_mute')}</button>}
                        {base.state !== 'blocked' && <button type="button" disabled={isBusy} onClick={() => void updateState(base, 'blocked')}>{t(lang, 'discovery_source_block')}</button>}
                        <button type="button" className="btn-danger" disabled={isBusy} onClick={() => setDeleteTarget(base)}>{t(lang, 'discovery_source_delete')}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <div className="confirm-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busyId !== 'add') setAddOpen(false); }}>
          <form className="confirm-dialog discovery-source-dialog" role="dialog" aria-modal="true" aria-labelledby="add-source-title" onSubmit={(event) => void addSource(event)}>
            <h2 id="add-source-title">{t(lang, 'discovery_source_add_title')}</h2>
            <label>
              <span>{t(lang, 'discovery_source_type_label')}</span>
              <select value={sourceTypeValue} onChange={(event) => setSourceTypeValue(event.target.value as UserDiscoverySourceType)}>
                {SOURCE_TYPES.map((type) => <option key={type} value={type}>{t(lang, sourceTypeKey(type))}</option>)}
              </select>
            </label>
            <label>
              <span>{t(lang, 'discovery_source_locator_label')}</span>
              <input autoFocus required value={locator} onChange={(event) => setLocator(event.target.value)} placeholder={t(lang, `discovery_source_placeholder_${sourceTypeValue}` as Parameters<typeof t>[1])} />
            </label>
            <label>
              <span>{t(lang, 'discovery_source_optional_label')}</span>
              <input maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label>
              <span>{t(lang, 'discovery_source_initial_state')}</span>
              <select value={initialState} onChange={(event) => setInitialState(event.target.value as 'trial' | 'active')}>
                <option value="trial">{t(lang, 'discovery_source_state_trial')}</option>
                <option value="active">{t(lang, 'discovery_source_state_active')}</option>
              </select>
            </label>
            <div className="action-row">
              <button type="button" className="btn-secondary" disabled={busyId === 'add'} onClick={() => setAddOpen(false)}>{t(lang, 'common_cancel')}</button>
              <button type="submit" className="btn-primary" disabled={busyId === 'add'}>{busyId === 'add' ? t(lang, 'common_working') : t(lang, 'discovery_source_add')}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t(lang, 'discovery_source_delete_title')}
        description={t(lang, 'discovery_source_delete_description', { source: deleteTarget?.locator ?? '' })}
        confirmLabel={t(lang, 'discovery_source_delete')}
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        danger
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
