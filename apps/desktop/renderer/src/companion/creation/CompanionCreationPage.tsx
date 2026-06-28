import { useState } from 'react';
import type { CompanionPersonality, CompanionProfile } from '@our-companion/shared';
import { useAnalyzePersonality } from './useAnalyzePersonality';

interface CompanionCreationPageProps {
  editCompanion?: CompanionProfile;
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

export function CompanionCreationPage({ editCompanion, onComplete, onCancel }: CompanionCreationPageProps) {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState(editCompanion?.name ?? '');
  const [description, setDescription] = useState(editCompanion?.personalityDescription ?? '');
  const [personality, setPersonality] = useState<CompanionPersonality | null>(editCompanion?.personality ?? null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { analyze, analyzing, error: analyzeError } = useAnalyzePersonality();

  async function handleAnalyze() {
    if (!description.trim()) return;
    const result = await analyze(description);
    if (result) {
      setPersonality(result);
      setStep(4);
    }
  }

  async function handleCreate() {
    if (!name.trim() || !personality) return;
    setCreating(true);
    setError(null);

    try {
      const input = {
        name: name.trim(),
        personalityDescription: description,
        personality,
        assetRoot: 'assets/companions/ann'
      };

      let companion: CompanionProfile;
      if (editCompanion) {
        companion = await window.ourCompanion.companionNew.update({ id: editCompanion.id, ...input });
      } else {
        companion = await window.ourCompanion.companionNew.create(input);
      }
      await window.ourCompanion.companionNew.setPrimary(companion.id);
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
        <h1>{editCompanion ? 'Edit Companion' : 'Create Your Companion'}</h1>
        <p className="creation-subtitle">
          {editCompanion ? 'Update your companion\'s personality' : 'Describe who your companion is'}
        </p>

        {step === 1 && (
          <div className="creation-step">
            <label className="creation-label">Companion Name</label>
            <input
              className="creation-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ann"
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
              placeholder="e.g. Ann is quiet, curious, slightly lazy and enjoys exploring new things."
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

        {step === 4 && personality && (
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
              <button className="btn-primary" disabled={creating} onClick={() => void handleCreate()}>
                {creating ? 'Creating...' : (editCompanion ? 'Save Changes' : 'Create Companion')}
              </button>
            </div>
            {error && <p className="creation-error">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
