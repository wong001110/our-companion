import { useEffect, useState } from 'react';
import type { WorkspaceStatusSnapshot } from '@our-companion/shared';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function MetricRow({ label, value, available }: { label: string; value: string; available: boolean }) {
  return (
    <li>
      <strong>{label}</strong>{' '}
      {available ? value : <span style={{ opacity: 0.5 }}>Unavailable</span>}
    </li>
  );
}

export function WorkspaceStatusPanel() {
  const [snapshot, setSnapshot] = useState<WorkspaceStatusSnapshot | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    function refresh() {
      void window.ourCompanion.workspace.getStatus().then((s) => {
        if (!cancelled) setSnapshot(s);
      }).catch(() => undefined);
    }
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [enabled]);

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <strong>Workspace Status</strong>
        <button onClick={() => setEnabled((e) => !e)}>
          {enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
      {enabled && snapshot ? (
        <>
          <ul className="engine-snapshot-list">
            <MetricRow label="CPU" value={`${snapshot.metrics.cpuUsage ?? '?'}%`} available={snapshot.availableMetrics.includes('cpuUsage')} />
            <MetricRow label="CPU Cores" value={`${snapshot.metrics.cpuCores ?? '?'} × ${snapshot.metrics.cpuModel ?? ''}`} available={snapshot.availableMetrics.includes('cpuCores')} />
            <MetricRow label="Memory" value={snapshot.metrics.memoryUsed !== undefined ? `${formatBytes(snapshot.metrics.memoryUsed)} / ${formatBytes(snapshot.metrics.memoryTotal ?? 0)} (${snapshot.metrics.memoryUsage ?? '?'}%)` : '?'} available={snapshot.availableMetrics.includes('memoryUsage')} />
            <MetricRow label="Uptime" value={snapshot.metrics.uptime !== undefined ? formatUptime(snapshot.metrics.uptime) : '?'} available={snapshot.availableMetrics.includes('uptime')} />
            <MetricRow label="Platform" value={`${snapshot.metrics.platform ?? '?'} ${snapshot.metrics.arch ?? ''}`} available={snapshot.availableMetrics.includes('platform')} />
            <MetricRow label="Network" value={snapshot.metrics.networkOnline !== undefined ? (snapshot.metrics.networkOnline ? 'Online' : 'Offline') : '?'} available={snapshot.availableMetrics.includes('networkOnline')} />
            <MetricRow label="Battery" value={snapshot.metrics.batteryPercent !== undefined ? `${snapshot.metrics.batteryPercent}%${snapshot.metrics.batteryCharging ? ' ⚡' : ''}` : '?'} available={snapshot.availableMetrics.includes('batteryPercent')} />
          </ul>
          <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.6 }}>
            Summary: CPU {snapshot.summary.cpu} · Mem {snapshot.summary.memory} · Net {snapshot.summary.network}
          </div>
          {snapshot.unavailableMetrics.length > 0 && (
            <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.5 }}>
              Unavailable: {snapshot.unavailableMetrics.join(', ')}
            </div>
          )}
        </>
      ) : enabled ? (
        <p style={{ opacity: 0.5, fontSize: '12px' }}>Loading...</p>
      ) : null}
    </div>
  );
}
