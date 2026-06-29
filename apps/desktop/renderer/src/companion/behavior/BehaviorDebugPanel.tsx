import type { CompanionBehaviorState, CompanionMode, CompanionMood, CompanionEnergy, CompanionFocus, InitiativeLevel, DiscoveryPresentationState } from './CompanionBehaviorTypes';

interface BehaviorDebugPanelProps {
  state: CompanionBehaviorState;
  lastDecision: { type: string; reason: string } | null;
  recentDismissCount: number;
  recentIgnoreCount: number;
  onSetMode: (mode: CompanionMode) => void;
  onSetMood: (mood: CompanionMood) => void;
  onSetEnergy: (energy: CompanionEnergy) => void;
  onSetFocus: (focus: CompanionFocus) => void;
  onSetInitiativeLevel: (level: InitiativeLevel) => void;
  onSetDiscoveryPresentationState: (state: DiscoveryPresentationState) => void;
  onSetDebugOverride: (on: boolean) => void;
  onForceDecision: () => void;
  onResetTimers: () => void;
}

const MODES: CompanionMode[] = ['idle', 'casual', 'discovery', 'work_support', 'reflection', 'debug'];
const MOODS: CompanionMood[] = ['calm', 'curious', 'excited', 'tired', 'concerned'];
const ENERGIES: CompanionEnergy[] = ['low', 'normal', 'high'];
const FOCUSES: CompanionFocus[] = ['idle', 'listening', 'thinking', 'discovering', 'presenting', 'sleeping'];
const INITIATIVES: InitiativeLevel[] = [0, 1, 2, 3, 4, 5];
const DISCOVERY_STATES: DiscoveryPresentationState[] = ['none', 'queued', 'soft_hint', 'presented', 'discussed', 'saved', 'ignored', 'follow_up'];

function formatTime(ms: number | null): string {
  if (ms === null) return 'never';
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3600_000)}h ago`;
}

export function BehaviorDebugPanel({
  state,
  lastDecision,
  recentDismissCount,
  recentIgnoreCount,
  onSetMode,
  onSetMood,
  onSetEnergy,
  onSetFocus,
  onSetInitiativeLevel,
  onSetDiscoveryPresentationState,
  onSetDebugOverride,
  onForceDecision,
  onResetTimers,
}: BehaviorDebugPanelProps) {
  return (
    <div className="behavior-debug-panel">
      <div className="debug-ai-log-header">
        <span className="debug-ai-log-title">Behavior Controller</span>
      </div>

      <div className="behavior-debug-grid">
        <div className="behavior-debug-block">
          <span className="behavior-debug-label">Mode</span>
          <select value={state.mode} onChange={(e) => onSetMode(e.target.value as CompanionMode)}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="behavior-debug-block">
          <span className="behavior-debug-label">Mood</span>
          <select value={state.mood} onChange={(e) => onSetMood(e.target.value as CompanionMood)}>
            {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="behavior-debug-block">
          <span className="behavior-debug-label">Energy</span>
          <select value={state.energy} onChange={(e) => onSetEnergy(e.target.value as CompanionEnergy)}>
            {ENERGIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        <div className="behavior-debug-block">
          <span className="behavior-debug-label">Focus</span>
          <select value={state.focus} onChange={(e) => onSetFocus(e.target.value as CompanionFocus)}>
            {FOCUSES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="behavior-debug-block">
          <span className="behavior-debug-label">Initiative</span>
          <select value={state.initiativeLevel} onChange={(e) => onSetInitiativeLevel(Number(e.target.value) as InitiativeLevel)}>
            {INITIATIVES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        <div className="behavior-debug-block">
          <span className="behavior-debug-label">Discovery State</span>
          <select value={state.discoveryPresentationState} onChange={(e) => onSetDiscoveryPresentationState(e.target.value as DiscoveryPresentationState)}>
            {DISCOVERY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="behavior-debug-status">
        <div className="behavior-debug-status-item">
          <span className="behavior-debug-label">Last Decision</span>
          <span className="behavior-debug-value">{lastDecision ? `${lastDecision.type} (${lastDecision.reason})` : 'none'}</span>
        </div>
        <div className="behavior-debug-status-item">
          <span className="behavior-debug-label">Suppressed Until</span>
          <span className="behavior-debug-value">{state.interruptionSuppressedUntil ? formatTime(state.interruptionSuppressedUntil) : 'not suppressed'}</span>
        </div>
        <div className="behavior-debug-status-item">
          <span className="behavior-debug-label">Last Spoke</span>
          <span className="behavior-debug-value">{formatTime(state.lastCompanionSpokeAt)}</span>
        </div>
        <div className="behavior-debug-status-item">
          <span className="behavior-debug-label">Last User Interaction</span>
          <span className="behavior-debug-value">{formatTime(state.lastUserInteractionAt)}</span>
        </div>
        <div className="behavior-debug-status-item">
          <span className="behavior-debug-label">Dismiss Count</span>
          <span className="behavior-debug-value">{recentDismissCount}</span>
        </div>
        <div className="behavior-debug-status-item">
          <span className="behavior-debug-label">Ignore Count</span>
          <span className="behavior-debug-value">{recentIgnoreCount}</span>
        </div>
      </div>

      <div className="behavior-debug-actions">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={state.debugOverride}
            onChange={(e) => onSetDebugOverride(e.target.checked)}
          />
          <span>Debug Override</span>
        </label>
        <button className="debug-ai-log-refresh" onClick={onForceDecision}>Force Decision</button>
        <button className="debug-ai-log-refresh" onClick={onResetTimers}>Reset Timers</button>
      </div>
    </div>
  );
}
