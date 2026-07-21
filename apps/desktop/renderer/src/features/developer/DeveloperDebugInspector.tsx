import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeveloperDebugEvent, DeveloperDebugEventKind, DeveloperDebugEventQuery } from '@our-companion/shared';
import { formatJson } from '../../ui/utils';
import { DebugJsonBlock } from '../../ui/DebugComponents';

type InspectorTab = 'ai_calls' | 'research' | 'pipeline' | 'upload_status';

const KIND_OPTIONS: Array<{ value: DeveloperDebugEventKind | 'all'; label: string }> = [
  { value: 'all', label: 'All kinds' },
  { value: 'ai_call', label: 'AI Calls' },
  { value: 'research_search', label: 'Research Search' },
  { value: 'research_page_fetch', label: 'Page Fetch' },
  { value: 'research_evidence', label: 'Evidence' },
  { value: 'evidence_synthesis', label: 'Synthesis' },
  { value: 'pipeline_failure', label: 'Pipeline Failure' },
];

const PAGE_SIZE = 50;

const TAB_KINDS: Record<Exclude<InspectorTab, 'upload_status'>, DeveloperDebugEventKind[]> = {
  ai_calls: ['ai_call'],
  research: ['research_search', 'research_page_fetch', 'research_evidence', 'evidence_synthesis'],
  pipeline: ['pipeline_failure'],
};

export function DeveloperDebugInspector({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<InspectorTab>('ai_calls');
  const [events, setEvents] = useState<DeveloperDebugEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<DeveloperDebugEventKind | 'all'>('all');
  const [operationFilter, setOperationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cycleFilter, setCycleFilter] = useState('');
  const [correlationFilter, setCorrelationFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  const activeKinds = useMemo(() => {
    if (kindFilter !== 'all') return [kindFilter];
    if (tab === 'upload_status') return [];
    return TAB_KINDS[tab as Exclude<InspectorTab, 'upload_status'>] ?? [];
  }, [tab, kindFilter]);

  const buildQuery = useCallback((pageNum: number): DeveloperDebugEventQuery => {
    return {
      kinds: activeKinds.length > 0 ? activeKinds : undefined,
      operation: operationFilter || undefined,
      status: statusFilter || undefined,
      provider: providerFilter || undefined,
      cycleId: cycleFilter || undefined,
      correlationId: correlationFilter || undefined,
      limit: PAGE_SIZE,
      offset: pageNum * PAGE_SIZE,
    };
  }, [activeKinds, operationFilter, statusFilter, providerFilter, cycleFilter, correlationFilter]);

  const fetchEvents = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const query = buildQuery(pageNum);
      const [listed, counted] = await Promise.all([
        window.ourCompanion.debugEvents.listEvents(query),
        window.ourCompanion.debugEvents.countEvents(query),
      ]);
      setEvents(listed);
      setTotalCount(counted);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    if (!open) return;
    void fetchEvents(0);
    setPage(0);
    setExpandedId(null);
  }, [open, fetchEvents]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function handlePageChange(newPage: number) {
    setPage(newPage);
    void fetchEvents(newPage);
    setExpandedId(null);
  }

  function handleCopyJson(event: DeveloperDebugEvent) {
    void navigator.clipboard.writeText(formatJson(event));
  }

  function handleDownloadRedacted(event: DeveloperDebugEvent) {
    const redacted = { ...event, payload: '[redacted]', correlationId: event.correlationId ? '[redacted]' : undefined };
    const blob = new Blob([formatJson(redacted)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-event-${event.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="debug-inspector-overlay" ref={overlayRef} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Debug Inspector">
      <div className="debug-inspector-modal">
        <div className="debug-inspector-header">
          <h2>Debug Inspector</h2>
          <span className="debug-inspector-count">{totalCount} events total</span>
          <button className="debug-inspector-close" onClick={onClose}>✕</button>
        </div>

        <div className="debug-inspector-tabs" role="tablist">
          {(['ai_calls', 'research', 'pipeline', 'upload_status'] as InspectorTab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setKindFilter('all'); setPage(0); setExpandedId(null); }}>
              {t === 'ai_calls' ? 'AI Calls' : t === 'research' ? 'Research' : t === 'pipeline' ? 'Pipeline' : 'Upload Status'}
            </button>
          ))}
        </div>

        {tab !== 'upload_status' && (
          <div className="debug-inspector-filters">
            <label><span>Kind</span><select value={kindFilter} onChange={(e) => { setKindFilter(e.target.value as DeveloperDebugEventKind | 'all'); setPage(0); }}>
              {KIND_OPTIONS.filter((o) => o.value === 'all' || (TAB_KINDS[tab] ?? []).includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
            <label><span>Operation</span><input value={operationFilter} onChange={(e) => setOperationFilter(e.target.value)} placeholder="filter..." /></label>
            <label><span>Status</span><input value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="filter..." /></label>
            <label><span>Cycle ID</span><input value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)} placeholder="filter..." /></label>
            <label><span>Correlation</span><input value={correlationFilter} onChange={(e) => setCorrelationFilter(e.target.value)} placeholder="filter..." /></label>
            <label><span>Provider</span><input value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} placeholder="filter..." /></label>
          </div>
        )}

        <div className="debug-inspector-content">
          {tab === 'upload_status' ? (
            <UploadStatusPanel />
          ) : (
            <>
              {loading && <p className="debug-inspector-status">Loading...</p>}
              {!loading && events.length === 0 && <p className="debug-inspector-status">No events found.</p>}
              <div className="debug-inspector-event-list">
                {events.map((event) => (
                  <div key={event.id} className="debug-inspector-event">
                    <button className="debug-inspector-event-header" onClick={() => setExpandedId(expandedId === event.id ? null : event.id)} aria-expanded={expandedId === event.id}>
                      <span className="debug-inspector-event-time">{new Date(event.createdAt).toLocaleString()}</span>
                      <span className={`debug-inspector-kind-badge debug-kind-${event.kind}`}>{event.kind}</span>
                      <span className="debug-inspector-event-op">{event.operation ?? '—'}</span>
                      <span className={`debug-inspector-status-badge ${event.status === 'error' ? 'status-error' : 'status-ok'}`}>{event.status ?? '—'}</span>
                      {event.provider && <span className="debug-inspector-provider">{event.provider}{event.model ? `/${event.model}` : ''}</span>}
                      {event.errorMessage && <span className="debug-inspector-error-snippet">{event.errorMessage.slice(0, 60)}</span>}
                      <span className="debug-inspector-chevron">{expandedId === event.id ? '▲' : '▼'}</span>
                    </button>
                    {expandedId === event.id && (
                      <div className="debug-inspector-event-detail">
                        <div className="debug-inspector-detail-grid">
                          {event.correlationId && <div><dt>Correlation ID</dt><dd>{event.correlationId}</dd></div>}
                          {event.cycleId && <div><dt>Cycle ID</dt><dd>{event.cycleId}</dd></div>}
                          {event.turnId && <div><dt>Turn ID</dt><dd>{event.turnId}</dd></div>}
                          {event.summary && <div><dt>Summary</dt><dd>{event.summary}</dd></div>}
                          {event.errorCode && <div><dt>Error Code</dt><dd>{event.errorCode}</dd></div>}
                          {event.errorMessage && <div><dt>Error Message</dt><dd>{event.errorMessage}</dd></div>}
                          <div><dt>Sync Status</dt><dd>{event.syncStatus}</dd></div>
                          {event.syncAttemptCount > 0 && <div><dt>Sync Attempts</dt><dd>{event.syncAttemptCount}</dd></div>}
                          {event.lastSyncAttemptAt && <div><dt>Last Sync Attempt</dt><dd>{new Date(event.lastSyncAttemptAt).toLocaleString()}</dd></div>}
                          {event.uploadedAt && <div><dt>Uploaded At</dt><dd>{new Date(event.uploadedAt).toLocaleString()}</dd></div>}
                        </div>
                        {event.payload && (
                          <DebugJsonBlock title="Payload" value={event.payload} />
                        )}
                        <div className="debug-inspector-actions">
                          <button onClick={() => handleCopyJson(event)}>Copy JSON</button>
                          <button onClick={() => handleDownloadRedacted(event)}>Download Redacted</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="debug-inspector-pagination">
                  <button disabled={page === 0} onClick={() => handlePageChange(page - 1)}>← Prev</button>
                  <span>Page {page + 1} of {totalPages}</span>
                  <button disabled={page >= totalPages - 1} onClick={() => handlePageChange(page + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadStatusPanel() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof window.ourCompanion.developer.getUploadStatus>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const [flushResult, setFlushResult] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      window.ourCompanion.developer.getUploadStatus(),
      window.ourCompanion.developer.getUploadSetting(),
    ]).then(([uploadStatus, uploadSetting]) => {
      if (active) {
        setStatus(uploadStatus);
        setUploadEnabled(uploadSetting);
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleFlush() {
    setFlushing(true);
    setFlushResult(null);
    try {
      const result = await window.ourCompanion.developer.flushDebugEvents();
      setFlushResult(`Uploaded ${result.uploaded}, failed ${result.failed}`);
      const updated = await window.ourCompanion.developer.getUploadStatus();
      setStatus(updated);
    } catch (error) {
      setFlushResult(error instanceof Error ? error.message : 'Flush failed');
    } finally {
      setFlushing(false);
    }
  }

  async function handleUploadToggle(enabled: boolean) {
    const previous = uploadEnabled;
    setUploadEnabled(enabled);
    try {
      await window.ourCompanion.developer.setUploadSetting(enabled);
      const updated = await window.ourCompanion.developer.getUploadStatus();
      setStatus(updated);
    } catch {
      setUploadEnabled(previous);
    }
  }

  if (loading) return <p className="debug-inspector-status">Loading upload status...</p>;

  const canFlush = status?.isDevBuild && status.onlineModeEnabled && status.authenticated && status.uploadSettingEnabled && (status.pendingEvents ?? 0) > 0 && !flushing;

  return (
    <div className="debug-inspector-upload-status">
      <h3>Upload Status</h3>
      <dl className="debug-inspector-detail-grid">
        <div><dt>Dev Build</dt><dd>{status?.isDevBuild ? 'Yes' : 'No'}</dd></div>
        <div><dt>Online Mode</dt><dd>{status?.onlineModeEnabled ? 'Enabled' : 'Disabled'}</dd></div>
        <div><dt>Network State</dt><dd>{status?.networkState ?? 'unknown'}</dd></div>
        <div><dt>Authenticated</dt><dd>{status?.authenticated ? 'Yes' : 'No'}</dd></div>
        <div><dt>Pending Events</dt><dd>{status?.pendingEvents ?? 0}</dd></div>
        {status?.lastUploadAt && <div><dt>Last Upload</dt><dd>{new Date(status.lastUploadAt).toLocaleString()}</dd></div>}
        {status?.lastUploadError && <div><dt>Last Error</dt><dd>{status.lastUploadError}</dd></div>}
      </dl>
      {status?.isDevBuild && (
        <label className="checkbox-row">
          <input type="checkbox" checked={uploadEnabled} onChange={(e) => void handleUploadToggle(e.target.checked)} />
          <span>Enable debug event upload</span>
        </label>
      )}
      <div className="debug-inspector-actions">
        <button onClick={() => void handleFlush()} disabled={!canFlush}>{flushing ? 'Flushing...' : 'Flush Events'}</button>
      </div>
      {flushResult && <p className="debug-inspector-status">{flushResult}</p>}
    </div>
  );
}
