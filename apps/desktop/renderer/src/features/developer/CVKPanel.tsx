import { useCallback, useState, type ReactNode } from 'react';

type CVKTab = 'simulation' | 'scenarios' | 'triggers' | 'runtime' | 'inspector' | 'debug' | 'performance';

const TABS: Array<{ id: CVKTab; label: string }> = [
  { id: 'simulation', label: 'Simulation' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'triggers', label: 'Event Triggers' },
  { id: 'runtime', label: 'Runtime Control' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'debug', label: 'Debug Overlay' },
  { id: 'performance', label: 'Performance' },
];

export function CVKPanel() {
  const [activeTab, setActiveTab] = useState<CVKTab>('simulation');

  return (
    <div className="cvk-panel">
      <div className="cvk-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`cvk-tab ${activeTab === tab.id ? 'cvk-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="cvk-content">
        {activeTab === 'simulation' && <SimulationControls />}
        {activeTab === 'scenarios' && <ScenarioLoader />}
        {activeTab === 'triggers' && <EventTriggerPanel />}
        {activeTab === 'runtime' && <RuntimeControlPanel />}
        {activeTab === 'inspector' && <InspectorPanel />}
        {activeTab === 'debug' && <DebugOverlayPanel />}
        {activeTab === 'performance' && <PerformancePanel />}
      </div>
    </div>
  );
}

function SimulationControls() {
  const [status, setStatus] = useState('');

  const advanceTime = useCallback(async (days: number) => {
    setStatus(`Advancing +${days} days...`);
    try {
      await (window as any).ourCompanion?.validation?.simulateTime?.({ days });
      setStatus(`Advanced +${days} days`);
    } catch {
      setStatus('Simulation not available in production');
    }
  }, []);

  const setContext = useCallback(async (category: string) => {
    setStatus(`Setting context to ${category}...`);
    try {
      await (window as any).ourCompanion?.validation?.simulateContext?.({ category });
      setStatus(`Context set to ${category}`);
    } catch {
      setStatus('Context override not available');
    }
  }, []);

  return (
    <div className="cvk-section">
      <h3>Time Simulation</h3>
      <div className="cvk-button-row">
        <button onClick={() => advanceTime(0.001)}>+1 min</button>
        <button onClick={() => advanceTime(0.04)}>+10 min</button>
        <button onClick={() => advanceTime(0.25)}>+1 hour</button>
        <button onClick={() => advanceTime(1)}>+1 day</button>
        <button onClick={() => advanceTime(7)}>+7 days</button>
        <button onClick={() => advanceTime(30)}>+30 days</button>
      </div>
      <h3>Context Override</h3>
      <div className="cvk-button-row">
        {['working', 'learning', 'relaxing', 'gaming', 'meeting', 'away', 'sleeping'].map((ctx) => (
          <button key={ctx} onClick={() => setContext(ctx)}>{ctx}</button>
        ))}
      </div>
      {status && <div className="cvk-status">{status}</div>}
    </div>
  );
}

function ScenarioLoader() {
  const [status, setStatus] = useState('');
  const scenarios = [
    { id: 'fresh-installation', name: 'Fresh Installation' },
    { id: 'first-day', name: 'First Day' },
    { id: 'one-week', name: 'One Week Together' },
    { id: 'one-month', name: 'One Month Together' },
    { id: 'long-term', name: 'Long-term Companion' },
    { id: 'return-after-absence', name: 'Return After Absence' },
    { id: 'heavy-discovery', name: 'Heavy Discovery' },
    { id: 'journey-completion', name: 'Journey Completion' },
  ];

  const loadScenario = useCallback(async (id: string) => {
    setStatus(`Loading ${id}...`);
    try {
      await (window as any).ourCompanion?.validation?.loadScenario?.(id);
      setStatus(`Loaded: ${id}`);
    } catch {
      setStatus('Scenario loading not available');
    }
  }, []);

  return (
    <div className="cvk-section">
      <h3>Built-in Scenarios</h3>
      <div className="cvk-scenario-list">
        {scenarios.map((s) => (
          <div key={s.id} className="cvk-scenario-item">
            <span>{s.name}</span>
            <button onClick={() => loadScenario(s.id)}>Load</button>
          </div>
        ))}
      </div>
      {status && <div className="cvk-status">{status}</div>}
    </div>
  );
}

function EventTriggerPanel() {
  const [status, setStatus] = useState('');
  const events = [
    { category: 'runtime', type: 'ApplicationBoot' },
    { category: 'runtime', type: 'Wake' },
    { category: 'runtime', type: 'Sleep' },
    { category: 'discovery', type: 'DiscoveryCompleted' },
    { category: 'discovery', type: 'DiscoveryFailed' },
    { category: 'journey', type: 'MilestoneReached' },
    { category: 'journey', type: 'JourneyCompleted' },
    { category: 'relationship', type: 'TrustIncreased' },
    { category: 'notebook', type: 'GenerateReflection' },
    { category: 'notification', type: 'QueueNotification' },
    { category: 'conversation', type: 'ConversationStarted' },
    { category: 'memory', type: 'MemoryAdded' },
  ];

  const fireEvent = useCallback(async (type: string) => {
    setStatus(`Firing ${type}...`);
    try {
      await (window as any).ourCompanion?.validation?.fireEvent?.({ eventType: type });
      setStatus(`Fired: ${type}`);
    } catch {
      setStatus('Event triggering not available');
    }
  }, []);

  return (
    <div className="cvk-section">
      <h3>Event Triggers</h3>
      <div className="cvk-event-list">
        {events.map((e) => (
          <div key={e.type} className="cvk-event-item">
            <span className="cvk-event-category">{e.category}</span>
            <span>{e.type}</span>
            <button onClick={() => fireEvent(e.type)}>Fire</button>
          </div>
        ))}
      </div>
      {status && <div className="cvk-status">{status}</div>}
    </div>
  );
}

function RuntimeControlPanel() {
  const [mode, setMode] = useState('normal');
  const [speed, setSpeed] = useState(1);

  const setRuntimeMode = useCallback(async (newMode: string) => {
    setMode(newMode);
    try {
      await (window as any).ourCompanion?.validation?.setRuntimeMode?.({ mode: newMode });
    } catch { /* not available */ }
  }, []);

  return (
    <div className="cvk-section">
      <h3>Runtime Control</h3>
      <div className="cvk-button-row">
        <button onClick={() => setRuntimeMode('normal')} className={mode === 'normal' ? 'active' : ''}>Normal</button>
        <button onClick={() => setRuntimeMode('paused')} className={mode === 'paused' ? 'active' : ''}>Pause</button>
        <button onClick={() => setRuntimeMode('step')} className={mode === 'step' ? 'active' : ''}>Step</button>
        <button onClick={() => setRuntimeMode('slow_motion')} className={mode === 'slow_motion' ? 'active' : ''}>Slow Motion</button>
        <button onClick={() => setRuntimeMode('fast_forward')} className={mode === 'fast_forward' ? 'active' : ''}>Fast Forward</button>
      </div>
      <h3>Speed</h3>
      <div className="cvk-button-row">
        {[0.1, 0.25, 0.5, 1, 2, 5, 10, 50, 100].map((s) => (
          <button key={s} onClick={() => setSpeed(s)} className={speed === s ? 'active' : ''}>{s}x</button>
        ))}
      </div>
      <div className="cvk-status">Mode: {mode} | Speed: {speed}x</div>
    </div>
  );
}

function InspectorPanel() {
  const [view, setView] = useState('overview');
  const views = ['overview', 'context', 'behavior', 'thought', 'memory', 'journey', 'discovery', 'notebook', 'conversation', 'relationship', 'notification'];

  return (
    <div className="cvk-section">
      <h3>Inspector</h3>
      <div className="cvk-inspector-nav">
        {views.map((v) => (
          <button key={v} onClick={() => setView(v)} className={view === v ? 'active' : ''}>{v}</button>
        ))}
      </div>
      <div className="cvk-inspector-content">
        <p>View: {view}</p>
        <p className="cvk-hint">Inspector data will appear here when connected to runtime.</p>
      </div>
    </div>
  );
}

function DebugOverlayPanel() {
  const [visible, setVisible] = useState(false);

  return (
    <div className="cvk-section">
      <h3>Debug Overlay</h3>
      <div className="cvk-button-row">
        <button onClick={() => setVisible(!visible)}>
          {visible ? 'Hide Overlay' : 'Show Overlay'}
        </button>
      </div>
      <div className="cvk-status">
        Overlay: {visible ? 'Visible' : 'Hidden'}
      </div>
      <p className="cvk-hint">The debug overlay shows real-time Companion state including runtime, context, behavior, attention, and more.</p>
    </div>
  );
}

function PerformancePanel() {
  return (
    <div className="cvk-section">
      <h3>Performance Monitor</h3>
      <div className="cvk-perf-grid">
        <div className="cvk-perf-item">
          <span className="cvk-perf-label">Runtime Tick</span>
          <span className="cvk-perf-value">--</span>
        </div>
        <div className="cvk-perf-item">
          <span className="cvk-perf-label">LLM Response</span>
          <span className="cvk-perf-value">--</span>
        </div>
        <div className="cvk-perf-item">
          <span className="cvk-perf-label">Memory Usage</span>
          <span className="cvk-perf-value">--</span>
        </div>
        <div className="cvk-perf-item">
          <span className="cvk-perf-label">CPU Usage</span>
          <span className="cvk-perf-value">--</span>
        </div>
      </div>
      <p className="cvk-hint">Performance metrics will appear here when connected to runtime.</p>
    </div>
  );
}
