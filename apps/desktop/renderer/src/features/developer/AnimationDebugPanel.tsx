import { useState } from 'react';
import type { CompanionPersonality } from '@our-companion/shared';
import type { AnimationIntent } from '../../character/AnimationCategories';
import { resolveAnimation, getAvailableClipNames } from '../../character/AnimationResolver';
import { createAnnAnimations } from '../../character/ann/animationConfig';

interface AnimationDebugPanelProps {
  currentAnimation?: string;
  personality?: CompanionPersonality;
  expeditionPhase?: string;
  onTriggerAnimation?: (intent: AnimationIntent) => void;
  onPersonalityChange?: (personality: CompanionPersonality) => void;
}

const ALL_INTENTS: AnimationIntent[] = [
  'idle', 'idle_sleepy', 'idle_sleeping', 'idle_breathe',
  'walk_left', 'walk_right', 'walk_up', 'walk_down',
  'enter', 'leave',
  'talk_neutral', 'talk_thinking', 'think', 'work_focus',
  'expedition_prepare', 'expedition_leave', 'expedition_return', 'expedition_present',
  'discovery', 'task_success', 'task_failed'
];

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
  const [selectedIntent, setSelectedIntent] = useState<AnimationIntent>('idle');
  const animations = createAnnAnimations();
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
        <h4>Current State</h4>
        <p><strong>Animation:</strong> {currentAnimation ?? 'none'}</p>
        <p><strong>Expedition:</strong> {expeditionPhase ?? 'idle'}</p>
      </div>

      <div className="debug-section">
        <h4>Manual Trigger</h4>
        <select
          value={selectedIntent}
          onChange={(e) => setSelectedIntent(e.target.value as AnimationIntent)}
        >
          {ALL_INTENTS.map((intent) => (
            <option key={intent} value={intent}>{intent}</option>
          ))}
        </select>
        <button onClick={() => onTriggerAnimation?.(selectedIntent)}>Trigger</button>
        <div className="resolution-info">
          <p><strong>Resolves to:</strong> {resolution.clip}</p>
          <p><strong>Fallback:</strong> {resolution.usedFallback ? 'Yes' : 'No'}</p>
          <p><strong>Chain:</strong> {resolution.fallbackChain.join(' → ')}</p>
        </div>
      </div>

      {personality && (
        <div className="debug-section">
          <h4>Personality</h4>
          {PERSONALITY_KEYS.map((key) => (
            <div key={key} className="personality-slider-row">
              <label>{key}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={personality[key]}
                onChange={(e) => handlePersonalityChange(key, Number(e.target.value))}
              />
              <span>{personality[key]}</span>
            </div>
          ))}
        </div>
      )}

      <div className="debug-section">
        <h4>Available Clips ({availableClips.length})</h4>
        <div className="clip-list">
          {availableClips.map((clip) => (
            <span key={clip} className="clip-badge">{clip}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
