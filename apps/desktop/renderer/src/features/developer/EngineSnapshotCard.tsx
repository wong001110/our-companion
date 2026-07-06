import type { EngineSnapshot, EmotionState } from '@our-companion/shared';
import type { EnginePanelKey } from './EngineObservatoryToolbar';

interface EngineSnapshotCardProps {
  engineKey: EnginePanelKey;
  snapshot?: EngineSnapshot;
}

function topEmotions(emotion?: EmotionState): string {
  if (!emotion) return '—';
  return (Object.entries(emotion) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ');
}

function CharacterCard({ snapshot }: { snapshot: EngineSnapshot }) {
  const cs = snapshot.characterState;
  if (!cs) return <p className="observatory-card-empty">No character state.</p>;
  return (
    <ul className="observatory-card-list">
      <li><strong>State</strong> {cs.coreState} / {cs.intent}</li>
      <li><strong>Emotion</strong> {topEmotions(cs.emotion)}</li>
    </ul>
  );
}

function PatternCard({ snapshot }: { snapshot: EngineSnapshot }) {
  if (!snapshot.patterns.length) return <p className="observatory-card-empty">No patterns.</p>;
  return (
    <ul className="observatory-card-list">
      {snapshot.patterns.slice(0, 4).map((p) => (
        <li key={p.id}>
          <strong>{p.title}</strong>
          <span>{p.type} · {p.strength.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

function InterestCard({ snapshot }: { snapshot: EngineSnapshot }) {
  const g = snapshot.interestGraph;
  if (!g.nodes.length) return <p className="observatory-card-empty">Empty graph.</p>;
  return (
    <ul className="observatory-card-list">
      <li>{g.nodes.length} nodes · {g.edges.length} edges</li>
      {g.nodes.slice(0, 3).map((n) => (
        <li key={n.id}><strong>{n.label}</strong> <span>{n.weight.toFixed(2)}</span></li>
      ))}
    </ul>
  );
}

function CuriosityCard({ snapshot }: { snapshot: EngineSnapshot }) {
  if (!snapshot.curiosityTargets.length) return <p className="observatory-card-empty">No targets.</p>;
  return (
    <ul className="observatory-card-list">
      {snapshot.curiosityTargets.slice(0, 4).map((t) => (
        <li key={t.id}>
          <strong>{t.topic}</strong>
          <span>{t.explorationType} · {t.priority.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

function DiscoveryCard({ snapshot }: { snapshot: EngineSnapshot }) {
  const candidates = snapshot.discoveryCandidates;
  const recent = snapshot.recentDiscoveries;
  if (!candidates.length && !recent.length) return <p className="observatory-card-empty">No discoveries.</p>;
  return (
    <ul className="observatory-card-list">
      {candidates.slice(0, 3).map((c) => (
        <li key={c.id}><strong>{c.title}</strong> <span>{c.relevanceScore.toFixed(2)}</span></li>
      ))}
      {recent.slice(0, 2).map((d) => (
        <li key={d.id}><strong>{d.title}</strong> <span>{d.source}</span></li>
      ))}
    </ul>
  );
}

function DiscoverySchedulingCard({ snapshot }: { snapshot: EngineSnapshot }) {
  const s = snapshot.discoveryScheduling;
  if (!s) return <p className="observatory-card-empty">No scheduling data.</p>;
  return (
    <ul className="observatory-card-list">
      <li><strong>Busy</strong> {s.isBusy ? 'yes' : 'no'}</li>
      <li><strong>Pending</strong> {s.hasPending ? 'yes' : 'no'}</li>
      <li><strong>Queue</strong> {s.queueLength}</li>
      <li><strong>Unannounced</strong> {s.unannouncedCount}</li>
    </ul>
  );
}

function InsightCard({ snapshot }: { snapshot: EngineSnapshot }) {
  if (!snapshot.insights.length) return <p className="observatory-card-empty">No insights.</p>;
  return (
    <ul className="observatory-card-list">
      {snapshot.insights.slice(0, 3).map((i) => (
        <li key={i.id}>
          <strong>{i.title}</strong>
          <span>{i.confidence.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

const PANEL_LABELS: Record<EnginePanelKey, string> = {
  character: 'Character',
  pattern: 'Pattern',
  interest: 'Interest',
  curiosity: 'Curiosity',
  discovery: 'Discovery',
  discoveryScheduling: 'Scheduling',
  insight: 'Insight',
};

function CardContent({ engineKey, snapshot }: { engineKey: EnginePanelKey; snapshot: EngineSnapshot }) {
  switch (engineKey) {
    case 'character': return <CharacterCard snapshot={snapshot} />;
    case 'pattern': return <PatternCard snapshot={snapshot} />;
    case 'interest': return <InterestCard snapshot={snapshot} />;
    case 'curiosity': return <CuriosityCard snapshot={snapshot} />;
    case 'discovery': return <DiscoveryCard snapshot={snapshot} />;
    case 'discoveryScheduling': return <DiscoverySchedulingCard snapshot={snapshot} />;
    case 'insight': return <InsightCard snapshot={snapshot} />;
  }
}

export function EngineSnapshotCard({ engineKey, snapshot }: EngineSnapshotCardProps) {
  return (
    <div className="observatory-snapshot-card">
      <div className="observatory-card-header">{PANEL_LABELS[engineKey]}</div>
      {snapshot ? <CardContent engineKey={engineKey} snapshot={snapshot} /> : <p className="observatory-card-empty">Loading…</p>}
    </div>
  );
}
