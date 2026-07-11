import { useCallback, useEffect, useRef, useState } from 'react';
import { COMPANION_ANIMATION_MANIFEST, type CompanionPersonality, type CompanionProfile } from '@our-companion/shared';
import { useAnalyzePersonality } from './useAnalyzePersonality';

interface CompanionCreationPageProps {
  onComplete: (companion: CompanionProfile) => void;
  onCancel?: () => void;
}

const PERSONALITY_LABELS: Record<keyof CompanionPersonality, string> = {
  energy: 'Energy',
  curiosity: 'Curiosity',
  sociability: 'Sociability',
  diligence: 'Diligence',
  playfulness: 'Playfulness',
  confidence: 'Confidence',
  calmness: 'Calmness',
  shyness: 'Shyness'
};

const REQUIRED_ANIMATIONS = COMPANION_ANIMATION_MANIFEST
  .filter((entry) => entry.requiredForCreation)
  .map((entry) => entry.key);

interface StagedAsset {
  file: File;
  dataUrl: string;
}

export function CompanionCreationPage({ onComplete, onCancel }: CompanionCreationPageProps) {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [personality, setPersonality] = useState<CompanionPersonality | null>(null);
  const [personalityAnalysisId, setPersonalityAnalysisId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { analyze, analyzing, error: analyzeError } = useAnalyzePersonality();

  const [stagedAssets, setStagedAssets] = useState<Record<string, StagedAsset>>({});
  const [assetVersion, setAssetVersion] = useState(0);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const missingCount = REQUIRED_ANIMATIONS.filter((a) => !stagedAssets[a]).length;

  function handleFileSelect(animationName: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.name.match(/\.png$/i)) {
      setError(`Only PNG files supported`);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.naturalHeight < 300) {
        setError(`${animationName}: image height must be at least 300px (got ${img.naturalHeight}px)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setStagedAssets((prev) => ({
          ...prev,
          [animationName]: { file, dataUrl: reader.result as string }
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

  function guessAnimName(fileName: string): string | null {
    const base = fileName.replace(/\.[^.]+$/, '').replace(/[- ]/g, '_');
    console.log('[BULK] match attempt:', fileName, '->', base);
    const result = REQUIRED_ANIMATIONS.find((a) => a.toLowerCase() === base.toLowerCase()) ?? null;
    console.log('[BULK] match result:', result);
    return result;
  }

  async function handleBulkUpload() {
    const selected = await window.ourCompanion.dialog.openFiles();
    if (!selected || selected.length === 0) return;

    const errors: string[] = [];

    for (const { name, dataUrl } of selected) {
      const animName = guessAnimName(name);
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

  async function handleAnalyze() {
    if (!description.trim()) return;
    const result = await analyze(description);
    if (result) {
      setPersonality(result.personality);
      setPersonalityAnalysisId(result.analysisId);
      setStep(3);
    }
  }

  async function handleCreate() {
    if (!name.trim() || !personality || !personalityAnalysisId) return;
    setCreating(true);
    setError(null);

    try {
      const assets = await Promise.all(REQUIRED_ANIMATIONS.map(async (animationKey) => ({
        animationKey,
        buffer: new Uint8Array(await stagedAssets[animationKey].file.arrayBuffer()),
      })));
      const companion = await window.ourCompanion.companionNew.create({
        name: name.trim(), personalityDescription: description.trim(), personalityAnalysisId,
        assetRoot: '', assets,
      });
      onComplete(companion);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  function StagedPreview({ dataUrl }: { dataUrl: string }) {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
      const img = new Image();
      img.onload = () => {
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
      img.src = dataUrl;
    }, [dataUrl]);
    if (!src) return null;
    return <img className="animation-preview-img" src={src} alt="staged" style={{ width: '100%', aspectRatio: '1', borderRadius: 6 }} />;
  }

  return (
    <div className="companion-creation-page">
      <div className="creation-card">
        <h1>Create Your Companion</h1>
        <p className="creation-subtitle">Describe who your companion is</p>

        {step === 1 && (
          <div className="creation-step">
            <label className="creation-label">Companion Name</label>
            <input
              className="creation-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nova"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) setStep(2); }}
            />
            <div className="creation-actions">
              {onCancel && <button className="btn-secondary" onClick={onCancel}>Cancel</button>}
              <button className="btn-primary" disabled={!name.trim()} onClick={() => setStep(2)}>Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="creation-step">
            <label className="creation-label">Describe your companion&apos;s personality</label>
            <textarea
              className="creation-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Quiet, curious, slightly lazy, and enjoys exploring new things."
              rows={5}
              autoFocus
            />
            <div className="creation-actions">
              <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button className="btn-primary" disabled={!description.trim() || analyzing} onClick={() => void handleAnalyze()}>
                {analyzing ? 'Analyzing...' : 'Analyze Personality'}
              </button>
            </div>
            {analyzeError && <p className="creation-error">{analyzeError}</p>}
          </div>
        )}

        {step === 3 && personality && (
          <div className="creation-step">
            <label className="creation-label">Personality Preview</label>
            <div className="personality-bars">
              {(Object.keys(PERSONALITY_LABELS) as (keyof CompanionPersonality)[]).map((key) => (
                <div key={key} className="personality-bar-row">
                  <span className="personality-label">{PERSONALITY_LABELS[key]}</span>
                  <div className="personality-bar-track">
                    <div className="personality-bar-fill" style={{ width: `${personality[key]}%` }} />
                  </div>
                  <span className="personality-value">{personality[key]}</span>
                </div>
              ))}
            </div>
            <div className="creation-actions">
              <button className="btn-secondary" onClick={() => setStep(2)}>Re-analyze</button>
              <button className="btn-primary" onClick={() => { setError(null); setStep(4); }}>Next</button>
            </div>
            {error && <p className="creation-error">{error}</p>}
          </div>
        )}

        {step === 4 && (
          <div className="creation-step">
            <label className="creation-label">Upload Sprite Assets</label>
            <p className="creation-subtitle" style={{ margin: 0 }}>
              {missingCount > 0
                ? `${missingCount} of ${REQUIRED_ANIMATIONS.length} required animations missing.`
                : 'All required animations uploaded!'}
            </p>

            <div className="animation-bulk-row" style={{ marginTop: 12 }}>
              <button className="btn-secondary btn-sm" onClick={() => void handleBulkUpload()}>
                Bulk Upload
              </button>
              <span className="animation-bulk-hint">Select multiple files — auto-matches by filename</span>
            </div>

            <div className="animation-grid" style={{ marginTop: 12 }}>
              {REQUIRED_ANIMATIONS.map((animName) => {
                const staged = stagedAssets[animName];
                const inputRef = (el: HTMLInputElement | null) => { fileInputRefs.current[animName] = el; };
                return (
                  <div key={`${animName}-${assetVersion}`} className={`animation-slot ${staged ? 'animation-slot-filled' : ''}`}>
                    {staged && <StagedPreview dataUrl={staged.dataUrl} />}
                    <div className="animation-slot-header">
                      <span className="animation-slot-name">
                        {staged && <span className="animation-slot-check">✓</span>}
                        {animName}
                      </span>
                      {staged && <span className="animation-slot-staged">staged</span>}
                    </div>
                    <div className="animation-slot-actions">
                      <input
                        ref={inputRef}
                        type="file"
                        accept=".png"
                        style={{ display: 'none' }}
                        onChange={(e) => handleFileSelect(animName, e)}
                      />
                      {staged ? (
                        <>
                          <button className="btn-secondary btn-sm" onClick={() => fileInputRefs.current[animName]?.click()}>Replace</button>
                          <button className="btn-ghost btn-sm" onClick={() => handleRemoveStaged(animName)}>Remove</button>
                        </>
                      ) : (
                        <button className="btn-secondary btn-sm" onClick={() => fileInputRefs.current[animName]?.click()}>Upload</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="creation-actions">
              <button className="btn-secondary" onClick={() => setStep(3)}>Back</button>
              <button className="btn-primary" disabled={creating || missingCount > 0} onClick={() => void handleCreate()}>
                {creating ? 'Creating...' : 'Create Companion'}
              </button>
            </div>
            {missingCount > 0 && <p className="creation-error">All {REQUIRED_ANIMATIONS.length} animations must be uploaded before creating.</p>}
            {error && <p className="creation-error">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
