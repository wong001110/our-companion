import { useCallback, useEffect, useMemo, useState } from "react";
import { COMPANION_ANIMATION_MANIFEST, type
  CompanionPersonality,
  CompanionProfile,
} from "@our-companion/shared";
import { useAnalyzePersonality } from "./useAnalyzePersonality";
import { useSpriteAssetStaging } from "../../features/assets/useSpriteAssetStaging";
import { BulkAssetUploader } from "../../features/assets/BulkAssetUploader";
import { SpriteAssetGrid } from "../../features/assets/SpriteAssetGrid";
import type { ExistingSpriteAsset } from "../../features/assets/SpriteAssetSlot";
import { formatSpriteAssetError } from '../../features/assets/assetErrorMessage';
import type { SpriteAssetError } from '../../features/assets/useSpriteAssetStaging';
import { t, type TranslationKey } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

interface CompanionEditPageProps {
  companion: CompanionProfile;
  onComplete: (companion: CompanionProfile) => void;
  onCancel?: () => void;
}

const PERSONALITY_LABEL_KEYS: Record<keyof CompanionPersonality, TranslationKey> = {
  energy: 'personality_energy', curiosity: 'personality_curiosity', sociability: 'personality_sociability', diligence: 'personality_diligence',
  playfulness: 'personality_playfulness', confidence: 'personality_confidence', calmness: 'personality_calmness', shyness: 'personality_shyness',
};

const ALL_ANIMATIONS = COMPANION_ANIMATION_MANIFEST.map((entry) => entry.key);

interface AssetFile {
  name: string;
  size: number;
  subfolder: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DiskSpritePreview({
  companionId,
  fileName,
}: {
  companionId: string;
  fileName: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.ourCompanion.companionNew
      .readAsset({
        companionId,
        subfolder: "animations",
        fileName,
      })
      .then((result) => {
        if (cancelled || !result?.dataUrl) return;
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          const frameW = img.naturalHeight;
          const frameH = img.naturalHeight;
          const canvas = document.createElement("canvas");
          canvas.width = frameW;
          canvas.height = frameH;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.clearRect(0, 0, frameW, frameH);
          ctx.drawImage(img, 0, 0, frameW, frameH, 0, 0, frameW, frameH);
          setSrc(canvas.toDataURL("image/png"));
        };
        img.src = result.dataUrl;
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
    };
  }, [companionId, fileName]);

  if (!src) return <div className="animation-preview-placeholder" />;
  return <img className="animation-preview-img" src={src} alt={fileName} />;
}

export function CompanionEditPage({
  companion,
  onComplete,
  onCancel,
}: CompanionEditPageProps) {
  const lang = useLang();
  const [name, setName] = useState(companion.name);
  const [description, setDescription] = useState(
    companion.personalityDescription,
  );
  const [personality, setPersonality] = useState<CompanionPersonality>(
    companion.personality,
  );
  const [personalityAnalysisId, setPersonalityAnalysisId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { analyze, analyzing, error: analyzeError } = useAnalyzePersonality();

  const [diskAssets, setDiskAssets] = useState<AssetFile[]>([]);

  const diskByName = new Map(
    diskAssets
      .filter((a) => a.subfolder === "animations")
      .map((a) => [a.name.replace(/\.[^.]+$/, ""), a]),
  );
  const existingAssets = Object.fromEntries([...diskByName.keys()].map((name) => [name, true]));
  const { stagedAssets, missingRequired, errors: assetErrors, stageFile, stageBulkFiles, removeStaged, clear } = useSpriteAssetStaging({ animationManifest: ALL_ANIMATIONS, existingAssets });

  const loadAssets = useCallback(async () => {
    try {
      const list = await window.ourCompanion.companionNew.listAssets(
        companion.id,
      );
      setDiskAssets(list);
    } catch {
      /* ignore */
    }
  }, [companion.id]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  async function handleAnalyze() {
    if (!description.trim()) return;
    const result = await analyze(description);
    if (result) {
      setPersonality(result.personality);
      setPersonalityAnalysisId(result.analysisId);
    }
  }

  async function handleBulkUpload() {
    const selected = await window.ourCompanion.dialog.openFiles();
    if (!selected || selected.length === 0) return;

    await stageBulkFiles(selected);
  }

  async function handleDeleteDiskAsset(subfolder: string, fileName: string) {
    try {
      await window.ourCompanion.companionNew.deleteAsset({
        companionId: companion.id,
        subfolder,
        fileName,
      });
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function commitStagedAssets(): Promise<boolean> {
    const entries = Object.entries(stagedAssets);
    if (entries.length === 0) return true;

    for (const [animName, staged] of entries) {
      try {
        const arrayBuffer = await staged.file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        await window.ourCompanion.companionNew.uploadAsset({
          companionId: companion.id,
          fileName: `${animName}.png`,
          buffer: uint8,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    }

    clear();
    await loadAssets();
    return true;
  }

  async function handleSave() {
    if (!name.trim()) return;
    const personalityChanged = description.trim() !== companion.personalityDescription;
    if (personalityChanged && !personalityAnalysisId) {
      setError(t(lang, 'edit_analyze_before_save'));
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const committed = await commitStagedAssets();
      if (!committed) return;

      const updated = await window.ourCompanion.companionNew.update({
        id: companion.id,
        name: name.trim(),
        ...(personalityChanged ? {
          personalityDescription: description.trim(), personality, personalityAnalysisId: personalityAnalysisId!,
        } : {}),
      });
      onComplete(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const missingCount = missingRequired.length;
  const stagedCount = Object.keys(stagedAssets).length;
  const existingSpriteAssets = useMemo<Record<string, ExistingSpriteAsset>>(() => Object.fromEntries(
    [...diskByName.entries()].map(([animationName, disk]) => [animationName, {
      preview: <DiskSpritePreview companionId={companion.id} fileName={disk.name} />,
      detail: formatSize(disk.size),
      remove: () => { void handleDeleteDiskAsset(disk.subfolder, disk.name); },
    }]),
  ), [companion.id, diskByName]);

  return (
    <div className="edit-page">
      <div className="edit-header">
        <button className="edit-back-btn" onClick={onCancel} title={t(lang, 'edit_back')}>
          ←
        </button>
        <div>
          <h1>{t(lang, 'edit_title', { name: companion.name })}</h1>
          <p className="edit-subtitle">{t(lang, 'edit_subtitle')}</p>
        </div>
      </div>

      <div className="edit-section">
        <label className="edit-section-title">{t(lang, 'edit_name_label')}</label>
        <input
          className="creation-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(lang, 'edit_name_placeholder')}
        />
      </div>

      <div className="edit-section">
        <label className="edit-section-title">{t(lang, 'edit_personality_label')}</label>
        <textarea
          className="creation-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t(lang, 'edit_personality_placeholder')}
          rows={4}
        />
        <div className="edit-analyze-row">
          <button
            className="btn-secondary btn-sm"
            disabled={!description.trim() || analyzing}
            onClick={() => void handleAnalyze()}
          >
            {analyzing ? t(lang, 'creation_analyzing') : t(lang, 'edit_reanalyze')}
          </button>
          {analyzeError && (
            <span className="edit-analyze-error">{analyzeError}</span>
          )}
        </div>
      </div>

      <div className="edit-section">
        <label className="edit-section-title">{t(lang, 'edit_traits')}</label>
        <div className="personality-bars">
          {(
            Object.keys(PERSONALITY_LABEL_KEYS) as (keyof CompanionPersonality)[]
          ).map((key) => (
            <div key={key} className="personality-bar-row">
              <span className="personality-label">
                {t(lang, PERSONALITY_LABEL_KEYS[key])}
              </span>
              <div className="personality-bar-track">
                <div
                  className="personality-bar-fill"
                  style={{ width: `${personality[key]}%` }}
                />
              </div>
              <span className="personality-value">{personality[key]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="edit-section">
        <label className="edit-section-title">{t(lang, 'edit_sprite_animations')}</label>
        <p className="edit-section-hint">
          {missingCount > 0
            ? t(lang, 'creation_missing_animations', { count: missingCount, total: ALL_ANIMATIONS.length })
            : t(lang, 'creation_all_animations_uploaded')}
          {stagedCount > 0 && (
            <span className="edit-staged-badge">{t(lang, 'edit_staged_count', { count: stagedCount })}</span>
          )}
        </p>
        {assetErrors.map((assetError: SpriteAssetError) => <p className="creation-error" key={`${assetError.code}-${assetError.name}`}>{formatSpriteAssetError(assetError, lang)}</p>)}

        <BulkAssetUploader onUpload={() => void handleBulkUpload()} />
        <SpriteAssetGrid
          animationNames={ALL_ANIMATIONS}
          stagedAssets={stagedAssets}
          existingAssets={existingSpriteAssets}
          onStageFile={(animationName, file) => void stageFile(animationName, file)}
          onRemoveStaged={removeStaged}
        />
      </div>

      {error && <p className="creation-error">{error}</p>}

      <div className="edit-actions">
        <button className="btn-secondary" onClick={onCancel}>
          {t(lang, 'creation_cancel')}
        </button>
        <button
          className="btn-primary"
          disabled={saving || !name.trim()}
          onClick={() => void handleSave()}
        >
          {saving ? t(lang, 'edit_saving') : t(lang, 'edit_save_changes')}
        </button>
      </div>
    </div>
  );
}
