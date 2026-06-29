import { useEffect, useState } from 'react';
import type { CompanionProfile, CompanionPersonality } from '@our-companion/shared';

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

  useEffect(() => {
    void loadCompanions();
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

  if (loading) {
    return (
      <div className="companion-selection-page">
        <div className="selection-loading">Loading companions...</div>
      </div>
    );
  }

  return (
    <div className="companion-selection-page">
      <div className="selection-header">
        <h1>Choose Your Companion</h1>
        <p>Select a companion to start, or create a new one.</p>
      </div>
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
    </div>
  );
}
