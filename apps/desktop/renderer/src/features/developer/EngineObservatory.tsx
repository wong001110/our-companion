import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  BaseEvent,
  EmotionState,
  EngineSnapshot,
  ExplorationLoopEvent,
  ExplorationState,
  SpeechStatus
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
                          {discovery.source} · score {discovery.finalScore}
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
                <button onClick={() => void window.ourCompanion.discovery.shareNext().then(() => void refreshAll())}>Share next</button>
                <button onClick={() => { window.__discoveryQueue?.dismissCurrent(); refreshQueueStats(); void refreshAll(); }}>Dismiss current</button>
                <button onClick={() => { window.__discoveryQueue?.reset(); refreshQueueStats(); void refreshAll(); }}>Reset queue</button>
                <button onClick={() => void window.ourCompanion.discovery.resetStatuses().then(() => void refreshAll())}>Reset statuses</button>
                <button onClick={() => void window.ourCompanion.discovery.countUnannounced().then((r) => { alert(`${r.count} unannounced`); void refreshAll(); })}>Count unannounced</button>
                <button onClick={() => void window.ourCompanion.discovery.markSharedAsUnannounced().then((r) => { alert(`Cleared history; ${r.count} shared discoveries can now be re-announced`); void refreshAll(); })}>Reset announcement history</button>
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
                    {insight.type} · confidence {insight.confidence.toFixed(2)}
                  </span>
                  <p>{insight.narration ?? insight.summary}</p>
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
          <p className="engine-empty">Society engine is not wired into the desktop app in v1.</p>
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
  return (
    <section className="engine-snapshot-panel">
      <button className="engine-snapshot-header" onClick={onToggle} aria-expanded={open}>
        <strong>{title}</strong>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="engine-snapshot-body">{children}</div>}
    </section>
  );
}
