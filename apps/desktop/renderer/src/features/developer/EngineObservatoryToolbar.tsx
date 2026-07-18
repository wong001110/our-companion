import { useCallback, useState } from 'react';

const ENGINE_PANELS = [
  { key: 'character', label: 'Character' },
  { key: 'pattern', label: 'Pattern' },
  { key: 'interest', label: 'Interest' },
  { key: 'curiosity', label: 'Curiosity' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'discoveryScheduling', label: 'Scheduling' },
  { key: 'insight', label: 'Insight' },
  { key: 'motion', label: 'Motion' },
  { key: 'social', label: 'Social' },
] as const;

export type EnginePanelKey = (typeof ENGINE_PANELS)[number]['key'];

export interface ObservatoryToolbarState {
  enabledPanels: EnginePanelKey[];
  refreshRateSeconds: number;
}

const STORAGE_KEY = 'companion:developer:observatory';
const DEFAULT_STATE: ObservatoryToolbarState = {
  enabledPanels: [],
  refreshRateSeconds: 5,
};

function loadState(): ObservatoryToolbarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ObservatoryToolbarState>;
      return {
        enabledPanels: Array.isArray(parsed.enabledPanels) ? parsed.enabledPanels as EnginePanelKey[] : DEFAULT_STATE.enabledPanels,
        refreshRateSeconds: typeof parsed.refreshRateSeconds === 'number' ? Math.max(1, parsed.refreshRateSeconds) : DEFAULT_STATE.refreshRateSeconds,
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_STATE;
}

function saveState(state: ObservatoryToolbarState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface EngineObservatoryToolbarProps {
  enabledPanels: EnginePanelKey[];
  refreshRateSeconds: number;
  onChange: (state: ObservatoryToolbarState) => void;
}

export function EngineObservatoryToolbar({ enabledPanels, refreshRateSeconds, onChange }: EngineObservatoryToolbarProps) {
  function togglePanel(key: EnginePanelKey) {
    const panels = enabledPanels.includes(key)
      ? enabledPanels.filter((p) => p !== key)
      : [...enabledPanels, key];
    const next: ObservatoryToolbarState = { enabledPanels: panels, refreshRateSeconds };
    saveState(next);
    onChange(next);
  }

  function setRefreshRate(value: number) {
    const clamped = Math.max(1, value);
    const next: ObservatoryToolbarState = { enabledPanels, refreshRateSeconds: clamped };
    saveState(next);
    onChange(next);
  }

  return (
    <div className="observatory-toolbar">
      <span className="observatory-toolbar-label">Engines</span>
      {ENGINE_PANELS.map((panel) => (
        <button
          key={panel.key}
          className={`observatory-toolbar-toggle ${enabledPanels.includes(panel.key) ? 'active' : ''}`}
          onClick={() => togglePanel(panel.key)}
        >
          {panel.label}
        </button>
      ))}
      <span className="observatory-toolbar-separator" />
      <label className="observatory-toolbar-rate">
        <span>Refresh</span>
        <input
          type="number"
          min={1}
          max={60}
          value={refreshRateSeconds}
          onChange={(e) => setRefreshRate(Number(e.target.value))}
        />
        <span>s</span>
      </label>
    </div>
  );
}

export { loadState as loadObservatoryState, ENGINE_PANELS };
