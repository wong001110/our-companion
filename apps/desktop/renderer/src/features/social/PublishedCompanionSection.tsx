import { useEffect, useRef, useState } from 'react';
import type { AssetUploadProgress, NetworkAssetPack } from '@our-companion/shared';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { InlineNotice } from '../../components/feedback/InlineNotice';
import { LoadingState } from '../../components/feedback/LoadingState';
import { ActionProgress } from '../../components/feedback/ActionProgress';
import { OperationalRow, StatusBadge } from '../../components/feedback/OperationalState';
import {
  ASSET_PACK_PRESENTATION,
  ASSET_UPLOAD_PRESENTATION,
  PUBLISHED_COMPANION_PRESENTATION,
  assetFailurePresentation,
  type PublishedCompanionUiState,
} from '../operational/operationalState';
import { t, type Lang, type TranslationKey } from '../../i18n';
import { PaperCard, useLang } from '../../ui/NotebookPrimitives';
import {
  usePublishedCompanionViewModel,
  type OwnedPublishedCompanion,
  type PublishedCompanionSnapshot,
} from './usePublishedCompanionViewModel';

type PublicationOperation = 'idle' | 'inspecting' | 'publishing' | 'unpublishing';
type PublishStage = 'profile' | 'assets' | 'finalizing';

export function publicationUiState(
  localCount: number,
  snapshot: PublishedCompanionSnapshot | undefined,
  operation: PublicationOperation,
  failure?: TranslationKey,
  validationError = false,
): PublishedCompanionUiState {
  if (!localCount) return 'no_local_companion';
  if (operation === 'publishing') return snapshot?.activeNetworkCompanionId ? 'updating' : 'publishing';
  if (operation === 'unpublishing') return 'unpublishing';
  if (failure === 'asset_failure_storage') return 'storage_unavailable';
  if (validationError) return 'validation_error';
  const active = snapshot?.companions.find((profile) => profile.id === snapshot.activeNetworkCompanionId);
  if (!active) return 'draft';
  const activePack = active.assetPacks.find((pack) => pack.id === active.activeAssetPackId && pack.status === 'active');
  if (active.published && activePack) return 'published';
  if (!activePack) return 'no_active_pack';
  return 'draft';
}

export function uploadFeedbackMode(progress?: AssetUploadProgress): 'none' | 'indeterminate' | 'determinate' | 'terminal' {
  if (!progress) return 'none';
  if (progress.state === 'completed' || progress.state === 'failed' || progress.state === 'cancelled') return 'terminal';
  return progress.state === 'uploading' && progress.totalBytes > 0 ? 'determinate' : 'indeterminate';
}

export function PublishedCompanionSection({ onVisitAvailabilityChange }: {
  onVisitAvailabilityChange?: (availability: { loaded: boolean; canSendVisit: boolean }) => void;
} = {}) {
  const lang = useLang();
  const {
    localCompanions,
    localLoading,
    localLoadFailed,
    refreshLocal,
    snapshot,
    scope,
    networkAvailable,
    networkLoading,
    networkLoadFailed,
    stale,
    refreshNetwork,
  } = usePublishedCompanionViewModel();
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [includeVoices, setIncludeVoices] = useState(false);
  const [inspection, setInspection] = useState<{ totalFiles: number; totalBytes: number; manifestHash: string }>();
  const [operation, setOperation] = useState<PublicationOperation>('idle');
  const [publishStage, setPublishStage] = useState<PublishStage>('profile');
  const [publishProgress, setPublishProgress] = useState<AssetUploadProgress>();
  const [message, setMessage] = useState<TranslationKey>();
  const [failure, setFailure] = useState<TranslationKey>();
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const hydratedProfileRef = useRef<string | undefined>(undefined);
  const accountScopeRef = useRef<string | undefined>(undefined);
  const currentScopeRef = useRef<string | undefined>(scope);

  const activeProfile = snapshot?.companions.find((profile) => profile.id === snapshot.activeNetworkCompanionId);
  const activePack = activeProfile?.assetPacks.find((pack) => pack.id === activeProfile.activeAssetPackId);
  const selected = localCompanions.find((companion) => companion.id === selectedId);
  const operationBusy = operation !== 'idle';
  const validationError = Boolean(selected && !name.trim());
  const publicationPresentation = PUBLISHED_COMPANION_PRESENTATION[publicationUiState(localCompanions.length, snapshot, operation, failure, validationError)];

  useEffect(() => {
    onVisitAvailabilityChange?.({
      loaded: snapshot !== undefined && !networkLoadFailed,
      canSendVisit: Boolean(activeProfile?.published && activePack?.status === 'active'),
    });
  }, [activePack?.status, activeProfile?.published, networkLoadFailed, onVisitAvailabilityChange, snapshot]);

  useEffect(() => {
    if (selectedId || !localCompanions[0]) return;
    setSelectedId(localCompanions[0].id);
    setName(localCompanions[0].name);
  }, [localCompanions, selectedId]);

  useEffect(() => {
    if (!activeProfile || hydratedProfileRef.current === activeProfile.id) return;
    hydratedProfileRef.current = activeProfile.id;
    setName(activeProfile.name);
    setDescription(activeProfile.publicDescription ?? '');
    setTags(activeProfile.publicTags.join(', '));
  }, [activeProfile]);

  useEffect(() => {
    currentScopeRef.current = scope;
    if (accountScopeRef.current === scope) return;
    accountScopeRef.current = scope;
    hydratedProfileRef.current = undefined;
    setDescription('');
    setTags('');
    setName((current) => selected?.name ?? current);
    setFailure(undefined);
    setMessage(undefined);
    setConfirmUnpublish(false);
    setOperation('idle');
    setPublishProgress(undefined);
  }, [scope, selected?.name]);

  useEffect(() => {
    if (operation !== 'publishing') return;
    let active = true;
    const refresh = () => void window.ourCompanion.network.assets.getPublishStatus()
      .then((progress) => { if (active && progress) setPublishProgress(progress); })
      .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 300);
    return () => { active = false; window.clearInterval(timer); };
  }, [operation]);

  async function inspect() {
    if (!selectedId) return;
    setOperation('inspecting');
    setFailure(undefined);
    setMessage(undefined);
    try {
      const result = await window.ourCompanion.network.assets.inspectLocalPack({ localCompanionId: selectedId, includeVoices });
      setInspection(result);
      setMessage('publish_pack_ready');
    } catch {
      setFailure('publish_inspect_failed');
    } finally {
      setOperation('idle');
    }
  }

  async function publish() {
    const scopeAtStart = scope;
    if (!selectedId || !name.trim() || !networkAvailable || !scopeAtStart) return;
    setOperation('publishing');
    setPublishStage('profile');
    setPublishProgress(undefined);
    setFailure(undefined);
    setMessage(undefined);
    let publishingAssets = false;
    try {
      const profileInput = {
        localCompanionId: selectedId,
        name: name.trim(),
        publicDescription: description.trim() || undefined,
        publicTags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      };
      const networkCompanionId = (await window.ourCompanion.network.companions.create(profileInput)).networkCompanionId;
      if (currentScopeRef.current !== scopeAtStart) return;
      await window.ourCompanion.network.companions.activate(networkCompanionId);
      if (currentScopeRef.current !== scopeAtStart) return;
      setPublishStage('assets');
      publishingAssets = true;
      await window.ourCompanion.network.assets.publishPack({ localCompanionId: selectedId, networkCompanionId, includeVoices });
      if (currentScopeRef.current !== scopeAtStart) return;
      publishingAssets = false;
      setPublishStage('finalizing');
      await window.ourCompanion.network.companions.publish(networkCompanionId);
      if (currentScopeRef.current !== scopeAtStart) return;
      setMessage('publish_published');
      await refreshNetwork();
    } catch (error) {
      if (currentScopeRef.current === scopeAtStart) setFailure(publishingAssets ? assetFailurePresentation(assetFailureCode(error)) : 'publish_failed');
    } finally {
      if (currentScopeRef.current === scopeAtStart) setOperation('idle');
    }
  }

  async function cancelUpload() {
    try {
      await window.ourCompanion.network.assets.cancelPublish();
      setMessage('publish_cancel_requested');
    } catch {
      setFailure('publish_cancel_failed');
    }
  }

  async function unpublish() {
    const scopeAtStart = scope;
    if (!activeProfile || !networkAvailable || !scopeAtStart) return;
    setOperation('unpublishing');
    setFailure(undefined);
    setMessage(undefined);
    try {
      await window.ourCompanion.network.companions.unpublish(activeProfile.id);
      if (currentScopeRef.current !== scopeAtStart) return;
      setMessage('publish_unpublished');
      setConfirmUnpublish(false);
      await refreshNetwork();
    } catch {
      if (currentScopeRef.current === scopeAtStart) setFailure('publish_unpublish_failed');
    } finally {
      if (currentScopeRef.current === scopeAtStart) setOperation('idle');
    }
  }

  return <>
    <PaperCard title={t(lang, 'publish_title')} className="settings-panel published-companion-card">
      <header className="published-companion-status">
        <div>
          <p className="published-companion-kicker">{t(lang, 'publish_visibility')}</p>
          <p>{t(lang, 'publish_privacy_note')}</p>
        </div>
        <StatusBadge label={t(lang, publicationPresentation.labelKey)} tone={publicationPresentation.tone} />
      </header>

      {stale && <InlineNotice>{t(lang, 'publish_stale_snapshot')}</InlineNotice>}
      {networkLoadFailed && <InlineNotice tone="error" action={<button type="button" className="btn-ghost btn-sm" disabled={!networkAvailable} onClick={() => void refreshNetwork()}>{t(lang, 'feedback_retry')}</button>}>{t(lang, 'social_partial_publishing')}</InlineNotice>}
      {localLoadFailed && <InlineNotice tone="error" action={<button type="button" className="btn-ghost btn-sm" onClick={() => void refreshLocal()}>{t(lang, 'feedback_retry')}</button>}>{t(lang, 'publish_local_load_failed')}</InlineNotice>}
      {failure && <InlineNotice tone="error">{t(lang, failure)}</InlineNotice>}
      {message && <InlineNotice tone="success">{t(lang, message)}</InlineNotice>}

      <section className="published-companion-editor" aria-labelledby="published-companion-editor-title">
        <div className="published-section-heading">
          <div><h3 id="published-companion-editor-title">{t(lang, 'publish_editor_title')}</h3><p>{t(lang, 'publish_editor_hint')}</p></div>
          {localLoading && <LoadingState label={t(lang, 'publish_loading_local')} />}
        </div>
        {!localLoading && !localCompanions.length ? <p>{t(lang, 'publish_no_local_companion_hint')}</p> : <>
          <label><span>{t(lang, 'publish_local_companion')}</span><select value={selectedId} disabled={operationBusy} onChange={(event) => { const companion = localCompanions.find((item) => item.id === event.target.value); setSelectedId(event.target.value); if (companion) setName(companion.name); setInspection(undefined); }}>{localCompanions.map((companion) => <option key={companion.id} value={companion.id}>{companion.name}</option>)}</select></label>
          <label><span>{t(lang, 'publish_public_name')}</span><input value={name} maxLength={60} disabled={operationBusy} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>{t(lang, 'publish_public_description')}</span><textarea value={description} maxLength={500} disabled={operationBusy} onChange={(event) => setDescription(event.target.value)} /></label>
          <label><span>{t(lang, 'publish_tags')}</span><input value={tags} disabled={operationBusy} onChange={(event) => setTags(event.target.value)} placeholder={t(lang, 'publish_tags_placeholder')} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={includeVoices} disabled={operationBusy} onChange={(event) => { setIncludeVoices(event.target.checked); setInspection(undefined); }} /><span>{t(lang, 'publish_include_voices')}</span></label>
          <p className="state-reason">{includeVoices ? t(lang, 'publish_voice_note') : t(lang, 'publish_voice_excluded_note')}</p>
          {inspection && <div className="published-pack-inspection"><strong>{t(lang, 'publish_pack_ready')}</strong><span>{t(lang, 'publish_ready', { files: inspection.totalFiles, size: formatMegabytes(inspection.totalBytes, lang) })}</span></div>}
          {operation === 'inspecting' && <LoadingState label={t(lang, 'publish_state_inspecting')} />}
          {operation === 'publishing' && <PublishFeedback stage={publishStage} progress={publishProgress} lang={lang} />}
          <div className="action-row">
            <button type="button" className="btn-secondary btn-sm" disabled={operationBusy || !selected} onClick={() => void inspect()}>{t(lang, 'publish_inspect')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={operationBusy || !networkAvailable || !selected || !name.trim()} onClick={() => void publish()}>{activeProfile ? t(lang, 'publish_update') : t(lang, 'publish_publish')}</button>
            {operation === 'publishing' && publishStage === 'assets' && <button type="button" className="btn-ghost btn-sm" onClick={() => void cancelUpload()}>{t(lang, 'publish_cancel_upload')}</button>}
          </div>
          {!networkAvailable && <p className="state-reason">{t(lang, 'publish_network_required')}</p>}
        </>}
      </section>

      <PublicationSummary activeProfile={activeProfile} activePack={activePack} snapshot={snapshot} lang={lang} loading={networkLoading} />

      {activeProfile?.published && <div className="published-companion-actions"><button type="button" className="btn-danger btn-sm" disabled={operationBusy || !networkAvailable} onClick={() => setConfirmUnpublish(true)}>{t(lang, 'publish_unpublish')}</button></div>}
      <p className="published-visit-snapshot-note">{t(lang, 'publish_visit_snapshot_note')}</p>
    </PaperCard>
    <ConfirmDialog
      open={confirmUnpublish}
      title={t(lang, 'publish_unpublish_confirm_title')}
      description={t(lang, 'publish_unpublish_confirm_description')}
      confirmLabel={t(lang, 'publish_unpublish')}
      danger
      busy={operation === 'unpublishing'}
      onClose={() => setConfirmUnpublish(false)}
      onConfirm={() => void unpublish()}
    />
  </>;
}

function PublishFeedback({ stage, progress, lang }: { stage: PublishStage; progress?: AssetUploadProgress; lang: Lang }) {
  if (stage === 'profile') return <LoadingState label={t(lang, 'publish_preparing_profile')} />;
  if (stage === 'finalizing') return <LoadingState label={t(lang, 'publish_state_finalizing')} />;
  if (!progress) return <LoadingState label={t(lang, 'publish_uploading_pack')} />;
  const presentation = ASSET_UPLOAD_PRESENTATION[progress.state];
  const label = t(lang, presentation.labelKey);
  const mode = uploadFeedbackMode(progress);
  if (mode === 'determinate') {
    const percent = Math.round((progress.uploadedBytes / progress.totalBytes) * 100);
    return <ActionProgress value={percent} label={t(lang, 'publish_progress', { state: label, completed: progress.completedFiles, total: progress.totalFiles, percent })} />;
  }
  if (mode === 'terminal') return <div className="published-terminal-progress"><StatusBadge label={label} tone={presentation.tone} />{progress.failureCode && <p className="state-reason">{t(lang, assetFailurePresentation(progress.failureCode))}</p>}</div>;
  return <div className="published-indeterminate-progress"><StatusBadge label={label} tone={presentation.tone} /><LoadingState label={progress.state === 'verifying' ? t(lang, 'publish_verifying_hint') : t(lang, 'publish_preparing_assets_hint')} /></div>;
}

function PublicationSummary({ activeProfile, activePack, snapshot, lang, loading }: {
  activeProfile?: OwnedPublishedCompanion;
  activePack?: NetworkAssetPack;
  snapshot?: PublishedCompanionSnapshot;
  lang: Lang;
  loading: boolean;
}) {
  const history = snapshot?.companions.flatMap((profile) => profile.assetPacks.map((pack) => ({ profile, pack })))
    .sort((left, right) => Date.parse(right.pack.createdAt) - Date.parse(left.pack.createdAt)) ?? [];
  return <section className="published-companion-summary" aria-labelledby="published-companion-summary-title">
    <div className="published-section-heading"><div><h3 id="published-companion-summary-title">{t(lang, 'publish_current_title')}</h3><p>{t(lang, 'publish_current_hint')}</p></div>{loading && <LoadingState label={t(lang, 'publish_refreshing')} />}</div>
    {activeProfile ? <OperationalRow
      label={t(lang, 'publish_current_title')}
      identity={<><strong>{activeProfile.name}</strong>{activeProfile.publicDescription && <p>{activeProfile.publicDescription}</p>}</>}
      status={{ label: t(lang, activeProfile.published ? 'published_state_published' : 'published_state_draft'), tone: activeProfile.published ? 'success' : 'neutral' }}
      supporting={<><span>{t(lang, 'publish_visibility')}</span>{activeProfile.publicTags.length > 0 && <span className="published-profile-tags">{activeProfile.publicTags.join(' · ')}</span>}{activePack && <span>{t(lang, 'publish_active_pack_summary', { files: activePack.totalFiles, size: formatMegabytes(activePack.totalBytes, lang), date: formatDate(activePack.activatedAt ?? activePack.updatedAt, lang) })}</span>}</>}
    /> : <p>{t(lang, 'publish_no_active_profile')}</p>}
    <details className="published-pack-history">
      <summary><h4>{t(lang, 'publish_history_title')}</h4></summary>
      {history.length ? history.map(({ profile, pack }) => {
        const presentation = ASSET_PACK_PRESENTATION[pack.status];
        return <OperationalRow
          key={pack.id}
          label={t(lang, 'publish_history_pack_label', { name: profile.name })}
          identity={<strong>{profile.name}</strong>}
          status={{ label: t(lang, presentation.labelKey), tone: presentation.tone }}
          supporting={<span>{t(lang, 'publish_history_pack_summary', { files: pack.totalFiles, size: formatMegabytes(pack.totalBytes, lang), date: formatDate(pack.createdAt, lang) })}</span>}
          reason={pack.failureCode ? t(lang, assetFailurePresentation(pack.failureCode)) : undefined}
        />;
      }) : <p>{t(lang, 'publish_history_empty')}</p>}
    </details>
  </section>;
}

export function assetFailureCode(error: unknown): string | undefined {
  if (error instanceof Error && error.message) {
    const serializedCode = error.message.match(/\b[A-Z][A-Z0-9_]{2,80}\b/g)?.at(-1);
    return serializedCode ?? error.message;
  }
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  return typeof record.failureCode === 'string' ? record.failureCode : typeof record.code === 'string' ? record.code : undefined;
}

function formatMegabytes(bytes: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'zh-CN' ? 'zh-CN' : 'en', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(bytes / 1024 / 1024);
}

function formatDate(value: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'zh-CN' ? 'zh-CN' : 'en', { dateStyle: 'medium' }).format(new Date(value));
}
