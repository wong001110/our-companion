import { useState } from 'react';
import type { CompanionPersonality } from '@our-companion/shared';
import type { CompanionAnimationName } from '../../companion/runtime/animationRegistry';
import { ANIMATION_REGISTRY } from '../../companion/runtime/animationRegistry';
import { resolveAnimation, getAvailableClipNames } from '../../character/AnimationResolver';
import { createCompanionAnimations } from '../../character/ann/animationConfig';

interface AnimationDebugPanelProps {
  currentAnimation?: string;
  personality?: CompanionPersonality;
  expeditionPhase?: string;
  onTriggerAnimation?: (intent: CompanionAnimationName) => void;
  onPersonalityChange?: (personality: CompanionPersonality) => void;
}

const ALL_INTENTS: CompanionAnimationName[] = Object.keys(ANIMATION_REGISTRY) as CompanionAnimationName[];

const PERSONALITY_KEYS: (keyof CompanionPersonality)[] = [
  'energy', 'curiosity', 'sociability', 'diligence',
  'playfulness', 'confidence', 'calmness', 'shyness'
];

export function AnimationDebugPanel({
  currentAnimation,
  personality,
  expeditionPhase,
  onTriggerAnimation,
  onPersonalityChange
}: AnimationDebugPanelProps) {
  const [selectedIntent, setSelectedIntent] = useState<CompanionAnimationName>('Idle_Neutral');
  const animations = createCompanionAnimations();
  const availableClips = getAvailableClipNames(animations);
  const resolution = resolveAnimation({ intent: selectedIntent, personality }, availableClips);

  function handlePersonalityChange(key: keyof CompanionPersonality, value: number) {
    if (!personality || !onPersonalityChange) return;
    onPersonalityChange({ ...personality, [key]: value });
  }

  return (
    <div className="animation-debug-panel">
      <h3>Animation Debug</h3>

      <div className="debug-section">
        <p><strong>Current:</strong> {currentAnimation ?? 'none'}</p>
        <p><strong>Requested:</strong> {resolution.intent}</p>
        <p><strong>Resolved:</strong> {resolution.clip}</p>
        <p><strong>Fallback Used:</strong> {resolution.usedFallback ? 'yes' : 'no'}</p>
        {resolution.fallbackChain.length > 0 && (
          <p><strong>Fallback Chain:</strong> {resolution.fallbackChain.join(' → ')}</p>
        )}
      </div>

      <div className="debug-section">
        <h4>Trigger Animation</h4>
        <select
          value={selectedIntent}
          onChange={(e) => setSelectedIntent(e.target.value as CompanionAnimationName)}
        >
          {ALL_INTENTS.map((intent) => (
            <option key={intent} value={intent}>{intent}</option>
          ))}
        </select>
        <button onClick={() => onTriggerAnimation?.(selectedIntent)}>
          Trigger
        </button>
      </div>

      {personality && (
        <div className="debug-section">
          <h4>Personality</h4>
          {PERSONALITY_KEYS.map((key) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ width: 100, textTransform: 'capitalize' }}>{key}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={personality[key]}
                onChange={(e) => handlePersonalityChange(key, Number(e.target.value))}
              />
              <span style={{ width: 30, textAlign: 'right' }}>{personality[key]}</span>
            </label>
          ))}
        </div>
      )}

      <div className="debug-section">
        <h4>Available Clips</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {availableClips.map((clip) => (
            <span key={clip} className="soft-pill">{clip}</span>
          ))}
        </div>
        <p><strong>Missing:</strong> {ALL_INTENTS.filter((i) => !availableClips.includes(i)).join(', ') || 'none'}</p>
      </div>
    </div>
  );
}
