import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActionPermissionState,
  ActionPlanV2,
  ActionResult,
  AiDebugEntry,
  CharacterBehaviorSettings,
  CharacterProfile,
  CharacterRuntimeState,
  CompanionMessage,
  CompanionMessageSource,
  DebugDataResetTarget,
  DiaryEntry,
  Discovery,
  DiscoveryAnnouncePayload,
  EngineSnapshot,
  ExplorationCycleResult,
  ExplorationLoopEvent,
  CompanionJourney,
  JourneyMilestoneV2,
  KnowledgeGraph,
  KnowledgeGraphNode,
  NetworkStatus,
  VisitInvitationSummary,
  VisitSessionSummary,
  PermissionScope,
  PerformanceScriptV2,
  SpeechSettings,
  SpeechStatus,
  ToolExecutionResult,
  ToolPreview,
  UpdateSpeechSettingsInput,
  PendingCompanionAction
} from '@our-companion/shared';
import { COMPANION_CHAT_RETENTION_DAYS } from '@our-companion/shared';
import { t, type Lang } from '../i18n';
import { getWalkDelay, getWalkDelayRange, selectSpeechLine } from '../companion/runtime/companionBehavior';
import { getIdleRotationDelay, isIdleState, selectWeightedIdleAnimation } from '../companion/runtime/idleBehavior';
import { TypewriterSpeechBubble } from '../companion/TypewriterSpeechBubble';
import { DiscoveryPopoutCard } from '../companion/DiscoveryPopoutCard';
import { useCompanionSession } from '../companion/useCompanionSession';
import { useSpeech } from '../companion/useSpeech';
import { useDiscoveryPresentation } from '../companion/useDiscoveryPresentation';
import type { PresentationCandidate } from '../companion/PresentationCandidate';
import { CompanionCanvas, type AnimationName, type CompanionDragPoint } from '../ui/CompanionCanvas';
import { LangContext, useLang, NotebookPage, PaperCard, StickyNote, NotebookChatBubble } from '../ui/NotebookPrimitives';
import { EngineObservatory } from '../features/developer/EngineObservatory';
import { EngineObservatoryToolbar, loadObservatoryState, type EnginePanelKey } from '../features/developer/EngineObservatoryToolbar';
import { EngineSnapshotCard } from '../features/developer/EngineSnapshotCard';
import { useAudioCapture } from '../companion/useAudioCapture';
import {
  type Tab, type DevAnimation, getDevAnimationsForAssets, formatJson, formatDuration,
  formatDiscoveryTime, formatRelativeDate, formatShortDate, formatAskResult,
  readable, capitalize, randomBetween, clamp, easeInOut,
  companionStatusMessage, companionMoodLabel, debugPreview,
  createDevAnimationState, parseLocalCommand
} from '../ui/utils';
import { DebugJsonBlock, DebugTextBlock } from '../ui/DebugComponents';
import { useFloatingPlacement } from '../companion/useFloatingPlacement';
import { CompanionQuickActions } from '../companion/CompanionQuickActions';
import { useQuickActionVisibility } from '../features/companion/quick-actions/useQuickActionVisibility';
import { MemoriesPage } from '../pages/MemoriesPage';
import { HomePage } from '../pages/HomePage';
import { DiscoveriesPage } from '../pages/DiscoveriesPage';
import { JourneysPage } from '../pages/JourneysPage';
import { ChatPage } from '../pages/ChatPage';
import { SocialPage } from '../pages/SocialPage';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { ConnectionBanner } from '../components/feedback/OperationalState';
import { LoadingState } from '../components/feedback/LoadingState';
import { ResponsiveNavigation } from '../layouts/ResponsiveNavigation';
import { CompanionEntryShell, PresenceActivityReporter } from '../app/CompanionEntryShell';
import { CreationShell } from '../app/CreationShell';
import { DragHandle } from '../companion/DragHandle';
import { useCompanionBehavior } from '../companion/behavior/useCompanionBehavior';
import type { CommandExecutionHandle } from '../companion/behavior/commandLifecycle';
import { useInteractiveRegion } from '../companion/useInteractiveRegion';
import type { CompanionProfile } from '@our-companion/shared';
import { CompanionCreationPage } from '../companion/creation/CompanionCreationPage';
import { CompanionEditPage } from '../companion/creation/CompanionEditPage';
import { CompanionSelectionPage } from '../companion/selection/CompanionSelectionPage';
import { getCreationCompletionAction, switchToSelectedCompanion } from '../companion/creation/creationCompletionFlow';
import { isCompanionAnimationName, resolveWalkDirection } from '../character/animationSelection';
import { startPerformancePlayback, type ActivePerformancePlayback } from '../character/performancePlayback';
import { RemoteVisitorLayer, useVisualVisitState } from '../visits/RemoteVisitorLayer';
import { useSettingsViewModel } from '../features/settings/useSettingsViewModel';
import { SETTINGS_CATEGORIES, settingsCategoryForKey, type SettingsCategory } from '../features/settings/settingsCategoryNavigation';

export function SettingsPage({ state, behaviorSettings, onRefresh, onLangChange, companionId, assetRoot }: {
  state?: CharacterRuntimeState;
  behaviorSettings?: CharacterBehaviorSettings;
  onRefresh: () => Promise<void>;
  onLangChange: (lang: Lang) => void;
  companionId?: string;
  assetRoot?: string;
}) {
  const lang = useLang();
  const {
    settings, model, setModel, endpoint, setEndpoint, apiKey, setApiKey,
    replyLang, setReplyLang, uiLang, setUiLang,
    attentionMode, setAttentionMode, pendingActions, setPendingActions,
    status, error, message, saving, saveSettings, refresh,
  } = useSettingsViewModel({ lang, onLangChange });
  const [developerOpen, setDeveloperOpen] = useState(() => localStorage.getItem('companion:developer:enabled') === 'true');
  const [devAnimation, setDevAnimation] = useState<DevAnimation>('live');
  const [category, setCategory] = useState<SettingsCategory>('companion');
  const categoryTabsRef = useRef(new Map<SettingsCategory, HTMLButtonElement>());
  const previewState = devAnimation === 'live' ? state : createDevAnimationState(devAnimation);
  const animationOverride = devAnimation === 'live' ? undefined : devAnimation;

  function handleCategoryKeyDown(current: SettingsCategory, key: string) {
    const next = settingsCategoryForKey(current, key);
    if (!next) return false;
    setCategory(next);
    categoryTabsRef.current.get(next)?.focus();
    return true;
  }

  return (
    <NotebookPage eyebrow={t(lang, 'settings_eyebrow')} title={t(lang, 'settings_title')} note={t(lang, 'settings_note')}>
      <div className="soft-filter-row settings-category-nav" role="tablist" aria-label={t(lang, 'settings_categories_label')}>
        {SETTINGS_CATEGORIES.map((item) => <button
          key={item}
          ref={(element) => { if (element) categoryTabsRef.current.set(item, element); else categoryTabsRef.current.delete(item); }}
          id={`settings-tab-${item}`}
          type="button"
          role="tab"
          aria-selected={category === item}
          aria-controls={`settings-panel-${item}`}
          tabIndex={category === item ? 0 : -1}
          className={category === item ? 'active' : ''}
          onClick={() => setCategory(item)}
          onKeyDown={(event) => { if (handleCategoryKeyDown(item, event.key)) event.preventDefault(); }}
        >{t(lang, `settings_category_${item}` as keyof typeof import('../i18n/en').en)}</button>)}
      </div>
      {SETTINGS_CATEGORIES.map((panelCategory) => <div
        key={panelCategory}
        className="settings-layout"
        id={`settings-panel-${panelCategory}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${panelCategory}`}
        tabIndex={0}
        hidden={category !== panelCategory}
      >
        {category === panelCategory && <>
        {category === 'companion' && <><PaperCard title={t(lang, 'settings_companion_behavior_title')}><p>{t(lang, 'settings_companion_behavior_desc')}</p></PaperCard>
        <PaperCard title={t(lang, 'settings_attention_title')}>
          <label><span>{t(lang, 'settings_initiative_label')}</span><select value={attentionMode} onChange={(event) => {
            const mode = event.target.value as 'available' | 'focused' | 'do_not_disturb';
            setAttentionMode(mode);
            void window.ourCompanion.companion.setAttentionMode(mode);
          }}><option value="available">{t(lang, 'settings_attention_available')}</option><option value="focused">{t(lang, 'settings_attention_focused')}</option><option value="do_not_disturb">{t(lang, 'settings_attention_do_not_disturb')}</option></select></label>
        </PaperCard>
        <PaperCard title={t(lang, 'settings_queued_discoveries')}>
          {pendingActions.length === 0 ? <p>{t(lang, 'settings_no_queued_discoveries')}</p> : pendingActions.map((action) => <div key={action.id} className="action-row"><span>{action.deferReason ?? t(lang, 'settings_deferred_discovery')} — {t(lang, 'settings_expires', { time: new Date(action.expiresAt).toLocaleTimeString() })}</span><button onClick={() => void window.ourCompanion.companion.cancelPendingAction(action.id).then(() => setPendingActions((items) => items.filter((item) => item.id !== action.id)))}>{t(lang, 'social_cancel')}</button></div>)}
        </PaperCard>
        </>}
        {category === 'appearance' && <PaperCard title={t(lang, 'settings_appearance_title')}><p>{t(lang, 'settings_appearance_desc')}</p><p>{t(lang, 'settings_appearance_language_note')}</p></PaperCard>}
        {category === 'privacy' && <><PaperCard title={t(lang, 'settings_privacy_title')}><p>{t(lang, 'settings_privacy_desc')}</p></PaperCard><ActionPermissionsCard /></>}
        {category === 'voice' && <VoiceSettingsCard />}
        {category === 'online' && <OnlineModeCard />}
        {category === 'advanced' && <PaperCard title={t(lang, 'settings_advanced_title')} className="settings-panel"><p>{t(lang, 'settings_advanced_desc')}</p></PaperCard>}
        {category === 'ai' && <PaperCard title={t(lang, 'settings_ai_title')} className="settings-panel">
          <h2>{t(lang, 'settings_ai_provider')}</h2>
          <label><span>{t(lang, 'settings_ai_model_label')}</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="deepseek-v4-flash" /></label>
          <label><span>{t(lang, 'settings_ai_endpoint_label')}</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.deepseek.com" /></label>
          <label><span>{t(lang, 'settings_ai_apikey_label')}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings?.apiKeyConfigured ? t(lang, 'settings_ai_apikey_placeholder_configured') : t(lang, 'settings_ai_apikey_placeholder_empty')} /></label>
          <label><span>{t(lang, 'settings_reply_lang_label')}</span><select value={replyLang} onChange={(e) => setReplyLang(e.target.value as typeof replyLang)}><option value="en">{t(lang, 'lang_en')}</option><option value="zh-CN">{t(lang, 'lang_zh_cn')}</option></select></label>
          <label><span>{t(lang, 'settings_ui_lang_label')}</span><select value={uiLang} onChange={(e) => setUiLang(e.target.value as typeof uiLang)}><option value="en">{t(lang, 'lang_en')}</option><option value="zh-CN">{t(lang, 'lang_zh_cn')}</option></select></label>
          <div className="action-row">
            <button onClick={() => void saveSettings()} disabled={saving}>{saving ? t(lang, 'settings_saving') : t(lang, 'settings_save')}</button>
            <button onClick={() => void saveSettings({ clearApiKey: true })} disabled={saving}>{t(lang, 'settings_clear_apikey')}</button>
          </div>
          {status === 'error' && error ? <InlineNotice tone="error" action={<button type="button" onClick={() => void refresh()}>{t(lang, 'feedback_retry')}</button>}>{error}</InlineNotice> : null}
          <p aria-live="polite">{message}</p>
        </PaperCard>
        }
        {category === 'developer' && <PaperCard title={t(lang, 'settings_developer_title')} className="developer-card">
          <button onClick={() => setDeveloperOpen((open) => { const next = !open; localStorage.setItem('companion:developer:enabled', String(next)); return next; })}>
            {developerOpen ? t(lang, 'settings_developer_hide') : t(lang, 'settings_developer_show')}
          </button>
          {developerOpen && <DeveloperPreview state={previewState} devAnimation={devAnimation} animationOverride={animationOverride} onAnimationChange={setDevAnimation} settings={behaviorSettings} onRefresh={onRefresh} companionId={companionId} assetRoot={assetRoot} />}
        </PaperCard>
        }
        </>}
      </div>)}
    </NotebookPage>
  );
}

// ─── Debug / Developer Components ───────────────────────────────────────────

function VoiceSettingsCard() {
  const lang = useLang();
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>();
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>({ useGpu: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  async function refreshStatus() {
    setLoading(true);
    try {
      const [nextStatus, nextSettings] = await Promise.all([window.ourCompanion.speech.getStatus(), window.ourCompanion.speech.getSettings()]);
      setSpeechStatus(nextStatus);
      setSpeechSettings(nextSettings);
    } catch {
      setSpeechStatus({ ready: false, model: 'ggml-small.bin', error: t(lang, 'voice_status_read_failed') });
    } finally {
      setLoading(false);
    }
  }

  async function saveSpeechSettings(input: UpdateSpeechSettingsInput) {
    setSaving(true);
    setSettingsMessage('');
    try {
      const next = await window.ourCompanion.speech.updateSettings(input);
      setSpeechSettings(next);
      setSettingsMessage(t(lang, 'voice_settings_saved'));
    } catch {
      setSettingsMessage(t(lang, 'voice_settings_save_failed'));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { void refreshStatus(); }, []);

  return (
    <PaperCard title={t(lang, 'voice_title')} className="settings-panel">
      <p>{t(lang, 'voice_intro')}</p>
      <p><strong>{t(lang, 'voice_hotkey')}</strong> Ctrl+Shift+Space</p>
      <p><strong>{t(lang, 'voice_model')}</strong> {speechStatus?.model ?? 'ggml-small.bin'}</p>
      <p><strong>{t(lang, 'voice_status')}</strong> {loading ? t(lang, 'voice_download_checking') : speechStatus?.ready ? t(lang, 'voice_status_ready') : t(lang, 'voice_status_not_ready')}</p>
      <label className="checkbox-row">
        <input type="checkbox" checked={speechSettings.useGpu} disabled={saving} onChange={(event) => void saveSpeechSettings({ useGpu: event.target.checked })} />
        <span>{t(lang, 'voice_use_gpu_label')}</span>
      </label>
      <p>{t(lang, 'voice_use_gpu_hint')}</p>
      <div className="action-row">
        <button onClick={() => void refreshStatus()} disabled={loading}>{loading ? t(lang, 'voice_download_checking') : t(lang, 'voice_refresh')}</button>
      </div>
      {settingsMessage && <p aria-live="polite">{settingsMessage}</p>}
      {!loading && !speechStatus?.ready && <p>{t(lang, 'voice_download_hint')}</p>}
    </PaperCard>
  );
}

function OnlineModeCard() {
  const lang = useLang();
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>();
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [serverError, setServerError] = useState('');
  const [editingServer, setEditingServer] = useState(false);
  const [friendCodeCopied, setFriendCodeCopied] = useState(false);
  const [confirmServerChange, setConfirmServerChange] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.ourCompanion.network.getStatus().then((status) => {
      if (!mounted) return;
      setNetworkStatus(status);
      setServerUrl(status.serverUrl);
      setLoading(false);
    }).catch(() => { if (mounted) setLoading(false); });
    const unsubscribe = window.ourCompanion.network.onStatusChanged((status) => {
      if (!mounted) return;
      setNetworkStatus(status);
      if (!editingServer) setServerUrl(status.serverUrl);
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  async function handleModeToggle() {
    if (!networkStatus) return;
    try {
      await (networkStatus.onlineModeEnabled
        ? window.ourCompanion.network.disableOnlineMode()
        : window.ourCompanion.network.enableOnlineMode());
    } catch {
      setAuthError(t(lang, 'online_mode_update_failed'));
    }
  }

  async function applyServerUrl() {
    if (!networkStatus) return;
    setSaving(true); setServerError('');
    try {
      const status = await window.ourCompanion.network.configureServer(serverUrl);
      setNetworkStatus(status);
      setServerUrl(status.serverUrl);
      setEditingServer(false);
    } catch {
      setServerError(t(lang, 'online_server_invalid'));
    } finally { setSaving(false); }
  }

  function requestServerUrlSave() {
    if (!networkStatus) return;
    if (networkStatus.account) {
      setConfirmServerChange(true);
      return;
    }
    void applyServerUrl();
  }

  async function handleRegister() {
    if (!username.trim() || !password.trim() || !email.trim()) return;
    setSaving(true); setAuthError('');
    try {
      await window.ourCompanion.network.register({ username: username.trim(), email: email.trim(), password });
      setShowRegister(false); resetForm();
    } catch { setAuthError(t(lang, 'online_registration_failed')); }
    finally { setSaving(false); }
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return;
    setSaving(true); setAuthError('');
    try {
      await window.ourCompanion.network.login({ email: email.trim(), password });
      setShowLogin(false); resetForm();
    } catch { setAuthError(t(lang, 'online_login_failed')); }
    finally { setSaving(false); }
  }

  async function handleLogout() { await window.ourCompanion.network.logout(); }

  async function retryConnection() {
    setSaving(true); setAuthError('');
    try { setNetworkStatus(await window.ourCompanion.network.retryConnection()); }
    catch { setAuthError(t(lang, 'online_retry_failed')); }
    finally { setSaving(false); }
  }

  async function copyFriendCode() {
    const friendCode = networkStatus?.account?.friendCode;
    if (!friendCode) return;
    try {
      await navigator.clipboard.writeText(friendCode);
      setFriendCodeCopied(true);
      window.setTimeout(() => setFriendCodeCopied(false), 2_000);
    } catch {
      setAuthError(t(lang, 'online_copy_failed'));
    }
  }

  function resetForm() {
    setUsername(''); setDisplayName(''); setEmail(''); setPassword(''); setAuthError('');
  }

  const busy = saving || ['checking_server', 'connecting'].includes(networkStatus?.state ?? '');
  const canShowAuthentication = Boolean(networkStatus && ['authentication_required', 'authentication_failed'].includes(networkStatus.state));

  if (loading) {
    return <PaperCard title={t(lang, 'online_title')} className="settings-panel"><LoadingState label={t(lang, 'online_loading')} /></PaperCard>;
  }

  return (
    <PaperCard title={t(lang, 'online_title')} className="settings-panel">
      {networkStatus && <ConnectionBanner status={networkStatus} onRetry={() => void retryConnection()} />}
      <div className="online-mode-header">
        <p className="online-mode-label">{networkStatus?.onlineModeEnabled ? t(lang, 'online_mode_enabled') : t(lang, 'online_mode_disabled')}</p>
        <button className="btn-secondary btn-sm" onClick={() => void handleModeToggle()} disabled={busy}>
          {networkStatus?.onlineModeEnabled ? t(lang, 'online_go_offline') : t(lang, 'online_go_online')}
        </button>
      </div>
      <div className="online-auth-form">
        <label><span>{t(lang, 'online_server')}</span><input value={serverUrl} disabled={busy || !editingServer} onChange={(event) => setServerUrl(event.target.value)} /></label>
        {!editingServer ? <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setEditingServer(true)}>{t(lang, 'online_change_server')}</button> : <div className="action-row"><button className="btn-secondary btn-sm" disabled={saving} onClick={() => { setServerUrl(networkStatus?.serverUrl ?? ''); setEditingServer(false); }}>{t(lang, 'social_cancel')}</button><button className="btn-primary btn-sm" disabled={saving} onClick={requestServerUrlSave}>{t(lang, 'online_save_server')}</button></div>}
        <p>{t(lang, 'online_server_hint')}</p>
        {serverError && <p className="creation-error" role="alert">{serverError}</p>}
      </div>
      {networkStatus?.remoteRevocationConfirmed === false && <InlineNotice tone="warning">{t(lang, 'online_logout_unconfirmed')}</InlineNotice>}
      {authError && !showRegister && !showLogin && <InlineNotice tone="error">{authError}</InlineNotice>}

      {networkStatus?.account ? (
        <div className="online-user-info online-account-card">
          <p className="online-account-identity"><strong>{networkStatus.account.username}</strong> (@{networkStatus.account.username}) <span className="online-friend-code-inline">{t(lang, 'online_code')} <code>{networkStatus.account.friendCode}</code></span></p>
          <p>{networkStatus.account.email}</p>
          <button className="btn-secondary btn-sm" onClick={() => void copyFriendCode()}>{friendCodeCopied ? t(lang, 'online_copied') : t(lang, 'online_copy_code')}</button>
          <button className="btn-ghost btn-sm online-logout-button" onClick={() => void handleLogout()}>{t(lang, 'online_logout')}</button>
        </div>
      ) : canShowAuthentication && showRegister ? (
        <div className="online-auth-form">
          <h3>{t(lang, 'online_create_account')}</h3>
          <label><span>{t(lang, 'online_username')}</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t(lang, 'online_username')} autoFocus /></label>
          <label><span>{t(lang, 'online_email')}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t(lang, 'online_email')} /></label>
          <label><span>{t(lang, 'online_password')}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t(lang, 'online_password')} /></label>
          {authError && <p className="creation-error" role="alert">{authError}</p>}
          <div className="action-row"><button className="btn-secondary btn-sm" onClick={() => { setShowRegister(false); resetForm(); }}>{t(lang, 'social_cancel')}</button><button className="btn-primary btn-sm" disabled={saving || !username.trim() || !password.trim() || !email.trim()} onClick={() => void handleRegister()}>{saving ? t(lang, 'online_creating') : t(lang, 'online_create_account')}</button></div>
          <p className="online-auth-switch">{t(lang, 'online_already_account')} <button className="btn-ghost btn-sm" onClick={() => { setShowRegister(false); setShowLogin(true); resetForm(); }}>{t(lang, 'online_login')}</button></p>
        </div>
      ) : canShowAuthentication && showLogin ? (
        <div className="online-auth-form">
          <h3>{t(lang, 'online_login_title')}</h3>
          <label><span>{t(lang, 'online_email')}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t(lang, 'online_email')} autoFocus /></label>
          <label><span>{t(lang, 'online_password')}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t(lang, 'online_password')} /></label>
          {authError && <p className="creation-error" role="alert">{authError}</p>}
          <div className="action-row"><button className="btn-secondary btn-sm" onClick={() => { setShowLogin(false); resetForm(); }}>{t(lang, 'social_cancel')}</button><button className="btn-primary btn-sm" disabled={saving || !email.trim() || !password.trim()} onClick={() => void handleLogin()}>{saving ? t(lang, 'online_logging_in') : t(lang, 'online_login_title')}</button></div>
          <p className="online-auth-switch">{t(lang, 'online_no_account')} <button className="btn-ghost btn-sm" onClick={() => { setShowLogin(false); setShowRegister(true); resetForm(); }}>{t(lang, 'online_create_one')}</button></p>
        </div>
      ) : canShowAuthentication ? (
        <div className="online-auth-buttons"><button className="btn-secondary btn-sm" onClick={() => setShowLogin(true)}>{t(lang, 'online_login_title')}</button><button className="btn-primary btn-sm" onClick={() => setShowRegister(true)}>{t(lang, 'online_create_account')}</button></div>
      ) : null}
      <ConfirmDialog
        open={confirmServerChange}
        title={t(lang, 'online_change_server')}
        description={t(lang, 'online_server_change_confirm')}
        confirmLabel={t(lang, 'online_save_server')}
        busy={saving}
        onClose={() => setConfirmServerChange(false)}
        onConfirm={() => {
          setConfirmServerChange(false);
          void applyServerUrl();
        }}
      />
    </PaperCard>
  );
}

const ALL_PERMISSION_SCOPES: PermissionScope[] = ['browser', 'automation', 'files', 'clipboard', 'calendar'];

function ActionPermissionsCard() {
  const lang = useLang();
  const [permissions, setPermissions] = useState<ActionPermissionState | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => { void window.ourCompanion.action.getPermissions().then(setPermissions); }, []);

  async function update(scope: PermissionScope, value: 'granted' | 'ask' | 'denied') {
    if (!permissions) return;
    setSaving(true);
    try {
      const next = { ...permissions, [scope]: value };
      const saved = await window.ourCompanion.action.updatePermissions(next);
      setPermissions(saved);
    } finally {
      setSaving(false);
    }
  }

  if (!permissions) return null;

  return (
    <PaperCard title={t(lang, 'permissions_title')} className="settings-panel">
      <p>{t(lang, 'permissions_desc')}</p>
      {ALL_PERMISSION_SCOPES.map((scope) => (
        <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ flex: 1 }}>{t(lang, `permissions_${scope}` as import('../i18n').TranslationKey)}</span>
          <select value={permissions[scope]} disabled={saving} onChange={(e) => void update(scope, e.target.value as 'granted' | 'ask' | 'denied')}>
            <option value="ask">{t(lang, 'permissions_ask')}</option>
            <option value="granted">{t(lang, 'permissions_granted')}</option>
            <option value="denied">{t(lang, 'permissions_denied')}</option>
          </select>
        </label>
      ))}
    </PaperCard>
  );
}

function BehaviorPanel({ settings, onRefresh }: { settings?: CharacterBehaviorSettings; onRefresh: () => Promise<void> }) {
  const lang = useLang();
  const [draftMovement, setDraftMovement] = useState(settings?.effectiveMovement ?? 25);
  const range = getWalkDelayRange(settings?.effectiveMovement ?? draftMovement);

  useEffect(() => { if (settings) setDraftMovement(settings.effectiveMovement); }, [settings?.effectiveMovement]);

  async function saveMovement(value: number) {
    setDraftMovement(value);
    await window.ourCompanion.character.updateBehaviorSettings({ movementOverride: value });
    await onRefresh();
  }

  async function resetMovement() {
    await window.ourCompanion.character.updateBehaviorSettings({ resetMovement: true });
    await onRefresh();
  }

  return (
    <div className="paper-card behavior-panel">
      <p className="eyebrow">{t(lang, 'behavior_eyebrow')}</p>
      <h2>{t(lang, 'behavior_title')}</h2>
      <label>
        <span>{t(lang, 'behavior_score', { score: settings?.effectiveMovement ?? draftMovement })}</span>
        <input type="range" min="0" max="100" value={draftMovement} onChange={(event) => setDraftMovement(Number(event.target.value))} onMouseUp={() => saveMovement(draftMovement)} onKeyUp={(event) => { if (event.key === 'Enter') saveMovement(draftMovement); }} />
      </label>
      <p>{settings?.source === 'override' ? t(lang, 'behavior_using_override') : t(lang, 'behavior_using_default')} {t(lang, 'behavior_rest_range', { min: Math.round(range.minMs / 1000), max: Math.round(range.maxMs / 1000) })}</p>
      <div className="action-row">
        <button onClick={() => saveMovement(draftMovement)}>{t(lang, 'behavior_save')}</button>
        <button onClick={resetMovement}>{t(lang, 'behavior_reset')}</button>
      </div>
    </div>
  );
}

function DeveloperPreview({ state, devAnimation, animationOverride, onAnimationChange, settings, onRefresh, companionId, assetRoot }: {
  state?: CharacterRuntimeState;
  devAnimation: DevAnimation;
  animationOverride?: AnimationName;
  onAnimationChange: (animation: DevAnimation) => void;
  settings?: CharacterBehaviorSettings;
  onRefresh: () => Promise<void>;
  companionId?: string;
  assetRoot?: string;
}) {
  const [availableAnimations, setAvailableAnimations] = useState<DevAnimation[]>(['live']);

  useEffect(() => {
    let active = true;
    setAvailableAnimations(['live']);
    if (!companionId) return () => { active = false; };
    void window.ourCompanion.companionNew.listAssets(companionId)
      .then((assets) => {
        if (active) setAvailableAnimations(getDevAnimationsForAssets(assets));
      })
      .catch(() => {
        if (active) setAvailableAnimations(['live']);
      });
    return () => { active = false; };
  }, [companionId]);

  useEffect(() => {
    if (!availableAnimations.includes(devAnimation)) onAnimationChange('live');
  }, [availableAnimations, devAnimation, onAnimationChange]);

  return (
    <div className="developer-tools">
      <div className="developer-preview-canvas">
        {assetRoot && companionId ? <CompanionCanvas state={state} compact animationOverride={animationOverride} companionId={companionId} assetRoot={assetRoot} /> : <p>No Companion assets available.</p>}
      </div>
      <div className="dev-animation-panel">
        <p className="eyebrow">Developer use</p>
        <h2>Animation review</h2>
        <div className="segmented-control" aria-label="Preview companion animation">
          {availableAnimations.map((animation) => (
            <button key={animation} data-animation-name={animation} className={devAnimation === animation ? 'active' : ''} onClick={() => onAnimationChange(animation)}>
              {animation === 'live' ? 'Live' : readable(animation)}
            </button>
          ))}
        </div>
        <p>Previewing: {devAnimation === 'live' ? 'engine state' : readable(devAnimation)}</p>
      </div>
      <BehaviorPanel settings={settings} onRefresh={onRefresh} />
      <EngineObservatory />
      <DebugAudioTestPanel />
      <DebugAiLog />
      <DebugDataResetPanel onRefresh={onRefresh} />
    </div>
  );
}

function DebugAiLog() {
  const [log, setLog] = useState<AiDebugEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLog(await window.ourCompanion.ai.getDebugLog()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="debug-ai-log">
      <div className="debug-ai-log-header">
        <span className="debug-ai-log-title">AI Request / Response Log</span>
        <span className="debug-ai-log-count">{log.length} calls</span>
        <button className="debug-ai-log-refresh" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {log.length === 0 ? (
        <p className="debug-ai-log-empty">No AI calls recorded yet.</p>
      ) : (
        <div className="debug-ai-log-list">
          {log.map((entry) => (
            <div key={entry.id} className="debug-ai-log-entry">
              <button className="debug-ai-log-summary" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)} aria-expanded={expanded === entry.id}>
                <span className={`debug-channel-badge debug-channel-${entry.channel}`}>{entry.channel}</span>
                <span className={`debug-status-badge debug-status-${entry.status}`}>{entry.status}</span>
                <span className="debug-source-badge">{entry.source}</span>
                <span className="debug-ai-log-time">{new Date(entry.createdAt).toLocaleTimeString()}</span>
                <span className="debug-ai-log-preview">{debugPreview(entry)}</span>
                <span className="debug-ai-log-chevron">{expanded === entry.id ? '▲' : '▼'}</span>
              </button>
              {expanded === entry.id && (
                <div className="debug-ai-log-detail">
                  <DebugJsonBlock title="Request body" value={entry.requestBody ?? { messages: entry.requestMessages }} />
                  <DebugTextBlock title="Response content" value={entry.content || '(empty)'} />
                  {entry.rawResponse !== undefined && <DebugJsonBlock title="Raw response" value={entry.rawResponse} />}
                  {entry.error && <DebugTextBlock title="Error" value={entry.error} tone="error" />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const debugResetOptions: Array<{ target: DebugDataResetTarget; label: string; detail: string }> = [
  { target: 'discoveries', label: 'Clear discoveries', detail: 'Discovery feed and announced discovery markers.' },
  { target: 'memory', label: 'Clear memory', detail: 'Memory nodes and memory edges.' },
  { target: 'journeys', label: 'Clear journeys', detail: 'Journeys and journey milestones.' },
  { target: 'diary', label: 'Clear diary', detail: 'Diary entries only.' },
  { target: 'chat', label: 'Clear chat', detail: 'Companion conversation messages.' },
  { target: 'autonomy', label: 'Clear autonomy', detail: 'Exploration cycles, events, insights, candidates, patterns, and interest graph.' },
  { target: 'all_debug_data', label: 'Clear all debug data', detail: 'All groups above. Character, settings, and API key stay untouched.' }
];

function DebugDataResetPanel({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [pendingTarget, setPendingTarget] = useState<DebugDataResetTarget | null>(null);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState('No reset run yet.');

  async function resetTarget(target: DebugDataResetTarget) {
    setResetting(true);
    setStatus('Clearing data...');
    try {
      const result = await window.ourCompanion.debug.resetData({ targets: [target] });
      await onRefresh();
      setStatus(`Cleared ${result.clearedTables.length} table groups at ${new Date(result.completedAt).toLocaleTimeString()}.`);
      setPendingTarget(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to clear data.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="debug-reset-panel">
      <div className="debug-reset-header">
        <span className="debug-ai-log-title">Database Reset Tools</span>
        <span className="debug-reset-status">{status}</span>
      </div>
      <div className="debug-reset-grid">
        {debugResetOptions.map((option) => (
          <div key={option.target} className="debug-reset-item">
            <div><strong>{option.label}</strong><span>{option.detail}</span></div>
            {pendingTarget === option.target ? (
              <div className="debug-reset-confirm">
                <button className={option.target === 'all_debug_data' ? 'debug-reset-danger' : ''} onClick={() => void resetTarget(option.target)} disabled={resetting}>Confirm</button>
                <button onClick={() => setPendingTarget(null)} disabled={resetting}>Cancel</button>
              </div>
            ) : (
              <button className={option.target === 'all_debug_data' ? 'debug-reset-danger' : ''} onClick={() => setPendingTarget(option.target)} disabled={resetting}>Clear</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DebugAudioTestPanel() {
  const [recording, setRecording] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('Ready.');
  const [result, setResult] = useState<{ text?: string; language?: string; size?: number; durationMs?: number; mimeType?: string; error?: string }>({});
  const audio = useAudioCapture({ silenceDurationMs: 120000, onError: (message) => { setStatus(message); setResult({ error: message }); setRecording(false); setTesting(false); } });

  async function startTest() {
    setResult({});
    setStatus('Requesting microphone...');
    const started = await audio.startRecording();
    setRecording(started);
    setStatus(started ? 'Recording test audio...' : 'Microphone was not started.');
  }

  async function stopAndTranscribe() {
    setTesting(true);
    setStatus('Stopping recording...');
    try {
      const captured = await audio.stopRecording();
      setRecording(false);
      if (!captured || captured.blob.size === 0) { setResult({ error: 'No audio was captured.' }); setStatus('No audio was captured.'); return; }
      if (captured.durationMs < 500) { setResult({ error: 'Recording was too short to transcribe.', size: captured.blob.size, durationMs: captured.durationMs, mimeType: captured.mimeType }); setStatus('Recording too short.'); return; }
      setStatus('Transcribing test audio...');
      const buffer = await captured.blob.arrayBuffer();
      const transcribed = await window.ourCompanion.speech.transcribe({ audio: buffer, mimeType: captured.mimeType });
      setResult({ text: transcribed.text, language: transcribed.language, size: captured.blob.size, durationMs: captured.durationMs, mimeType: captured.mimeType });
      setStatus('Transcription complete.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to transcribe test audio.';
      setResult({ error: message });
      setStatus('Transcription failed.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="debug-audio-panel">
      <div className="debug-reset-header">
        <span className="debug-ai-log-title">Audio Transcription Test</span>
        <span className="debug-reset-status">{status}</span>
      </div>
      <div className="debug-audio-actions">
        <button onClick={() => void startTest()} disabled={recording || testing}>Start recording</button>
        <button onClick={() => void stopAndTranscribe()} disabled={!recording || testing}>{testing ? 'Testing...' : 'Stop & transcribe'}</button>
      </div>
      {(result.text || result.error || result.size) && (
        <div className="debug-audio-result">
          {result.size !== undefined && <span>{result.mimeType ?? 'audio'} · {Math.round(result.size / 1024)} KB · {formatDuration(result.durationMs)} · language {result.language ?? 'auto'}</span>}
          {result.text && <pre>{result.text}</pre>}
          {result.error && <pre className="debug-audio-error">{result.error}</pre>}
        </div>
      )}
    </div>
  );
}
