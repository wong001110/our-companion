import { useEffect, useRef, useState } from 'react';
import { COMPANION_ANIMATION_MANIFEST, type CompanionPersonality, type CompanionProfile } from '@our-companion/shared';
import { useAnalyzePersonality } from './useAnalyzePersonality';
import { useSpriteAssetStaging } from '../../features/assets/useSpriteAssetStaging';
import { BulkAssetUploader } from '../../features/assets/BulkAssetUploader';
import { SpriteAssetGrid } from '../../features/assets/SpriteAssetGrid';
import { formatSpriteAssetError } from '../../features/assets/assetErrorMessage';
import { t, type TranslationKey } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

interface CompanionCreationPageProps {
  onComplete: (companion: CompanionProfile) => void;
  onCancel?: () => void;
}

const PERSONALITY_LABEL_KEYS: Record<keyof CompanionPersonality, TranslationKey> = {
  energy: 'personality_energy', curiosity: 'personality_curiosity', sociability: 'personality_sociability', diligence: 'personality_diligence',
  playfulness: 'personality_playfulness', confidence: 'personality_confidence', calmness: 'personality_calmness', shyness: 'personality_shyness',
};

const REQUIRED_ANIMATIONS = COMPANION_ANIMATION_MANIFEST
  .filter((entry) => entry.requiredForCreation)
  .map((entry) => entry.key);

export function CompanionCreationPage({ onComplete, onCancel }: CompanionCreationPageProps) {
  const lang = useLang();
  const [step, setStep] = useState<number>(1);
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward');
  const [stepMotionState, setStepMotionState] = useState<'entering' | 'entered'>('entering');
  const stepRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [personality, setPersonality] = useState<CompanionPersonality | null>(null);
  const [personalityAnalysisId, setPersonalityAnalysisId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { analyze, analyzing, error: analyzeError } = useAnalyzePersonality();

  const { stagedAssets, missingRequired, errors: assetErrors, stageFile, stageBulkFiles, removeStaged } = useSpriteAssetStaging({ animationManifest: REQUIRED_ANIMATIONS });

  const missingCount = missingRequired.length;

  const moveToStep = (nextStep: number) => {
    setStepDirection(nextStep < step ? 'back' : 'forward');
    setStep(nextStep);
  };

  useEffect(() => {
    setStepMotionState('entering');
    const enteredFrame = window.requestAnimationFrame(() => setStepMotionState('entered'));
    const focusFrame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => stepRef.current?.querySelector<HTMLElement>('input, textarea, button, [tabindex]')?.focus()));
    return () => {
      window.cancelAnimationFrame(enteredFrame);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [step]);

  async function handleBulkUpload() {
    const selected = await window.ourCompanion.dialog.openFiles();
    if (!selected || selected.length === 0) return;

    await stageBulkFiles(selected);
  }

  async function handleAnalyze() {
    if (!description.trim()) return;
    const result = await analyze(description);
    if (result) {
      setPersonality(result.personality);
      setPersonalityAnalysisId(result.analysisId);
      moveToStep(3);
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

  return (
    <div className="companion-creation-page">
      <div className="creation-card">
        <h1>{t(lang, 'creation_title')}</h1>
        <p className="creation-subtitle">{t(lang, 'creation_subtitle')}</p>

        {step === 1 && (
          <div key={step} ref={stepRef} className={`creation-step creation-step-${stepDirection}`} data-motion-state={stepMotionState}>
            <label className="creation-label">{t(lang, 'creation_name_label')}</label>
            <input
              className="creation-input"
              data-testid="creation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(lang, 'creation_name_placeholder')}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) moveToStep(2); }}
            />
            <div className="creation-actions">
              {onCancel && <button className="btn-secondary" onClick={onCancel}>{t(lang, 'creation_cancel')}</button>}
              <button className="btn-primary" data-testid="creation-next" disabled={!name.trim()} onClick={() => moveToStep(2)}>{t(lang, 'creation_next')}</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div key={step} ref={stepRef} className={`creation-step creation-step-${stepDirection}`} data-motion-state={stepMotionState}>
            <label className="creation-label">{t(lang, 'creation_description_label')}</label>
            <textarea
              className="creation-textarea"
              data-testid="creation-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(lang, 'creation_description_placeholder')}
              rows={5}
            />
            <div className="creation-actions">
              <button className="btn-secondary" onClick={() => moveToStep(1)}>{t(lang, 'creation_back')}</button>
              <button className="btn-primary" data-testid="creation-analyze" disabled={!description.trim() || analyzing} onClick={() => void handleAnalyze()}>
                {analyzing ? t(lang, 'creation_analyzing') : t(lang, 'creation_analyze')}
              </button>
            </div>
            {analyzeError && <p className="creation-error">{analyzeError}</p>}
          </div>
        )}

        {step === 3 && personality && (
          <div key={step} ref={stepRef} className={`creation-step creation-step-${stepDirection}`} data-testid="creation-assets" data-motion-state={stepMotionState}>
            <label className="creation-label">{t(lang, 'creation_personality_preview')}</label>
            <div className="personality-bars">
              {(Object.keys(PERSONALITY_LABEL_KEYS) as (keyof CompanionPersonality)[]).map((key) => (
                <div key={key} className="personality-bar-row">
                  <span className="personality-label">{t(lang, PERSONALITY_LABEL_KEYS[key])}</span>
                  <div className="personality-bar-track">
                    <div className="personality-bar-fill" style={{ width: `${personality[key]}%` }} />
                  </div>
                  <span className="personality-value">{personality[key]}</span>
                </div>
              ))}
            </div>
            <div className="creation-actions">
              <button className="btn-secondary" onClick={() => moveToStep(2)}>{t(lang, 'creation_reanalyze')}</button>
              <button className="btn-primary" onClick={() => { setError(null); moveToStep(4); }}>{t(lang, 'creation_next')}</button>
            </div>
            {error && <p className="creation-error">{error}</p>}
          </div>
        )}

        {step === 4 && (
          <div key={step} ref={stepRef} className={`creation-step creation-step-${stepDirection}`} data-motion-state={stepMotionState}>
            <label className="creation-label">{t(lang, 'creation_upload_assets')}</label>
            <p className="creation-subtitle" style={{ margin: 0 }}>
              {missingCount > 0
                ? t(lang, 'creation_missing_animations', { count: missingCount, total: REQUIRED_ANIMATIONS.length })
                : t(lang, 'creation_all_animations_uploaded')}
            </p>

            <div style={{ marginTop: 12 }}>
              <BulkAssetUploader onUpload={() => void handleBulkUpload()} />
            </div>
            <div style={{ marginTop: 12 }}>
              <SpriteAssetGrid
                animationNames={REQUIRED_ANIMATIONS}
                stagedAssets={stagedAssets}
                onStageFile={(animationName, file) => void stageFile(animationName, file)}
                onRemoveStaged={removeStaged}
              />
            </div>

            <div className="creation-actions">
              <button className="btn-secondary" onClick={() => moveToStep(3)}>{t(lang, 'creation_back')}</button>
              <button className="btn-primary" disabled={creating || missingCount > 0} onClick={() => void handleCreate()}>
                {creating ? t(lang, 'creation_creating') : t(lang, 'creation_create')}
              </button>
            </div>
            {missingCount > 0 && <p className="creation-error">{t(lang, 'creation_required_animations', { count: REQUIRED_ANIMATIONS.length })}</p>}
            {assetErrors.map((assetError) => <p className="creation-error" key={`${assetError.code}-${assetError.name}`}>{formatSpriteAssetError(assetError, lang)}</p>)}
            {error && <p className="creation-error">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
