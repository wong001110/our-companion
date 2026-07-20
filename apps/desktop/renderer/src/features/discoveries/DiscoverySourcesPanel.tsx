import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  AddDiscoveryBaseInput,
  CompanionDiscoveryChannel,
  CompanionDiscoveryProfile,
  DiscoveryBase,
  DiscoveryBaseState,
  DiscoveryBootstrapResult,
  DiscoveryChannelState,
  DiscoveryPlatformId,
  UserDiscoverySourceType,
  WebSearchProviderDiagnostics,
} from '@our-companion/shared';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { EmptyState } from '../../components/feedback/EmptyState';
import { InlineNotice } from '../../components/feedback/InlineNotice';
import { LoadingState } from '../../components/feedback/LoadingState';
import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

const SOURCE_TYPES: UserDiscoverySourceType[] = ['query', 'domain', 'page', 'feed'];
const CHANNEL_LABELS: Record<DiscoveryPlatformId, string> = {
  'generic-web': 'Open Web',
  reddit: 'Reddit',
  youtube: 'YouTube',
  github: 'GitHub',
  bilibili: 'Bilibili',
};
const CHANNEL_KINDS: Record<DiscoveryPlatformId, string> = {
  'generic-web': 'web',
  reddit: 'discussion',
  youtube: 'video',
  github: 'code',
  bilibili: 'video',
};

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
  if (message.includes('DISCOVERY_CHANNEL_NOT_ENABLED')) return 'Enable this channel before exploring it.';
  if (message.includes('browser_search_timeout')) return 'Local web search timed out. Please try again later.';
  if (message.includes('browser_search_navigation_failed')) return 'Local web search could not load the search page.';
  if (message.includes('browser_search_http_blocked')) return 'Local web search blocked an unsafe response.';
  if (message.includes('browser_search_challenge')) return 'Search page requested human verification. Automated exploration has been temporarily paused.';
  if (message.includes('browser_search_parse_failed')) return 'Search page structure changed.暂时无法读取结果。';
  if (message.includes('browser_search_no_results')) return '这次没有找到符合条件的公开结果。';
  if (message.includes('browser_search_destroyed')) return 'Local web search worker was destroyed.';
  if (message.includes('browser_search_rate_limited')) return 'Local web search is temporarily rate-limited.';
  if (message.includes('browser_search_unavailable')) return 'Local web search is currently unavailable, but RSS and pinned sources still work.';
  return fallback;
}

function isPinnedSource(base: DiscoveryBase): boolean {
  if (base.data.managedBy === 'personality_platform_seed' && typeof base.data.platformId === 'string' && !base.data.curatedFeedId) {
    return false;
  }
  if (base.data.managedBy === 'personality_seed') return false;
  return true;
}

export function DiscoverySourcesPanel({ onFeedRefresh }: { onFeedRefresh(): Promise<void> }) {
  const lang = useLang();
  const [bases, setBases] = useState<DiscoveryBase[]>([]);
  const [channels, setChannels] = useState<CompanionDiscoveryChannel[]>([]);
  const [profile, setProfile] = useState<CompanionDiscoveryProfile | null>(null);
  const [bootstrap, setBootstrap] = useState<DiscoveryBootstrapResult | null>(null);
  const [autoManage, setAutoManage] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DiscoveryBase>();
  const [sourceTypeValue, setSourceTypeValue] = useState<UserDiscoverySourceType>('query');
  const [locator, setLocator] = useState('');
  const [label, setLabel] = useState('');
  const [initialState, setInitialState] = useState<'trial' | 'active'>('trial');
  const [webSearchDiagnostics, setWebSearchDiagnostics] = useState<WebSearchProviderDiagnostics | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextBases, nextChannels, nextProfile, nextBootstrap, nextAutoManage, nextDiagnostics] = await Promise.all([
        window.ourCompanion.discovery.listBases(),
        window.ourCompanion.discovery.listChannels(),
        window.ourCompanion.discovery.getDiscoveryProfile(),
        window.ourCompanion.discovery.getBootstrapStatus(),
        window.ourCompanion.discovery.getAutoManageDefaultPlatforms(),
        window.ourCompanion.discovery.getWebSearchDiagnostics(),
      ]);
      setBases(nextBases.filter(isPinnedSource));
      setChannels(nextChannels);
      setProfile(nextProfile);
      setBootstrap(nextBootstrap);
      setAutoManage(nextAutoManage);
      setWebSearchDiagnostics(nextDiagnostics);
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

  async function updateChannel(platformId: DiscoveryPlatformId, state: DiscoveryChannelState) {
    setBusyId(`channel:${platformId}`);
    setError('');
    try {
      await window.ourCompanion.discovery.updateChannelState({ platformId, state });
      await load();
    } catch {
      setError(t(lang, 'discovery_source_action_failed'));
    } finally {
      setBusyId('');
    }
  }

  async function exploreChannel(platformId: DiscoveryPlatformId) {
    setBusyId(`explore:${platformId}`);
    setError('');
    try {
      await window.ourCompanion.discovery.exploreChannelNow(platformId);
      await Promise.all([load(), onFeedRefresh()]);
    } catch (caught) {
      setError(friendlySourceError(
        caught instanceof Error ? caught.message : '',
        t(lang, 'discovery_source_run_failed'),
      ));
      try {
        const diagnostics = await window.ourCompanion.discovery.getWebSearchDiagnostics();
        setWebSearchDiagnostics(diagnostics);
      } catch { /* ignore */ }
    } finally {
      setBusyId('');
    }
  }

  async function restoreChannel(platformId: DiscoveryPlatformId) {
    setBusyId(`restore:${platformId}`);
    setError('');
    try {
      await window.ourCompanion.discovery.restoreManagedPlatform(platformId);
      await load();
    } catch {
      setError(t(lang, 'discovery_source_action_failed'));
    } finally {
      setBusyId('');
    }
  }

  async function toggleAutoManage(next: boolean) {
    setBusyId('auto-manage');
    setError('');
    try {
      setAutoManage(await window.ourCompanion.discovery.setAutoManageDefaultPlatforms(next));
    } catch {
      setError(t(lang, 'discovery_source_action_failed'));
    } finally {
      setBusyId('');
    }
  }

  const visibleChannels = channels.filter((channel) => channel.state !== 'suppressed');
  const suppressed = channels.filter((channel) => channel.state === 'suppressed');
  const showProviderNotice = bootstrap?.status === 'provider_unavailable'
    || bootstrap?.status === 'planner_unavailable'
    || bases.some((base) => base.data.lastResult === 'provider_unavailable' || base.data.lastResult === 'not_executed');

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

      <label className="discovery-auto-manage">
        <input
          type="checkbox"
          checked={autoManage}
          disabled={busyId === 'auto-manage'}
          onChange={(event) => void toggleAutoManage(event.target.checked)}
        />
        <span>
          <strong>{t(lang, 'discovery_auto_manage_title')}</strong>
          <small>{t(lang, 'discovery_auto_manage_body')}</small>
        </span>
      </label>

      {showProviderNotice && (
        <InlineNotice tone="warning">
          {t(lang, 'discovery_source_provider_unavailable_detail')}
        </InlineNotice>
      )}
      {error && <InlineNotice tone="error" action={<button type="button" onClick={() => void load()}>{t(lang, 'feedback_retry')}</button>}>{error}</InlineNotice>}

      {loading ? <LoadingState /> : (
        <>
          {profile && profile.interests.length > 0 && (
            <div className="discovery-source-group">
              <h3>{t(lang, 'discovery_interest_profile_title')}</h3>
              <ul className="discovery-interest-list">
                {profile.interests.map((interest) => <li key={interest}>{interest}</li>)}
              </ul>
            </div>
          )}

          <div className="discovery-source-group">
            <h3>{t(lang, 'discovery_channels_title')}</h3>
            <div className="discovery-channel-grid">
              {visibleChannels.map((channel) => {
                const busy = busyId === `channel:${channel.platformId}` || busyId === `explore:${channel.platformId}`;
                const enabled = channel.state === 'enabled';
                return (
                  <article key={channel.platformId} className={`discovery-channel-card channel-state-${channel.state}`}>
                    <header>
                      <strong>{CHANNEL_LABELS[channel.platformId]}</strong>
                      <span className="source-platform-badge">{CHANNEL_KINDS[channel.platformId]}</span>
                    </header>
                    <p className={`source-state-badge source-state-${channel.state === 'enabled' ? 'active' : channel.state}`}>
                      {channel.state}
                    </p>
                    <small>{channel.lastPlanningReason || t(lang, 'discovery_channel_no_reason')}</small>
                    <small>{formatDate(channel.lastUsedAt, lang, t(lang, 'discovery_source_never'))}</small>
                    <div className="source-action-menu">
                      <button type="button" disabled={busy || !enabled} onClick={() => void exploreChannel(channel.platformId)}>
                        {t(lang, 'discovery_channel_explore_now')}
                      </button>
                      {channel.state !== 'enabled' && (
                        <button type="button" disabled={busy} onClick={() => void updateChannel(channel.platformId, 'enabled')}>
                          {t(lang, 'discovery_source_activate')}
                        </button>
                      )}
                      {channel.state !== 'muted' && (
                        <button type="button" disabled={busy} onClick={() => void updateChannel(channel.platformId, 'muted')}>
                          {t(lang, 'discovery_source_mute')}
                        </button>
                      )}
                      {channel.state !== 'blocked' && (
                        <button type="button" disabled={busy} onClick={() => void updateChannel(channel.platformId, 'blocked')}>
                          {t(lang, 'discovery_source_block')}
                        </button>
                      )}
                      <button type="button" className="btn-danger" disabled={busy} onClick={() => void updateChannel(channel.platformId, 'suppressed')}>
                        {t(lang, 'discovery_source_suppress')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {webSearchDiagnostics && (
            <div className="discovery-source-group">
              <h3>{t(lang, 'discovery_local_web_search')}</h3>
              <div className="discovery-web-search-status">
                <span className={`source-state-badge source-state-${webSearchDiagnostics.availability === 'ready' ? 'active' : webSearchDiagnostics.availability === 'challenge' ? 'blocked' : webSearchDiagnostics.availability === 'cooldown' ? 'muted' : 'blocked'}`}>
                  {webSearchDiagnostics.availability === 'ready' && t(lang, 'discovery_local_web_search_ready')}
                  {webSearchDiagnostics.availability === 'cooldown' && t(lang, 'discovery_local_web_search_cooldown')}
                  {webSearchDiagnostics.availability === 'challenge' && t(lang, 'discovery_local_web_search_challenge')}
                  {webSearchDiagnostics.availability === 'unavailable' && t(lang, 'discovery_local_web_search_unavailable')}
                </span>
              </div>
            </div>
          )}

          <div className="discovery-source-group">
            <h3>{t(lang, 'discovery_pinned_sources_title')}</h3>
            {bases.length === 0 ? (
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
                      <th>{t(lang, 'discovery_source_column_checked')}</th>
                      <th>{t(lang, 'discovery_source_column_result')}</th>
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
                          <td>
                            <strong>{typeof base.data.label === 'string' ? base.data.label : base.locator}</strong>
                            {typeof base.data.label === 'string' && <small>{base.locator}</small>}
                          </td>
                          <td>
                            <span>{t(lang, sourceTypeKey(type))}</span>
                            <span className={`source-state-badge source-state-${base.state}`}>{t(lang, stateKey(base.state))}</span>
                          </td>
                          <td>{formatDate(base.lastCheckedAt, lang, t(lang, 'discovery_source_never'))}</td>
                          <td>{typeof base.data.lastResult === 'string' ? base.data.lastResult.replaceAll('_', ' ') : t(lang, 'discovery_source_no_result')}</td>
                          <td>
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
          </div>

          {suppressed.length > 0 && (
            <div className="discovery-source-group">
              <h3>{t(lang, 'discovery_source_suppressed_title')}</h3>
              <ul className="discovery-suppressed-list">
                {suppressed.map((entry) => (
                  <li key={entry.platformId}>
                    <span className="source-platform-badge">{CHANNEL_LABELS[entry.platformId]}</span>
                    <button type="button" disabled={busyId === `restore:${entry.platformId}`} onClick={() => void restoreChannel(entry.platformId)}>
                      {t(lang, 'discovery_source_restore')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
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
