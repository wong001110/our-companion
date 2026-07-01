import { useEffect, useState } from 'react';
import type { CompanionProfile, CompanionPersonality, AiSettings } from '@our-companion/shared';

interface CompanionSelectionPageProps {
  onSelect: (companion: CompanionProfile) => void;
  onCreateNew: () => void;
  onEdit: (companion: CompanionProfile) => void;
}

const PERSONALITY_TRAITS: (keyof CompanionPersonality)[] = [
  'energy', 'curiosity', 'sociability', 'diligence',
  'playfulness', 'confidence', 'calmness', 'shyness'
];

export function CompanionSelectionPage({ onSelect, onCreateNew, onEdit }: CompanionSelectionPageProps) {
  const [companions, setCompanions] = useState<CompanionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
  }, []);

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
      setAiSaveMsg('Settings saved');
      setTimeout(() => setShowAiConfig(false), 800);
    } catch (err) {
      setAiSaveMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAi(false);
    }
  }

  async function handleDelete(id: string) {
    await window.ourCompanion.companionNew.delete(id);
    setConfirmDelete(null);
    void loadCompanions();
  }

  async function handleEdit(companion: CompanionProfile) {
    if (companion.isBuiltIn) {
      const clone = await window.ourCompanion.companionNew.create({
        name: `${companion.name} (Copy)`,
        personalityDescription: companion.personalityDescription,
        personality: companion.personality,
        assetRoot: companion.assetRoot
      });
      const assetRoot = await window.ourCompanion.companionNew.getAssetRoot(clone.id);
      if (assetRoot !== clone.assetRoot) {
        const updated = await window.ourCompanion.companionNew.update({ id: clone.id, assetRoot });
        onEdit(updated);
      } else {
        onEdit(clone);
      }
    } else {
      onEdit(companion);
    }
  }

  function personalitySummary(p: CompanionPersonality): string {
    const top = PERSONALITY_TRAITS
      .filter((t) => p[t] > 65)
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1));
    return top.length > 0 ? top.join(', ') : 'Balanced';
  }

  const aiConfigured = aiSettings?.apiKeyConfigured ?? false;

  if (loading) {
    return (
      <div className="companion-selection-page">
        <div className="selection-loading">Loading companions...</div>
      </div>
    );
  }

  if (showAiConfig) {
    return (
      <div className="companion-selection-page">
        <div className="selection-header">
          <h1>AI Settings</h1>
          <p>Configure the AI provider for personality analysis and chat.</p>
        </div>
        <div className="ai-config-form">
          <label className="creation-label">API Key</label>
          <input
            className="creation-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={aiConfigured ? '(already set — leave blank to keep)' : 'Enter your DeepSeek API key'}
            autoFocus
          />
          <label className="creation-label">Model</label>
          <input
            className="creation-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="deepseek-chat"
          />
          <label className="creation-label">Endpoint</label>
          <input
            className="creation-input"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.deepseek.com"
          />
          {aiSaveMsg && <p className="creation-error" style={{ color: aiSaveMsg === 'Settings saved' ? '#81c995' : undefined }}>{aiSaveMsg}</p>}
          <div className="creation-actions">
            <button className="btn-secondary" onClick={() => { setShowAiConfig(false); setAiSaveMsg(null); }}>Back</button>
            <button className="btn-primary" disabled={savingAi} onClick={() => void handleSaveAi()}>
              {savingAi ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="companion-selection-page">
      <div className="selection-header">
        <h1>Choose Your Companion</h1>
        <p>Select a companion to start, or create a new one.</p>
      </div>
      {!aiConfigured && (
        <div className="ai-config-banner">
          <span>AI API key not configured — personality analysis won&apos;t work.</span>
          <button className="btn-secondary btn-sm" onClick={() => setShowAiConfig(true)}>Configure AI</button>
        </div>
      )}
      <div className="companion-grid">
        {companions.map((companion) => (
          <div key={companion.id} className={`companion-card ${companion.isPrimary ? 'companion-card-primary' : ''}`}>
            <div className="companion-card-avatar">
              <span className="avatar-emoji">{companion.name.charAt(0)}</span>
            </div>
            <h3 className="companion-card-name">{companion.name}</h3>
            <p className="companion-card-trait">{personalitySummary(companion.personality)}</p>
            {companion.isPrimary && <span className="companion-card-badge">Active</span>}
            {companion.isBuiltIn && <span className="companion-card-badge companion-card-builtin">Built-in</span>}
            <div className="companion-card-actions">
              <button className="btn-primary btn-sm" onClick={() => void onSelect(companion)}>Start</button>
              <button className="btn-secondary btn-sm" onClick={() => void handleEdit(companion)}>Edit</button>
              {confirmDelete === companion.id ? (
                <div className="confirm-delete">
                  <span>Sure?</span>
                  <button className="btn-danger btn-sm" onClick={() => void handleDelete(companion.id)}>Yes</button>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                </div>
              ) : (
                <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(companion.id)}>Delete</button>
              )}
            </div>
          </div>
        ))}
        <div className="companion-card companion-card-new" onClick={onCreateNew}>
          <div className="companion-card-avatar new-avatar">+</div>
          <h3 className="companion-card-name">New Companion</h3>
          <p className="companion-card-trait">Create a new friend</p>
        </div>
      </div>
      <div className="selection-footer">
        <button className="btn-ghost btn-sm" onClick={() => setShowAiConfig(true)}>
          {aiConfigured ? 'AI Settings' : 'Configure AI'}
        </button>
      </div>
    </div>
  );
}
