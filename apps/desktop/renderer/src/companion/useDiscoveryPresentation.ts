import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresentationCandidate } from './PresentationCandidate';
import { DiscoveryQueueManager } from './DiscoveryQueueManager';

export interface DiscoveryDebugInfo {
  lastAction?: string;
  lastStatus?: 'success' | 'error';
  lastError?: string;
  lastAt?: string;
  queued: number;
  presenting: boolean;
  dismissed: number;
  saved: number;
  ignored: number;
}

export function useDiscoveryPresentation(opts: {
  onAnnounce?: (candidate: PresentationCandidate) => void;
  onDismissed?: () => void;
}) {
  const { onAnnounce, onDismissed } = opts;

  const [popup, setPopup] = useState<PresentationCandidate | null>(null);
  const [debug, setDebug] = useState<DiscoveryDebugInfo>({
    queued: 0,
    presenting: false,
    dismissed: 0,
    saved: 0,
    ignored: 0,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const queueRef = useRef(new DiscoveryQueueManager());
  const debugCountersRef = useRef({ dismissed: 0, saved: 0, ignored: 0 });

  useEffect(() => {
    window.__discoveryQueue = queueRef.current;
    return () => { delete window.__discoveryQueue; };
  }, []);

  const updateDebugCounters = useCallback(() => {
    const queue = queueRef.current;
    const stats = queue.getStats();
    const counters = debugCountersRef.current;
    setDebug((prev) => ({
      ...prev,
      queued: stats.queued,
      presenting: stats.presenting > 0,
      dismissed: counters.dismissed,
      saved: counters.saved,
      ignored: counters.ignored,
    }));
  }, []);

  const recordDebug = useCallback((action: string, status: 'success' | 'error', error?: string) => {
    setDebug((prev) => ({
      ...prev,
      lastAction: action,
      lastStatus: status,
      lastError: error,
      lastAt: new Date().toISOString(),
    }));
  }, []);

  const advanceQueue = useCallback(() => {
    const next = queueRef.current.presentNext();
    if (next) {
      setPopup(next.candidate);
      onAnnounce?.(next.candidate);
    }
  }, [onAnnounce]);

  const enqueue = useCallback((candidate: PresentationCandidate): boolean => {
    return queueRef.current.enqueue(candidate);
  }, []);

  const presentNext = useCallback((): PresentationCandidate | null => {
    const next = queueRef.current.presentNext();
    if (next) {
      setPopup(next.candidate);
      onAnnounce?.(next.candidate);
    }
    return next?.candidate ?? null;
  }, [onAnnounce]);

  const save = useCallback(async (candidate: PresentationCandidate) => {
    if (actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await window.ourCompanion.discovery.markInterested(candidate.id);
      recordDebug('save', 'success');
      queueRef.current.saveCurrent();
      debugCountersRef.current.saved += 1;
      setPopup(null);
      advanceQueue();
      updateDebugCounters();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordDebug('save', 'error', msg);
      setActionError(msg);
      console.warn('[our-companion] Discovery save failed.', err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, recordDebug, advanceQueue, updateDebugCounters]);

  const addToJourney = useCallback(async (candidate: PresentationCandidate) => {
    if (actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await window.ourCompanion.discovery.addToJourney({ discoveryId: candidate.id });
      recordDebug('add_to_journey', 'success');
      queueRef.current.dismissCurrent();
      setPopup(null);
      advanceQueue();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordDebug('add_to_journey', 'error', msg);
      setActionError(msg);
      console.warn('[our-companion] Discovery add to journey failed.', err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, recordDebug, advanceQueue]);

  const ignore = useCallback(async (candidate: PresentationCandidate) => {
    if (actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await window.ourCompanion.discovery.markNotInterested(candidate.id);
      recordDebug('ignore', 'success');
      queueRef.current.dismissCurrent();
      debugCountersRef.current.ignored += 1;
      setPopup(null);
      advanceQueue();
      updateDebugCounters();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordDebug('ignore', 'error', msg);
      setActionError(msg);
      console.warn('[our-companion] Discovery ignore failed.', err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, recordDebug, advanceQueue, updateDebugCounters]);

  const view = useCallback(() => {
    if (actionLoading) return;
    queueRef.current.dismissCurrent();
    setPopup(null);
    void window.ourCompanion.window.openPanel();
    recordDebug('view', 'success');
    onDismissed?.();
  }, [actionLoading, recordDebug, onDismissed]);

  const dismiss = useCallback(() => {
    if (actionLoading) return;
    setActionError(null);
    queueRef.current.dismissCurrent();
    debugCountersRef.current.dismissed += 1;
    setPopup(null);
    advanceQueue();
    updateDebugCounters();
    onDismissed?.();
  }, [actionLoading, advanceQueue, onDismissed, updateDebugCounters]);

  const getQueue = useCallback(() => queueRef.current, []);

  const hasCandidate = useCallback(() => !!queueRef.current.getNext(), []);

  return {
    popup,
    debug,
    actionError,
    actionLoading,
    enqueue,
    presentNext,
    save,
    addToJourney,
    ignore,
    view,
    dismiss,
    advanceQueue,
    getQueue,
    hasCandidate,
  };
}
