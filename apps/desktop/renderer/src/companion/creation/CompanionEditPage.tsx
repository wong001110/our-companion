import { useCallback, useEffect, useRef, useState } from "react";
import { COMPANION_ANIMATION_MANIFEST, type
  CompanionPersonality,
  CompanionProfile,
} from "@our-companion/shared";
import { useAnalyzePersonality } from "./useAnalyzePersonality";

interface CompanionEditPageProps {
  companion: CompanionProfile;
  onComplete: (companion: CompanionProfile) => void;
  onCancel?: () => void;
}

const PERSONALITY_LABELS: Record<keyof CompanionPersonality, string> = {
  energy: "Energy",
  curiosity: "Curiosity",
  sociability: "Sociability",
  diligence: "Diligence",
  playfulness: "Playfulness",
  confidence: "Confidence",
  calmness: "Calmness",
  shyness: "Shyness",
};

const ALL_ANIMATIONS = COMPANION_ANIMATION_MANIFEST.map((entry) => entry.key);

interface AssetFile {
  name: string;
  size: number;
  subfolder: string;
}

interface StagedAsset {
  file: File;
  dataUrl: string;
}

function guessAnimationName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[- ]/g, "_");
  const match = ALL_ANIMATIONS.find(
    (a) => a.toLowerCase() === base.toLowerCase(),
  );
  return match ?? null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StagedSpritePreview({ dataUrl }: { dataUrl: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
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
    img.src = dataUrl;
  }, [dataUrl]);

  if (!src) return <div className="animation-preview-placeholder" />;
  return <img className="animation-preview-img" src={src} alt="staged" />;
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
  const [stagedAssets, setStagedAssets] = useState<Record<string, StagedAsset>>({});
  const [assetVersion, setAssetVersion] = useState(0);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const diskByName = new Map(
    diskAssets
      .filter((a) => a.subfolder === "animations")
      .map((a) => [a.name.replace(/\.[^.]+$/, ""), a]),
  );
  const allAnimationNames = ALL_ANIMATIONS.map((animName) => ({
    animName,
    staged: stagedAssets[animName] ?? null,
    disk: diskByName.get(animName) ?? null,
  }));

  const loadAssets = useCallback(async () => {
    try {
      const list = await window.ourCompanion.companionNew.listAssets(
        companion.id,
      );
      setDiskAssets(list);
      setAssetVersion((v) => v + 1);
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

  function handleFileSelect(
    animationName: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.name.match(/\.png$/i)) {
      setError(`Only PNG files supported`);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.naturalHeight < 300) {
        setError(
          `${animationName}: image height must be at least 300px (got ${img.naturalHeight}px)`,
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setStagedAssets((prev) => ({
          ...prev,
          [animationName]: { file, dataUrl: reader.result as string },
        }));
      };
      reader.readAsDataURL(file);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError(`Failed to load image: ${file.name}`);
    };
    img.src = objectUrl;
  }

  function handleRemoveStaged(animationName: string) {
    setStagedAssets((prev) => {
      const next = { ...prev };
      delete next[animationName];
      return next;
    });
  }

  function guessAnimationName(fileName: string): string | null {
    const base = fileName.replace(/\.[^.]+$/, "").replace(/[- ]/g, "_");
    return (
      ALL_ANIMATIONS.find((a) => a.toLowerCase() === base.toLowerCase()) ?? null
    );
  }

  async function handleBulkUpload() {
    const selected = await window.ourCompanion.dialog.openFiles();
    if (!selected || selected.length === 0) return;

    const errors: string[] = [];

    for (const { name, dataUrl } of selected) {
      const animName = guessAnimationName(name);
      if (!animName) {
        errors.push(`${name}: no match`);
        continue;
      }
      const height = await getImageHeight(dataUrl);
      if (height < 300) {
        errors.push(`${name}: height < 300px`);
        continue;
      }
      setStagedAssets((prev) => ({
        ...prev,
        [animName]: { file: new File([dataUrlToBlob(dataUrl)], name, { type: 'image/png' }), dataUrl }
      }));
    }

    if (errors.length > 0) {
      setError(errors.join('; '));
    }
  }

  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getImageHeight(dataUrl: string): Promise<number> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalHeight);
      img.onerror = () => resolve(0);
      img.src = dataUrl;
    });
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

    setStagedAssets({});
    await loadAssets();
    return true;
  }

  async function handleSave() {
    if (!name.trim()) return;
    const personalityChanged = description.trim() !== companion.personalityDescription;
    if (personalityChanged && !personalityAnalysisId) {
      setError('Analyze the updated personality description with AI before saving.');
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

  const missingCount = allAnimationNames.filter(
    (a) => !a.staged && !a.disk,
  ).length;
  const stagedCount = Object.keys(stagedAssets).length;

  return (
    <div className="edit-page">
      <div className="edit-header">
        <button className="edit-back-btn" onClick={onCancel} title="Back">
          ←
        </button>
        <div>
          <h1>Edit {companion.name}</h1>
          <p className="edit-subtitle">Update your companion&apos;s details</p>
        </div>
      </div>

      <div className="edit-section">
        <label className="edit-section-title">Name</label>
        <input
          className="creation-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Companion name"
        />
      </div>

      <div className="edit-section">
        <label className="edit-section-title">Personality Description</label>
        <textarea
          className="creation-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your companion's personality..."
          rows={4}
        />
        <div className="edit-analyze-row">
          <button
            className="btn-secondary btn-sm"
            disabled={!description.trim() || analyzing}
            onClick={() => void handleAnalyze()}
          >
            {analyzing ? "Analyzing..." : "Re-analyze Personality"}
          </button>
          {analyzeError && (
            <span className="edit-analyze-error">{analyzeError}</span>
          )}
        </div>
      </div>

      <div className="edit-section">
        <label className="edit-section-title">Personality Traits</label>
        <div className="personality-bars">
          {(
            Object.keys(PERSONALITY_LABELS) as (keyof CompanionPersonality)[]
          ).map((key) => (
            <div key={key} className="personality-bar-row">
              <span className="personality-label">
                {PERSONALITY_LABELS[key]}
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
        <label className="edit-section-title">Sprite Animations</label>
        <p className="edit-section-hint">
          {missingCount > 0
            ? `${missingCount} of ${ALL_ANIMATIONS.length} animations missing.`
            : "All animations uploaded!"}
          {stagedCount > 0 && (
            <span className="edit-staged-badge">{stagedCount} staged</span>
          )}
        </p>

        <div className="animation-bulk-row">
          <button className="btn-secondary btn-sm" onClick={() => void handleBulkUpload()}>
            Bulk Upload
          </button>
          <span className="animation-bulk-hint">Select multiple files — auto-matches by filename</span>
        </div>

        <div className="animation-grid">
          {allAnimationNames.map(({ animName, staged, disk }) => {
            const inputRef = (el: HTMLInputElement | null) => {
              fileInputRefs.current[animName] = el;
            };
            return (
              <div
                key={`${animName}-${assetVersion}`}
                className={`animation-slot ${staged || disk ? "animation-slot-filled" : ""}`}
              >
                {staged ? (
                  <StagedSpritePreview dataUrl={staged.dataUrl} />
                ) : disk ? (
                  <DiskSpritePreview
                    companionId={companion.id}
                    fileName={disk.name}
                  />
                ) : null}
                <div className="animation-slot-header">
                  <span className="animation-slot-name">
                    {(staged || disk) && (
                      <span className="animation-slot-check">✓</span>
                    )}
                    {animName}
                  </span>
                  {staged && (
                    <span className="animation-slot-staged">staged</span>
                  )}
                  {disk && !staged && (
                    <span className="animation-slot-size">
                      {formatSize(disk.size)}
                    </span>
                  )}
                </div>
                <div className="animation-slot-actions">
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".png"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileSelect(animName, e)}
                  />
                  {staged ? (
                    <>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => fileInputRefs.current[animName]?.click()}
                      >
                        Replace
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => handleRemoveStaged(animName)}
                      >
                        Remove
                      </button>
                    </>
                  ) : disk ? (
                    <>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => fileInputRefs.current[animName]?.click()}
                      >
                        Replace
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() =>
                          void handleDeleteDiskAsset(disk.subfolder, disk.name)
                        }
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => fileInputRefs.current[animName]?.click()}
                    >
                      Upload
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="creation-error">{error}</p>}

      <div className="edit-actions">
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={saving || !name.trim()}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
