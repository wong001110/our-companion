import { useEffect, useState } from 'react';
import type { VisualVisitRendererState } from '@our-companion/shared';
import type { SceneOccupancyController, SceneMotionDiagnostics } from '../../motion/SceneOccupancyController';

export function SceneInspectorCard({
  kind,
  controller,
  visualVisit,
}: {
  kind: 'motion' | 'social';
  controller: SceneOccupancyController;
  visualVisit: VisualVisitRendererState;
}) {
  const [snapshot, setSnapshot] = useState<SceneMotionDiagnostics>(() => controller.getDiagnostics());
  const [socialStateUpdates, setSocialStateUpdates] = useState(0);
  useEffect(() => {
    const refresh = () => setSnapshot(controller.getDiagnostics());
    refresh();
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, [controller]);
  useEffect(() => setSocialStateUpdates((count) => count + 1), [visualVisit]);

  if (kind === 'social') {
    return <div className="observatory-snapshot-card" data-testid="social-inspector">
      <div className="observatory-card-header">Social</div>
      <ul className="observatory-card-list">
        <li><strong>Owner</strong> {visualVisit.ownerPresenceMode}</li>
        <li><strong>Active / departing</strong> {visualVisit.visitorOrder.length} / {Object.keys(visualVisit.departingVisitors).length}</li>
        <li><strong>Scene actors</strong> {snapshot.actors.map((actor) => `${actor.id}:${actor.priority}`).join(', ') || '—'}</li>
        <li><strong>Renderer failures</strong> {Object.keys(visualVisit.errors).length}</li>
        <li><strong>Reconcile/state updates</strong> {socialStateUpdates}</li>
        <li><strong>Teleport violations</strong> {snapshot.teleportViolationCount}</li>
        <li><strong>Continuity</strong> {snapshot.continuityEvents.slice(-3).join(', ') || '—'}</li>
      </ul>
    </div>;
  }

  return <div className="observatory-snapshot-card" data-testid="motion-inspector">
    <div className="observatory-card-header">Motion</div>
    <ul className="observatory-card-list">
      {snapshot.actors.map((actor) => <li key={actor.id}>
        <strong>{actor.id}</strong> {actor.type} · ({actor.position.x.toFixed(1)}, {actor.position.y.toFixed(1)}) → {actor.target ? `(${actor.target.x.toFixed(1)}, ${actor.target.y.toFixed(1)})` : '—'} · {actor.currentSpeed.toFixed(1)}px/s · {actor.phase} · {actor.lastResolution}{actor.replanReason ? ` · ${actor.replanReason}` : ''}
      </li>)}
      <li><strong>Largest frame</strong> {snapshot.largestFrameDelta.toFixed(1)}ms</li>
      <li><strong>Teleport violations</strong> {snapshot.teleportViolationCount}</li>
    </ul>
  </div>;
}
