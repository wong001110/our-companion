import { useEffect, useState } from 'react';
import type { AssetUploadProgress, CompanionProfile } from '@our-companion/shared';
import { PaperCard } from '../../ui/NotebookPrimitives';
import { useLang } from '../../ui/NotebookPrimitives';
import { t, type Lang } from '../../i18n';
import { ActionProgress } from '../../components/feedback/ActionProgress';

export function PublishedCompanionSection() {
  const lang = useLang();
  const [companions, setCompanions] = useState<CompanionProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [includeVoices, setIncludeVoices] = useState(false);
  const [inspection, setInspection] = useState<{ totalFiles: number; totalBytes: number; manifestHash: string }>();
  const [networkCompanionId, setNetworkCompanionId] = useState<string>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [publishProgress, setPublishProgress] = useState<AssetUploadProgress>();

  useEffect(() => { void Promise.all([window.ourCompanion.companionNew.list(), window.ourCompanion.network.companions.getMine().catch(() => undefined)]).then(([items, mine]) => { setCompanions(items); const first = items[0]; if (first) { setSelectedId(first.id); setName(first.name); } if (mine?.activeNetworkCompanionId) setNetworkCompanionId(mine.activeNetworkCompanionId); }); }, []);
  useEffect(() => {
    if (!busy) return;
    let active = true;
    const refresh = () => void window.ourCompanion.network.assets.getPublishStatus().then(progress => { if (active) setPublishProgress(progress); }).catch(() => undefined);
    refresh(); const timer = window.setInterval(refresh, 300);
    return () => { active = false; window.clearInterval(timer); };
  }, [busy]);
  const selected = companions.find((companion) => companion.id === selectedId);
  async function inspect() { if (!selectedId) return; setBusy(true); try { const result = await window.ourCompanion.network.assets.inspectLocalPack({ localCompanionId: selectedId, includeVoices }); setInspection(result); setStatus(t(lang, 'publish_pack_ready')); } catch { setStatus(t(lang, 'publish_inspect_failed')); } finally { setBusy(false); } }
  async function publish() {
    if (!selectedId || !name.trim()) return; setPublishProgress(undefined); setBusy(true); setStatus(t(lang, 'publish_preparing_profile'));
    try {
      const profile = await window.ourCompanion.network.companions.create({ localCompanionId: selectedId, name: name.trim(), publicDescription: description.trim() || undefined, publicTags: tags.split(',').map(tag => tag.trim()).filter(Boolean) });
      setNetworkCompanionId(profile.networkCompanionId);
      await window.ourCompanion.network.companions.activate(profile.networkCompanionId);
      setStatus(t(lang, 'publish_uploading_pack'));
      await window.ourCompanion.network.assets.publishPack({ localCompanionId: selectedId, networkCompanionId: profile.networkCompanionId, includeVoices });
      await window.ourCompanion.network.companions.publish(profile.networkCompanionId);
      setStatus(t(lang, 'publish_published'));
    } catch { setStatus(t(lang, 'publish_failed')); } finally { setBusy(false); }
  }
  async function cancel() { await window.ourCompanion.network.assets.cancelPublish(); setStatus(t(lang, 'publish_cancel_requested')); }
  async function unpublish() { if (!networkCompanionId) return; setBusy(true); try { await window.ourCompanion.network.companions.unpublish(networkCompanionId); setStatus(t(lang, 'publish_unpublished')); } catch { setStatus(t(lang, 'publish_unpublish_failed')); } finally { setBusy(false); } }
  const percent = publishProgress?.totalBytes ? Math.round((publishProgress.uploadedBytes / publishProgress.totalBytes) * 100) : 0;
  return <PaperCard title={t(lang, 'publish_title')} tape className="settings-panel">
    <p>{t(lang, 'publish_privacy_note')}</p>
    <label><span>{t(lang, 'publish_local_companion')}</span><select value={selectedId} disabled={busy} onChange={(event) => { const companion = companions.find(item => item.id === event.target.value); setSelectedId(event.target.value); if (companion) setName(companion.name); }}>{companions.map(companion => <option key={companion.id} value={companion.id}>{companion.name}</option>)}</select></label>
    <label><span>{t(lang, 'publish_public_name')}</span><input value={name} maxLength={60} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
    <label><span>{t(lang, 'publish_public_description')}</span><textarea value={description} maxLength={500} disabled={busy} onChange={(event) => setDescription(event.target.value)} /></label>
    <label><span>{t(lang, 'publish_tags')}</span><input value={tags} disabled={busy} onChange={(event) => setTags(event.target.value)} placeholder={t(lang, 'publish_tags_placeholder')} /></label>
    <p><strong>{t(lang, 'publish_visibility')}</strong></p>
    <label className="checkbox-row"><input type="checkbox" checked={includeVoices} disabled={busy} onChange={(event) => setIncludeVoices(event.target.checked)} /><span>{t(lang, 'publish_include_voices')}</span></label>
    {includeVoices && <p>{t(lang, 'publish_voice_note')}</p>}
    {inspection && <p>{t(lang, 'publish_ready', { files: inspection.totalFiles, size: (inspection.totalBytes / 1024 / 1024).toFixed(2) })}</p>}
    {publishProgress && <ActionProgress value={percent} label={t(lang, 'publish_progress', { state: publishProgressLabel(publishProgress.state, lang), completed: publishProgress.completedFiles, total: publishProgress.totalFiles, percent })} />}
    <div className="action-row"><button className="btn-secondary btn-sm" disabled={busy || !selected} onClick={() => void inspect()}>{t(lang, 'publish_inspect')}</button><button className="btn-primary btn-sm" disabled={busy || !selected || !name.trim()} onClick={() => void publish()}>{busy ? t(lang, 'publish_publishing') : t(lang, 'publish_publish')}</button><button className="btn-ghost btn-sm" disabled={!busy} onClick={() => void cancel()}>{t(lang, 'publish_cancel_upload')}</button><button className="btn-ghost btn-sm" disabled={busy || !networkCompanionId} onClick={() => void unpublish()}>{t(lang, 'publish_unpublish')}</button></div>
    {status && <p aria-live="polite">{status}</p>}
  </PaperCard>;
}

function publishProgressLabel(state: AssetUploadProgress['state'], lang: Lang): string {
  const key: Record<AssetUploadProgress['state'], import('../../i18n').TranslationKey> = {
    preparing: 'publish_state_preparing', uploading: 'publish_state_uploading', verifying: 'publish_state_verifying', completed: 'publish_state_completed', cancelled: 'publish_state_cancelled', failed: 'publish_state_failed',
  };
  return t(lang, key[state]);
}
