import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresentationCandidate } from './PresentationCandidate';
import { DiscoveryQueueManager } from './DiscoveryQueueManager';

export interface DiscoveryDebugInfo {
  lastAction?: string;
  lastStatus?: 'success' | 'error';
  lastError?: string;
  lastAt?: string;
}

export function useDiscoveryPresentation(opts: {
  onAnnounce?: (candidate: PresentationCandidate) => void;
  onDismissed?: () => void;
}) {
  const { onAnnounce, onDismissed } = opts;

  const [popup, setPopup] = useState<PresentationCandidate | null>(null);
  const [debug, setDebug] = useState<DiscoveryDebugInfo>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const queueRef = useRef(new DiscoveryQueueManager());

  useEffect(() => {
    window.__discoveryQueue = queueRef.current;
    return () => { delete window.__discoveryQueue; };
  }, []);

  const recordDebug = useCallback((action: string, status: 'success' | 'error', error?: string) => {
    setDebug({
      lastAction: action,
      lastStatus: status,
      lastError: error,
      lastAt: new Date().toISOString(),
    });
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
      setPopup(null);
      advanceQueue();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordDebug('save', 'error', msg);
      setActionError(msg);
      console.warn('[our-companion] Discovery save failed.', err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, recordDebug, advanceQueue]);

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
      setPopup(null);
      advanceQueue();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordDebug('ignore', 'error', msg);
      setActionError(msg);
      console.warn('[our-companion] Discovery ignore failed.', err);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, recordDebug, advanceQueue]);

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
    setPopup(null);
    advanceQueue();
    onDismissed?.();
  }, [actionLoading, advanceQueue, onDismissed]);

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
