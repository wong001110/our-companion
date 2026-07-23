import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import type {
  BaseEvent,
  EmotionState,
  EngineSnapshot,
  EngineTrace,
  ExplorationLoopEvent,
  ExplorationState,
  ResearchDeveloperReport,
  SpeechStatus
} from '@our-companion/shared';
import {
  actionCapabilityPromptSummary,
  listEnabledActionCapabilities,
} from '@our-companion/shared';
import { WorkspaceStatusPanel } from './WorkspaceStatusPanel';
import { BehaviorDebugPanel } from '../../companion/behavior/BehaviorDebugPanel';
import type { CompanionBehaviorState, CompanionMode, CompanionMood, CompanionEnergy, CompanionFocus, InitiativeLevel, DiscoveryPresentationState } from '../../companion/behavior/CompanionBehaviorTypes';
import { createDefaultBehaviorState } from '../../companion/behavior/CompanionBehaviorTypes';

const PIPELINE_STEPS: ExplorationState[] = [
  'idle',
  'curious',
  'planning',
  'exploring',
  'collecting',
  'synthesizing',
  'returning',
  'sharing',
  'reflecting'
];

const EVENT_SOURCES = [
  'all',
  'character',
  'curiosity',
  'decision',
  'discovery',
  'action',
  'tool',
  'speech',
  'knowledge',
  'journey',
  'reflection'
] as const;

type EventSourceFilter = (typeof EVENT_SOURCES)[number];

const EVENT_LOG_MAX = 100;

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function eventPreview(event: BaseEvent): string {
  const payload = event.payload ? JSON.stringify(event.payload) : '';
  const text = `${event.type} ${payload}`;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function topEmotions(emotion?: EmotionState): string {
  if (!emotion) return '—';
  return Object.entries(emotion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ');
}

export function ResearchObservatory({ snapshot }: { snapshot?: EngineSnapshot }) {
  const intent = snapshot?.researchIntent;
  const plan = snapshot?.researchPlan;
  const evidence = snapshot?.researchEvidence ?? [];
  const coverage = snapshot?.researchCoverage;
  const capabilities = snapshot?.researchCapabilities ?? [];
  const hasDiscoveryProvider = capabilities.some((capability) =>
    capability.available && (capability.kind === 'open_web_search' || capability.kind === 'structured_connector')
  );
  if (!intent || !plan) {
    return (
      <section className="engine-research-observatory" aria-label="Research observatory">
        <h3>Constrained research</h3>
        {!hasDiscoveryProvider && (
          <>
            <p className="engine-empty">No discovery provider is currently available.</p>
            <p>Available: safe-web-page-fetcher</p>
            <p>Unavailable: Brave Search, GitHub, Hacker News, Reddit, YouTube</p>
            <p>A page fetcher requires a known URL and cannot discover pages independently.</p>
          </>
        )}
        <table>
          <thead><tr><th>ID</th><th>kind</th><th>mode</th><th>available</th><th>reason unavailable</th></tr></thead>
          <tbody>
            {capabilities.map((capability) => (
              <tr key={capability.id}>
                <td>{capability.id}</td><td>{capability.kind ?? 'unknown'}</td><td>{capability.mode}</td>
                <td>{capability.available ? 'yes' : 'no'}</td><td>{capability.reasonUnavailable ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }
  return (
    <section className="engine-research-observatory" aria-label="Research observatory">
      <h3>Constrained research</h3>
      <dl className="engine-research-grid">
        <div><dt>Objective</dt><dd>{intent.objective}</dd></div>
        <div><dt>Cycle</dt><dd>{intent.cycleId}</dd></div>
        <div><dt>Source types</dt><dd>{intent.preferredSourceTypes.join(', ')}</dd></div>
        <div><dt>Capabilities</dt><dd>{capabilities.map((capability) => `${capability.id}: ${capability.available ? capability.mode : 'unavailable'}`).join(', ') || 'none'}</dd></div>
        <div><dt>Queries</dt><dd>{plan.queries.join(' · ')}</dd></div>
        <div><dt>Coverage</dt><dd>{coverage ? `${coverage.sourceCount} pages / ${coverage.independentDomainCount} domains` : 'not evaluated'}</dd></div>
        <div><dt>Stop reason</dt><dd>{snapshot?.researchStopReason ?? 'pending'}</dd></div>
        <div><dt>Correlation</dt><dd>{snapshot?.engineTraces[0]?.correlationId ?? '—'}</dd></div>
      </dl>
      {evidence.length ? (
        <ul className="engine-research-pages">
          {evidence.slice(0, 8).map((page) => <li key={page.id}><strong>{page.domain}</strong> <span>{page.title}</span></li>)}
        </ul>
      ) : <p className="engine-empty">No valid external evidence found.</p>}
    </section>
  );
}

export function DiscoveryInspector({ snapshot }: { snapshot?: EngineSnapshot }) {
  const report = snapshot?.discoveryInspection;
  return (
    <section className="engine-research-observatory" aria-label="Discovery Inspector">
      <h3>Discovery Inspector</h3>
      {!report ? <p className="engine-empty">No adaptive Discovery cycle recorded yet.</p> : (
        <>
          <dl className="engine-research-grid">
            <div><dt>Mode</dt><dd>{report.mode}</dd></div>
            <div><dt>Intent question</dt><dd>{report.intentQuestion}</dd></div>
            <div><dt>Expected value</dt><dd>{report.expectedValue}</dd></div>
            <div><dt>Freshness / trust</dt><dd>{report.freshness} / {report.trustRequirement}</dd></div>
            <div><dt>Languages / regions</dt><dd>{report.languages.join(', ')} / {report.regions.join(', ') || 'any'}</dd></div>
            <div><dt>Bounded context</dt><dd>{report.contextCount}/40 summaries</dd></div>
            <div><dt>Selected bases</dt><dd>{report.selectedBases.map((base) => `${base.connectorId}:${base.state}`).join(', ') || 'none'}</dd></div>
            <div><dt>Executed bases</dt><dd>{report.executedBases.map((base) => `${base.connectorId}:${base.state}`).join(', ') || 'none'}</dd></div>
            <div><dt>Capabilities</dt><dd>{report.connectorCapabilities.map((capability) => `${capability.id}:${capability.available ? capability.mode : 'unavailable'}`).join(', ')}</dd></div>
            <div><dt>Accepted / rejected</dt><dd>{report.candidatesAccepted.length} / {report.candidatesRejected.length}</dd></div>
            <div><dt>Dedup hits</dt><dd>{Object.entries(report.dedupHits).map(([layer, count]) => `${layer}:${count}`).join(', ') || 'none'}</dd></div>
            <div><dt>Outcomes</dt><dd>new {report.newCount} · duplicate {report.duplicateCount} · revival {report.revivalCount} · material update {report.materialUpdateCount}</dd></div>
            <div><dt>Saturation penalty</dt><dd>{report.saturationPenalty.toFixed(2)}</dd></div>
          </dl>
          {report.candidatesRejected.length > 0 && (
            <ul className="engine-research-pages">
              {report.candidatesRejected.map((candidate) => (
                <li key={candidate.candidateId}><strong>{candidate.candidateId}</strong> <span>{candidate.reason}</span></li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function AvailableActionsPanel() {
  const capabilities = listEnabledActionCapabilities();
  return (
    <section className="engine-research-observatory" aria-label="Available Actions">
      <h3>Available Actions</h3>
      <div className="engine-table-wrap">
        <table>
          <thead>
            <tr><th>Tool</th><th>Enabled</th><th>Required permission</th><th>Risk</th><th>Examples</th></tr>
          </thead>
          <tbody>
            {capabilities.map((capability) => (
              <tr key={capability.toolName}>
                <td><code>{capability.toolName}</code></td>
                <td>{capability.enabled ? 'yes' : 'no'}</td>
                <td>{capability.requiredScopes.join(', ') || 'none'}</td>
                <td>{capability.riskLevel}</td>
                <td>{[...capability.examples.en, ...capability.examples.zhCN].join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Exact capability summary supplied to AI</summary>
        <pre className="debug-ai-log-raw">{actionCapabilityPromptSummary()}</pre>
      </details>
    </section>
  );
}

export function TurnInspector({ snapshot }: { snapshot?: EngineSnapshot }) {
  const records = snapshot?.turnInspections ?? [];
  return (
    <section className="engine-research-observatory" aria-label="Turn Inspector">
      <h3>Turn Inspector</h3>
      {!records.length ? <p className="engine-empty">No Companion turns recorded yet.</p> : (
        <div className="engine-trace-list">
          {records.slice(0, 10).map((record) => (
            <details key={record.turnId}>
              <summary>{record.inputSource} · {record.inputSummary} · {record.permissionState ?? 'no permission gate'}</summary>
              <dl className="engine-research-grid">
                <div><dt>Memory items selected</dt><dd>{record.memoryItemsSelected.map((item) => `${item.category}:${item.memoryId}`).join(', ') || 'none'}</dd></div>
                <div><dt>Memory budget</dt><dd>{record.memoryBudget.itemCount}/{record.memoryBudget.maxItems} items · {record.memoryBudget.characterCount}/{record.memoryBudget.maxCharacters} chars</dd></div>
                <div><dt>Deterministic action match</dt><dd>{record.deterministicActionMatch ?? 'none'}</dd></div>
                <div><dt>Validated actions</dt><dd>{record.validatedActions.map((action) => action.toolName).join(', ') || 'none'}</dd></div>
                <div><dt>Rejected actions</dt><dd>{record.rejectedActions.map((action) => `${action.toolName}:${action.reason}`).join(', ') || 'none'}</dd></div>
                <div><dt>Permission state</dt><dd>{record.permissionState ?? 'not required'}</dd></div>
                <div><dt>Execution result</dt><dd>{record.executionResult ?? 'not executed'}</dd></div>
                <div><dt>Memory candidates</dt><dd>{record.memoryCandidates.map((candidate) => `${candidate.type}:${candidate.summary}`).join(' · ') || 'none'}</dd></div>
                <div><dt>Memory outcomes</dt><dd>{record.memoryOutcomes.map((outcome) => `${outcome.outcome}:${outcome.summary}`).join(' · ') || 'none'}</dd></div>
                <div><dt>Final reply source</dt><dd>{record.finalReplySource ?? 'pending'}</dd></div>
                <div><dt>OOC action</dt><dd>{record.oocAction ?? 'not evaluated'}</dd></div>
              </dl>
              {record.retrievalTrace && <pre className="debug-ai-log-raw">{formatJson(record.retrievalTrace)}</pre>}
              {record.oocValidation && <pre className="debug-ai-log-raw">{formatJson(record.oocValidation)}</pre>}
              {record.aiStructuredResult && <pre className="debug-ai-log-raw">{formatJson(record.aiStructuredResult)}</pre>}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function MemoryDiagnosticsPanel() {
  const [diagnostics, setDiagnostics] = useState<Awaited<ReturnType<typeof window.ourCompanion.debug.getMemoryDiagnostics>>>();
  const [running, setRunning] = useState(false);
  const [installing, setInstalling] = useState(false);
  const refresh = useCallback(async () => setDiagnostics(await window.ourCompanion.debug.getMemoryDiagnostics()), []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function rebuild() {
    setRunning(true);
    try { await window.ourCompanion.debug.rebuildMemoryVectors(); await refresh(); }
    finally { setRunning(false); }
  }
  async function install() {
    setInstalling(true);
    try { await window.ourCompanion.debug.installLocalEmbeddingModel(); await refresh(); }
    finally { setInstalling(false); }
  }
  return (
    <section className="engine-research-observatory" aria-label="Local memory diagnostics">
      <h3>Local memory diagnostics</h3>
      <p>Derived local index status only; no model reasoning is shown.</p>
      <div className="debug-ai-log-actions">
        <button onClick={() => void refresh()}>Refresh</button>
        <button onClick={() => void install()} disabled={installing}>{installing ? 'Installing…' : 'Install local model'}</button>
        <button onClick={() => void rebuild()} disabled={running}>{running ? 'Rebuilding…' : 'Rebuild vector index'}</button>
      </div>
      {diagnostics && <pre className="debug-ai-log-raw">{formatJson(diagnostics)}</pre>}
    </section>
  );
}

function ResearchDeveloperTools({ onComplete }: { onComplete: () => Promise<void> }) {
  const [fixtureTopic, setFixtureTopic] = useState('desktop AI companion');
  const [url, setUrl] = useState('https://www.electronjs.org/docs/latest/');
  const [report, setReport] = useState<ResearchDeveloperReport>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(operation: () => Promise<ResearchDeveloperReport>) {
    setBusy(true);
    setError(undefined);
    try {
      setReport(await operation());
      await onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Research validation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="engine-research-observatory" aria-label="Research Developer Tools">
      <h3>Research Developer Tools</h3>
      <label><span>Fixture Research</span><input value={fixtureTopic} onChange={(event) => setFixtureTopic(event.target.value)} /></label>
      <button disabled={busy} onClick={() => void run(() => window.ourCompanion.debug.runFixtureResearch({ topic: fixtureTopic }))}>Run fixture research</button>
      <label><span>Research from URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <button disabled={busy} onClick={() => void run(() => window.ourCompanion.debug.researchFromUrl({ url }))}>Research from URL</button>
      {error && <p className="engine-empty">{error}</p>}
      {report && (
        <>
          <h4>Developer result report</h4>
          <pre className="debug-ai-log-raw">{formatJson(report)}</pre>
        </>
      )}
    </section>
  );
}

function ExplorationVisualStatus({ snapshot }: { snapshot?: EngineSnapshot }) {
  const [visual, setVisual] = useState<{
    cycleId?: string;
    visualPhase?: string;
    startedAt?: string;
    minimumVisualCompletionTime?: string;
    resultState?: string;
  }>();
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('companion:exploration-visual');
        setVisual(raw ? JSON.parse(raw) : undefined);
      } catch {
        setVisual(undefined);
      }
    };
    load();
    const interval = window.setInterval(load, 500);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <section className="engine-research-observatory" aria-label="Exploration Visual State">
      <h3>Exploration Visual State</h3>
      <dl className="engine-research-grid">
        <div><dt>Cycle ID</dt><dd>{visual?.cycleId ?? snapshot?.currentCycle?.id ?? 'none'}</dd></div>
        <div><dt>Cognitive phase</dt><dd>{snapshot?.currentCycle?.state ?? 'idle'}</dd></div>
        <div><dt>Visual phase</dt><dd>{visual?.visualPhase ?? 'idle'}</dd></div>
        <div><dt>Started at</dt><dd>{visual?.startedAt ?? '—'}</dd></div>
        <div><dt>Minimum visual completion time</dt><dd>{visual?.minimumVisualCompletionTime ?? '—'}</dd></div>
        <div><dt>Research status</dt><dd>{snapshot?.researchStopReason ?? 'not started'}</dd></div>
        <div><dt>Current result state</dt><dd>{visual?.resultState ?? 'pending'}</dd></div>
      </dl>
    </section>
  );
}

export function EngineObservatory() {
  const [events, setEvents] = useState<BaseEvent[]>([]);
  const [snapshot, setSnapshot] = useState<EngineSnapshot>();
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>();
  const [sourceFilter, setSourceFilter] = useState<EventSourceFilter>('all');
  const [groupByCorrelation, setGroupByCorrelation] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    character: true,
    pattern: true,
    interest: false,
    curiosity: true,
    discovery: true,
    discoveryScheduling: true,
    insight: true,
    decision: false,
    action: false,
    speech: false,
    society: false
  });
  const [loading, setLoading] = useState(false);
  const [queueStats, setQueueStats] = useState<{ queued: number; presenting: number; dismissed: number; saved: number } | null>(null);
  const [behaviorState, setBehaviorState] = useState<CompanionBehaviorState>(createDefaultBehaviorState);
  const [behaviorDecision, setBehaviorDecision] = useState<{ type: string; reason: string } | null>(null);
  const [recentDismissCount, setRecentDismissCount] = useState(0);
  const [recentIgnoreCount, setRecentIgnoreCount] = useState(0);

  function updateBehavior(partial: Partial<CompanionBehaviorState>) {
    setBehaviorState((prev) => ({ ...prev, ...partial }));
  }

  function handleBehaviorSetMode(mode: CompanionMode) { updateBehavior({ mode }); }
  function handleBehaviorSetMood(mood: CompanionMood) { updateBehavior({ mood }); }
  function handleBehaviorSetEnergy(energy: CompanionEnergy) { updateBehavior({ energy }); }
  function handleBehaviorSetFocus(focus: CompanionFocus) { updateBehavior({ focus }); }
  function handleBehaviorSetInitiativeLevel(level: InitiativeLevel) { updateBehavior({ initiativeLevel: level }); }
  function handleBehaviorSetDiscoveryPresentationState(s: DiscoveryPresentationState) { updateBehavior({ discoveryPresentationState: s }); }
  function handleBehaviorSetDebugOverride(on: boolean) { updateBehavior({ debugOverride: on }); }
  function handleBehaviorForceDecision() {
    setBehaviorDecision({ type: 'forced', reason: 'manual_force' });
  }
  function handleBehaviorResetTimers() {
    updateBehavior({
      lastCompanionSpokeAt: null,
      lastUserInteractionAt: null,
      lastDiscoveryPresentedAt: null,
      lastUserDismissedAt: null,
      interruptionSuppressedUntil: null,
    });
    setRecentDismissCount(0);
    setRecentIgnoreCount(0);
  }

  const refreshQueueStats = useCallback(() => {
    const stats = window.__discoveryQueue?.getStats();
    setQueueStats(stats ?? null);
  }, []);

  const loadSnapshot = useCallback(async () => {
    const [nextSnapshot, status] = await Promise.all([
      window.ourCompanion.debug.getEngineSnapshot(),
      window.ourCompanion.speech.getStatus()
    ]);
    setSnapshot(nextSnapshot);
    setSpeechStatus(status);
  }, []);

  const loadEvents = useCallback(async () => {
    const history = await window.ourCompanion.debug.getFoundationLog({ limit: EVENT_LOG_MAX });
    setEvents(history);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadSnapshot(), loadEvents()]);
      refreshQueueStats();
    } finally {
      setLoading(false);
    }
  }, [loadEvents, loadSnapshot, refreshQueueStats]);

  useEffect(() => {
    void refreshAll();
    const unsubscribe = window.ourCompanion.debug.onFoundationEvent((event) => {
      setEvents((current) => [event, ...current].slice(0, EVENT_LOG_MAX));
      if (event.source === 'discovery' || event.source === 'curiosity' || event.source === 'decision') {
        void loadSnapshot();
      }
    });
    return unsubscribe;
  }, [loadSnapshot, refreshAll]);

  const filteredEvents = useMemo(() => {
    return sourceFilter === 'all' ? events : events.filter((event) => event.source === sourceFilter);
  }, [events, sourceFilter]);

  const groupedEvents = useMemo(() => {
    if (!groupByCorrelation) {
      return filteredEvents.map((event) => ({ key: event.id, events: [event] }));
    }
    const groups = new Map<string, BaseEvent[]>();
    for (const event of filteredEvents) {
      const key = event.correlationId ?? event.id;
      const existing = groups.get(key) ?? [];
      existing.push(event);
      groups.set(key, existing);
    }
    return [...groups.entries()].map(([key, groupEvents]) => ({ key, events: groupEvents }));
  }, [filteredEvents, groupByCorrelation]);

  const decisionEvents = useMemo(
    () => events.filter((event) => event.source === 'decision').slice(0, 12),
    [events]
  );

  const actionEvents = useMemo(
    () => events.filter((event) => event.source === 'action' || event.source === 'tool').slice(0, 12),
    [events]
  );

  const speechEvents = useMemo(
    () => events.filter((event) => event.source === 'speech').slice(0, 8),
    [events]
  );

  const activePipelineStep = snapshot?.currentCycle?.state ?? snapshot?.explorationEvents.at(-1)?.state;

  function togglePanel(id: string) {
    setExpandedPanels((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <div className="engine-observatory">
      <div className="engine-observatory-header">
        <div>
          <p className="eyebrow">Developer use</p>
          <h2>Engine Observatory</h2>
          <p className="engine-observatory-note">
            Live foundation events and persisted engine artifacts from the cognitive pipeline.
          </p>
        </div>
        <button className="debug-ai-log-refresh" onClick={() => void refreshAll()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh all'}
        </button>
      </div>

      <section className="engine-pipeline">
        <h3>Exploration pipeline</h3>
        <div className="engine-pipeline-steps" aria-label="Exploration pipeline states">
          {PIPELINE_STEPS.map((step) => (
            <span
              key={step}
              className={`engine-pipeline-step ${activePipelineStep === step ? 'active' : ''}`}
            >
              {step}
            </span>
          ))}
        </div>
        {snapshot?.explorationEvents.length ? (
          <ul className="engine-pipeline-events">
            {snapshot.explorationEvents.slice(-8).map((event: ExplorationLoopEvent) => (
              <li key={event.id}>
                <strong>{event.state}</strong> {event.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="engine-empty">No exploration events yet. Send companion exploring to populate this.</p>
        )}
      </section>

      <EngineTraceTimeline traces={snapshot?.engineTraces ?? []} />

      <ResearchObservatory snapshot={snapshot} />
      <DiscoveryInspector snapshot={snapshot} />
      <ResearchDeveloperTools onComplete={refreshAll} />
      <ExplorationVisualStatus snapshot={snapshot} />
      <AvailableActionsPanel />
      <TurnInspector snapshot={snapshot} />
      <MemoryDiagnosticsPanel />

      <section className="debug-ai-log engine-event-timeline">
        <div className="debug-ai-log-header">
          <span className="debug-ai-log-title">Foundation event timeline</span>
          <span className="debug-ai-log-count">{filteredEvents.length} events</span>
          <label className="engine-filter">
            <span>Source</span>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as EventSourceFilter)}>
              {EVENT_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label className="engine-filter checkbox-row">
            <input
              type="checkbox"
              checked={groupByCorrelation}
              onChange={(e) => setGroupByCorrelation(e.target.checked)}
            />
            <span>Group by correlation</span>
          </label>
        </div>
        {groupedEvents.length === 0 ? (
          <p className="debug-ai-log-empty">No foundation events recorded yet.</p>
        ) : (
          <div className="debug-ai-log-list">
            {groupedEvents.map((group) => (
              <div key={group.key} className="engine-event-group">
                {group.events.map((event) => (
                  <div key={event.id} className="debug-ai-log-entry">
                    <button
                      className="debug-ai-log-summary"
                      onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                      aria-expanded={expandedEventId === event.id}
                    >
                      <span className={`debug-source-badge debug-source-${event.source}`}>{event.source}</span>
                      <span className="debug-type-badge">{event.type}</span>
                      <span className="debug-ai-log-time">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="debug-ai-log-preview">{eventPreview(event)}</span>
                      <span className="debug-ai-log-chevron">{expandedEventId === event.id ? '▲' : '▼'}</span>
                    </button>
                    {expandedEventId === event.id && (
                      <div className="debug-ai-log-detail">
                        <div className="debug-ai-log-block">
                          <span>Event</span>
                          <pre className="debug-ai-log-raw">{formatJson(event)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="engine-snapshot-grid">
        <SnapshotPanel title="Character" open={expandedPanels.character} onToggle={() => togglePanel('character')}>
          {snapshot?.characterState ? (
            <ul className="engine-snapshot-list">
              <li>
                <strong>State</strong> {snapshot.characterState.coreState} / {snapshot.characterState.intent}
              </li>
              <li>
                <strong>Emotion</strong> {topEmotions(snapshot.characterState.emotion)}
              </li>
            </ul>
          ) : (
            <p className="engine-empty">No character state.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Pattern" open={expandedPanels.pattern} onToggle={() => togglePanel('pattern')}>
          {snapshot?.patterns.length ? (
            <ul className="engine-snapshot-list">
              {snapshot.patterns.map((pattern) => (
                <li key={pattern.id}>
                  <strong>{pattern.title}</strong>
                  <span>
                    {pattern.type} · strength {pattern.strength.toFixed(2)} · {pattern.evidence.length} evidence
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="engine-empty">No patterns detected yet.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Memory / Interest" open={expandedPanels.interest} onToggle={() => togglePanel('interest')}>
          {snapshot?.interestGraph.nodes.length ? (
            <>
              <p>
                {snapshot.interestGraph.nodes.length} nodes · {snapshot.interestGraph.edges.length} edges
              </p>
              <ul className="engine-snapshot-list">
                {snapshot.interestGraph.nodes.slice(0, 6).map((node) => (
                  <li key={node.id}>
                    <strong>{node.label}</strong>
                    <span>
                      {node.type} · weight {node.weight.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              {(snapshot.interestGraph.recommendedExpansionPaths?.length ?? 0) > 0 && (
                <p className="engine-meta">
                  Paths: {snapshot.interestGraph.recommendedExpansionPaths?.map((path) => path.join(' → ')).join(' | ')}
                </p>
              )}
            </>
          ) : (
            <p className="engine-empty">Interest graph is empty.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Curiosity" open={expandedPanels.curiosity} onToggle={() => togglePanel('curiosity')}>
          {snapshot?.curiosityTargets.length ? (
            <ul className="engine-snapshot-list">
              {snapshot.curiosityTargets.map((target) => (
                <li key={target.id}>
                  <strong>{target.topic}</strong>
                  <span>
                    {target.explorationType} · priority {target.priority.toFixed(2)}
                  </span>
                  <p>{target.reason}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="engine-empty">No curiosity targets.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Discovery" open={expandedPanels.discovery} onToggle={() => togglePanel('discovery')}>
          {snapshot?.discoveryCandidates.length || snapshot?.recentDiscoveries.length ? (
            <>
              {snapshot.discoveryCandidates.length > 0 && (
                <>
                  <p className="engine-meta">Candidates</p>
                  <ul className="engine-snapshot-list">
                    {snapshot.discoveryCandidates.slice(0, 6).map((candidate) => (
                      <li key={candidate.id}>
                        <strong>{candidate.title}</strong>
                        <span>
                          {candidate.agentType} · rel {candidate.relevanceScore.toFixed(2)} · nov{' '}
                          {candidate.noveltyScore.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {snapshot.recentDiscoveries.length > 0 && (
                <>
                  <p className="engine-meta">Recent feed</p>
                  <ul className="engine-snapshot-list">
                    {snapshot.recentDiscoveries.slice(0, 5).map((discovery) => (
                      <li key={discovery.id}>
                        <strong>{discovery.title}</strong>
                        <span>
                          {discovery.source} · score {Math.round(discovery.finalScore * 100)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="engine-empty">No discovery candidates or feed items.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Discovery Scheduling" open={expandedPanels.discoveryScheduling ?? false} onToggle={() => togglePanel('discoveryScheduling')}>
          {snapshot?.discoveryScheduling ? (
            <>
              <ul className="engine-snapshot-list">
                <li><strong>Busy</strong> {snapshot.discoveryScheduling.isBusy ? 'yes' : 'no'}</li>
                <li><strong>Processing</strong> {snapshot.discoveryScheduling.isProcessing ? 'yes' : 'no'}</li>
                <li><strong>Has pending</strong> {snapshot.discoveryScheduling.hasPending ? 'yes' : 'no'}</li>
                <li><strong>Queue length</strong> {snapshot.discoveryScheduling.queueLength}</li>
                {snapshot.discoveryScheduling.pendingDiscoveryId && (
                  <li><strong>Pending ID</strong> {snapshot.discoveryScheduling.pendingDiscoveryId}</li>
                )}
                <li><strong>Unannounced</strong> {snapshot.discoveryScheduling.unannouncedCount}</li>
                <li><strong>Announced</strong> {snapshot.discoveryScheduling.announcedCount}</li>
                {snapshot.discoveryScheduling.lastAnnouncedId && (
                  <li><strong>Last announced</strong> {snapshot.discoveryScheduling.lastAnnouncedId}</li>
                )}
                {snapshot.discoveryScheduling.nextRetryAt && (
                  <li><strong>Next retry</strong> {new Date(snapshot.discoveryScheduling.nextRetryAt).toLocaleTimeString()}</li>
                )}
                {queueStats && (
                  <>
                    <li><strong>Pool: queued</strong> {queueStats.queued}</li>
                    <li><strong>Pool: presenting</strong> {queueStats.presenting}</li>
                    <li><strong>Pool: dismissed</strong> {queueStats.dismissed}</li>
                    <li><strong>Pool: saved</strong> {queueStats.saved}</li>
                  </>
                )}
                {snapshot.discoveryScheduling.lastTickAt && (
                  <li><strong>Last tick</strong> {new Date(snapshot.discoveryScheduling.lastTickAt).toLocaleTimeString()}</li>
                )}
                {snapshot.discoveryScheduling.lastSkipReason && (
                  <li><strong>Last skip</strong> {snapshot.discoveryScheduling.lastSkipReason}</li>
                )}
              </ul>
              {snapshot.discoveryScheduling.queue && snapshot.discoveryScheduling.queue.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <strong>Queue items:</strong>
                  <ul className="engine-snapshot-list">
                    {snapshot.discoveryScheduling.queue.map((item) => (
                      <li key={item.id}>
                        <strong>{item.title.slice(0, 40)}</strong>
                        <span> · {item.status} · retries {item.retryCount} · interrupts {item.interruptCount}</span>
                        {item.retryAfterAt && <span> · retry after {new Date(item.retryAfterAt).toLocaleTimeString()}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="engine-meta" style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button onClick={() => void window.ourCompanion.discovery.generateNow().then(() => void refreshAll())}>Generate now</button>
                <button onClick={() => void window.ourCompanion.discovery.presentNext().then(() => void refreshAll())}>Present next</button>
                <button onClick={() => { window.__discoveryQueue?.dismissCurrent(); refreshQueueStats(); void refreshAll(); }}>Dismiss current</button>
                <button onClick={() => { window.__discoveryQueue?.reset(); refreshQueueStats(); void refreshAll(); }}>Reset queue</button>
                <button onClick={() => void window.ourCompanion.discovery.resetLifecycle().then(() => void refreshAll())}>Reset lifecycle</button>
                <button onClick={() => void window.ourCompanion.discovery.countPendingAnnouncements().then((r) => { alert(`${r.count} pending announcements`); void refreshAll(); })}>Count pending</button>
                <button onClick={() => void window.ourCompanion.discovery.resetAnnouncementHistory().then((r) => { alert(`Cleared history; ${r.count} discoveries are eligible to be announced`); void refreshAll(); })}>Reset announcement history</button>
                <button onClick={() => void window.ourCompanion.discovery.clearPool().then(() => void refreshAll())}>Clear pool</button>
              </div>
              <div style={{ marginTop: '8px' }}>
                <strong>Simulation:</strong>
                <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => void window.ourCompanion.discovery.simulateCanAnnounceDisabled(true).then(() => void refreshAll())}>Block Companion</button>
                  <button onClick={() => void window.ourCompanion.discovery.simulateCanAnnounceDisabled(false).then(() => void refreshAll())}>Unblock Companion</button>
                  <button onClick={() => void window.ourCompanion.discovery.simulateInterruptEnabled(true).then(() => void refreshAll())}>Simulate interrupt</button>
                  <button onClick={() => void window.ourCompanion.discovery.simulateInterruptEnabled(false).then(() => void refreshAll())}>Stop interrupt</button>
                  <button onClick={() => void window.ourCompanion.discovery.clearSimulation().then(() => void refreshAll())}>Clear simulation</button>
                </div>
              </div>
            </>
          ) : (
            <p className="engine-empty">No scheduling data.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Insight" open={expandedPanels.insight} onToggle={() => togglePanel('insight')}>
          {snapshot?.insights.length ? (
            <ul className="engine-snapshot-list">
              {snapshot.insights.map((insight) => (
                <li key={insight.id}>
                  <strong>{insight.title}</strong>
                  <span>
                    {insight.category} · confidence {insight.confidence.toFixed(2)}
                  </span>
                  <p>{insight.summary}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="engine-empty">No companion insights.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Workspace Status" open={expandedPanels.workspace ?? false} onToggle={() => togglePanel('workspace')}>
          <WorkspaceStatusPanel />
        </SnapshotPanel>

        <SnapshotPanel title="Decision" open={expandedPanels.decision} onToggle={() => togglePanel('decision')}>
          {decisionEvents.length ? (
            <ul className="engine-snapshot-list">
              {decisionEvents.map((event) => (
                <li key={event.id}>
                  <strong>{event.type}</strong>
                  <span>{eventPreview(event)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="engine-empty">No decision events yet. Try discovery refresh.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Action" open={expandedPanels.action} onToggle={() => togglePanel('action')}>
          <p className="engine-meta">
            Permissions: browser {snapshot?.actionPermissions.browser ?? '—'}, automation{' '}
            {snapshot?.actionPermissions.automation ?? '—'}
          </p>
          {actionEvents.length ? (
            <ul className="engine-snapshot-list">
              {actionEvents.map((event) => (
                <li key={event.id}>
                  <strong>{event.type}</strong>
                  <span>{eventPreview(event)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="engine-empty">No action events yet. Try an Ask tab command.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Speech" open={expandedPanels.speech} onToggle={() => togglePanel('speech')}>
          <p className="engine-meta">
            Whisper: {speechStatus?.ready ? 'ready' : speechStatus?.error ?? 'checking…'}
          </p>
          {speechEvents.length ? (
            <ul className="engine-snapshot-list">
              {speechEvents.map((event) => (
                <li key={event.id}>
                  <strong>{event.type}</strong>
                  <span>{eventPreview(event)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="engine-empty">No speech events yet.</p>
          )}
        </SnapshotPanel>

        <SnapshotPanel title="Society" open={expandedPanels.society} onToggle={() => togglePanel('society')}>
          <p className="engine-empty">Society engine is not wired into the desktop runtime.</p>
        </SnapshotPanel>
      </div>

      <SnapshotPanel title="Behavior Controller" open={expandedPanels.behavior ?? false} onToggle={() => togglePanel('behavior')}>
        <BehaviorDebugPanel
          state={behaviorState}
          lastDecision={behaviorDecision}
          recentDismissCount={recentDismissCount}
          recentIgnoreCount={recentIgnoreCount}
          onSetMode={handleBehaviorSetMode}
          onSetMood={handleBehaviorSetMood}
          onSetEnergy={handleBehaviorSetEnergy}
          onSetFocus={handleBehaviorSetFocus}
          onSetInitiativeLevel={handleBehaviorSetInitiativeLevel}
          onSetDiscoveryPresentationState={handleBehaviorSetDiscoveryPresentationState}
          onSetDebugOverride={handleBehaviorSetDebugOverride}
          onForceDecision={handleBehaviorForceDecision}
          onResetTimers={handleBehaviorResetTimers}
        />
      </SnapshotPanel>

      {snapshot?.capturedAt && (
        <p className="engine-meta">Snapshot captured at {new Date(snapshot.capturedAt).toLocaleString()}</p>
      )}
    </div>
  );
}

export function EngineTraceTimeline({ traces }: { traces: EngineTrace[] }) {
  return (
    <section className="engine-trace-timeline" aria-labelledby="engine-trace-timeline-title">
      <div className="engine-trace-timeline-header">
        <div>
          <h3 id="engine-trace-timeline-title">Engine timeline</h3>
          <p>Production operations and their causal references.</p>
        </div>
        <span className="debug-ai-log-count">{traces.length} traces</span>
      </div>
      {traces.length === 0 ? (
        <p className="engine-empty">No engine traces recorded yet.</p>
      ) : (
        <div className="engine-trace-table-scroll">
          <table className="engine-trace-table">
            <thead>
              <tr>
                <th scope="col">Engine</th>
                <th scope="col">Operation</th>
                <th scope="col">Status</th>
                <th scope="col">Provider mode</th>
                <th scope="col">Input refs</th>
                <th scope="col">Output refs</th>
                <th scope="col">Duration</th>
                <th scope="col">Skip reason</th>
                <th scope="col">Error</th>
                <th scope="col">Correlation ID</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => (
                <tr key={trace.id} className={`engine-trace-row engine-trace-row-${trace.status}`}>
                  <td><strong>{trace.engine}</strong></td>
                  <td>{trace.operation}</td>
                  <td>
                    <span className={`engine-trace-status engine-trace-status-${trace.status}`}>
                      {trace.status === 'empty' ? 'No valid discoveries found' : trace.status}
                    </span>
                  </td>
                  <td>{trace.providerMode}</td>
                  <td>{renderTraceRefs(trace.inputRefs)}</td>
                  <td>{renderTraceRefs(trace.outputRefs)}</td>
                  <td>{trace.durationMs === undefined ? '—' : `${trace.durationMs} ms`}</td>
                  <td>{trace.skipReason ?? '—'}</td>
                  <td className="engine-trace-error">{trace.error ?? '—'}</td>
                  <td><code>{trace.correlationId}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function renderTraceRefs(refs: string[]): ReactNode {
  if (refs.length === 0) return '—';
  return (
    <span className="engine-trace-refs">
      {refs.map((ref) => <code key={ref}>{ref}</code>)}
    </span>
  );
}

function SnapshotPanel({
  title,
  open,
  onToggle,
  children
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section className="engine-snapshot-panel">
      <button className="engine-snapshot-header" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
        <strong>{title}</strong>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div id={bodyId} className="engine-snapshot-body" role="region" aria-label={`${title} details`}>{children}</div>}
    </section>
  );
}
