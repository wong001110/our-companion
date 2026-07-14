import { useEffect, useState } from 'react';
import type { CompanionProfile, CompanionPersonality, AiSettings } from '@our-companion/shared';
import { t, type Lang, type TranslationKey } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { InlineNotice } from '../../components/feedback/InlineNotice';

interface CompanionSelectionPageProps {
  onSelect: (companion: CompanionProfile) => void;
  onCreateNew: () => void;
  onEdit: (companion: CompanionProfile) => void;
  refreshKey?: number;
}

const PERSONALITY_TRAITS: (keyof CompanionPersonality)[] = [
  'energy', 'curiosity', 'sociability', 'diligence',
  'playfulness', 'confidence', 'calmness', 'shyness'
];

function CompanionAvatar({ companion, lang }: { companion: CompanionProfile; lang: Lang }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.ourCompanion.companionNew.readAsset({
      companionId: companion.id,
      subfolder: 'animations',
      fileName: 'Idle_Neutral.png'
    }).then((result) => {
      if (cancelled || !result?.dataUrl) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const frameW = img.naturalHeight;
        const frameH = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, frameW, frameH);
        ctx.drawImage(img, 0, 0, frameW, frameH, 0, 0, frameW, frameH);
        setSrc(canvas.toDataURL('image/png'));
      };
      img.src = result.dataUrl;
    }).catch(() => {
      if (!cancelled) setSrc(null);
    });

    return () => { cancelled = true; };
  }, [companion.id]);

  if (src) {
    return <img className="companion-card-sprite" src={src} alt={companion.name} />;
  }

  return (
    <div className="companion-card-avatar-missing">
      <span className="companion-card-avatar-missing-icon">?</span>
      <span className="companion-card-avatar-missing-text">{t(lang, 'selection_no_sprite')}</span>
    </div>
  );
}

export function CompanionSelectionPage({ onSelect, onCreateNew, onEdit, refreshKey = 0 }: CompanionSelectionPageProps) {
  const lang = useLang();
  const [companions, setCompanions] = useState<CompanionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<CompanionProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [savingAi, setSavingAi] = useState(false);
  const [aiSaveMsg, setAiSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadCompanions();
    void loadAiSettings();
  }, [refreshKey]);

  async function loadCompanions() {
    setLoading(true);
    try {
      const list = await window.ourCompanion.companionNew.list();
      setCompanions(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadAiSettings() {
    try {
      const settings = await window.ourCompanion.ai.getSettings();
      setAiSettings(settings);
      setModel(settings.model);
      setEndpoint(settings.endpoint);
    } catch {
      // ignore
    }
  }

  async function handleSaveAi() {
    setSavingAi(true);
    setAiSaveMsg(null);
    try {
      const input: Record<string, string> = {};
      if (model.trim()) input.model = model.trim();
      if (endpoint.trim()) input.endpoint = endpoint.trim();
      if (apiKey.trim()) input.apiKey = apiKey.trim();
      const updated = await window.ourCompanion.ai.updateSettings(input);
      setAiSettings(updated);
      setApiKey('');
      setAiSaveMsg(t(lang, 'selection_settings_saved'));
      setTimeout(() => setShowAiConfig(false), 800);
    } catch (err) {
      setAiSaveMsg(t(lang, 'selection_save_failed'));
    } finally {
      setSavingAi(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await window.ourCompanion.companionNew.delete(id);
      setConfirmDelete(null);
      await loadCompanions();
    } catch {
      setDeleteError(t(lang, 'selection_delete_failed'));
    } finally {
      setDeleting(false);
    }
  }

  function personalitySummary(p: CompanionPersonality): string {
    const top = PERSONALITY_TRAITS
      .filter((t) => p[t] > 65)
      .map((trait) => t(lang, (`personality_${trait}` as TranslationKey)));
    return top.length > 0 ? top.join(', ') : t(lang, 'selection_balanced');
  }

  const aiConfigured = aiSettings?.apiKeyConfigured ?? false;

  if (loading) {
    return (
      <div className="companion-selection-page">
        <div className="selection-loading">{t(lang, 'selection_loading')}</div>
      </div>
    );
  }

  if (showAiConfig) {
    return (
      <div className="companion-selection-page">
        <div className="selection-header">
          <h1>{t(lang, 'selection_ai_settings')}</h1>
          <p>{t(lang, 'selection_ai_intro')}</p>
        </div>
        <div className="ai-config-form">
          <label className="creation-label">{t(lang, 'selection_api_key')}</label>
          <input
            className="creation-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={aiConfigured ? t(lang, 'selection_api_key_existing') : t(lang, 'selection_api_key_placeholder')}
            autoFocus
          />
          <label className="creation-label">{t(lang, 'selection_model')}</label>
          <input
            className="creation-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-chat"
          />
          <label className="creation-label">{t(lang, 'selection_endpoint')}</label>
          <input
            className="creation-input"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.deepseek.com"
          />
          {aiSaveMsg && <p className="creation-error" style={{ color: aiSaveMsg === t(lang, 'selection_settings_saved') ? '#81c995' : undefined }}>{aiSaveMsg}</p>}
          <div className="creation-actions">
            <button className="btn-secondary" onClick={() => { setShowAiConfig(false); setAiSaveMsg(null); }}>{t(lang, 'creation_back')}</button>
            <button className="btn-primary" disabled={savingAi} onClick={() => void handleSaveAi()}>
              {savingAi ? t(lang, 'edit_saving') : t(lang, 'home_save')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="companion-selection-page">
      <div className="selection-header">
        <h1>{t(lang, 'selection_choose_title')}</h1>
        <p>{t(lang, 'selection_choose_intro')}</p>
      </div>
      {!aiConfigured && (
        <div className="ai-config-banner">
          <span>{t(lang, 'selection_ai_required')}</span>
          <button className="btn-secondary btn-sm" onClick={() => setShowAiConfig(true)}>{t(lang, 'selection_configure_ai')}</button>
        </div>
      )}
      <div className="companion-grid">
        {companions.map((companion) => (
          <div key={companion.id} className={`companion-card ${companion.isPrimary ? 'companion-card-primary' : ''}`}>
            <CompanionAvatar companion={companion} lang={lang} />
            <h3 className="companion-card-name">{companion.name}</h3>
            <p className="companion-card-trait">{personalitySummary(companion.personality)}</p>
            {companion.isPrimary && <span className="companion-card-badge">{t(lang, 'selection_active')}</span>}
            <div className="companion-card-actions">
              <button className="btn-primary btn-sm" onClick={() => void onSelect(companion)}>{t(lang, 'selection_start')}</button>
              <button className="btn-secondary btn-sm" onClick={() => onEdit(companion)}>{t(lang, 'selection_edit')}</button>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(companion)}>{t(lang, 'selection_delete')}</button>
            </div>
          </div>
        ))}
        <button type="button" className="companion-card companion-card-new" data-testid="create-new-companion" onClick={onCreateNew}>
          <div className="companion-card-avatar new-avatar">+</div>
          <h3 className="companion-card-name">{t(lang, 'selection_new_companion')}</h3>
          <p className="companion-card-trait">{t(lang, 'selection_new_companion_hint')}</p>
        </button>
      </div>
      <div className="selection-footer">
        <button className="btn-ghost btn-sm" onClick={() => setShowAiConfig(true)}>
          {aiConfigured ? t(lang, 'selection_ai_settings') : t(lang, 'selection_configure_ai')}
        </button>
      </div>
      {deleteError && <InlineNotice tone="error">{deleteError}</InlineNotice>}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={t(lang, 'selection_delete_title')}
        description={confirmDelete ? t(lang, 'selection_delete_confirm', { name: confirmDelete.name }) : ''}
        confirmLabel={t(lang, 'selection_delete')}
        busy={deleting}
        danger
        onClose={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={() => { if (confirmDelete) void handleDelete(confirmDelete.id); }}
      />
    </div>
  );
}
