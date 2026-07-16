import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CompanionProfile,
  NetworkAssetPack,
  NetworkStatus,
  PublicCompanionProfile,
} from '@our-companion/shared';

export type OwnedPublishedCompanion = PublicCompanionProfile & { assetPacks: NetworkAssetPack[] };

export interface PublishedCompanionSnapshot {
  activeNetworkCompanionId?: string;
  companions: OwnedPublishedCompanion[];
}

export function publishedCompanionScopeKey(status?: NetworkStatus): string | undefined {
  return status?.account ? `${status.serverUrl}\u0000${status.account.id}` : undefined;
}

export function publishedCompanionDataMatchesScope(status: NetworkStatus | undefined, dataScope: string | undefined): boolean {
  const currentScope = publishedCompanionScopeKey(status);
  return Boolean(currentScope && currentScope === dataScope);
}

/** Owns local Companion discovery and the account-and-server-scoped publication snapshot. */
export function usePublishedCompanionViewModel() {
  const [status, setStatus] = useState<NetworkStatus>();
  const [localCompanions, setLocalCompanions] = useState<CompanionProfile[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localLoadFailed, setLocalLoadFailed] = useState(false);
  const [snapshot, setSnapshot] = useState<PublishedCompanionSnapshot>();
  const [dataScope, setDataScope] = useState<string>();
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkLoadFailed, setNetworkLoadFailed] = useState(false);
  const statusRef = useRef<NetworkStatus | undefined>(undefined);
  const mountedRef = useRef(true);
  const observedScopeRef = useRef<string | undefined>(undefined);

  const scope = publishedCompanionScopeKey(status);
  const networkAvailable = Boolean(status?.onlineModeEnabled && status.state === 'online' && status.account);
  const scopeMatches = publishedCompanionDataMatchesScope(status, dataScope);
  const visibleSnapshot = scopeMatches ? snapshot : undefined;

  const refreshLocal = useCallback(async () => {
    setLocalLoading(true);
    setLocalLoadFailed(false);
    try {
      const next = await window.ourCompanion.companionNew.list();
      if (mountedRef.current) setLocalCompanions(next);
    } catch {
      if (mountedRef.current) setLocalLoadFailed(true);
    } finally {
      if (mountedRef.current) setLocalLoading(false);
    }
  }, []);

  const refreshNetwork = useCallback(async () => {
    const statusAtStart = statusRef.current;
    const scopeAtStart = publishedCompanionScopeKey(statusAtStart);
    if (!scopeAtStart || statusAtStart?.state !== 'online' || !statusAtStart.onlineModeEnabled) return false;
    setNetworkLoading(true);
    setNetworkLoadFailed(false);
    try {
      const next = await window.ourCompanion.network.companions.getMine();
      if (!mountedRef.current || publishedCompanionScopeKey(statusRef.current) !== scopeAtStart) return false;
      setSnapshot(next);
      setDataScope(scopeAtStart);
      return true;
    } catch {
      if (mountedRef.current && publishedCompanionScopeKey(statusRef.current) === scopeAtStart) setNetworkLoadFailed(true);
      return false;
    } finally {
      if (mountedRef.current && publishedCompanionScopeKey(statusRef.current) === scopeAtStart) setNetworkLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshLocal();
    let statusRevision = 0;
    const unsubscribe = window.ourCompanion.network.onStatusChanged((next) => {
      statusRevision += 1;
      statusRef.current = next;
      setStatus(next);
    });
    const requestedAtRevision = statusRevision;
    void window.ourCompanion.network.getStatus().then((next) => {
      if (!mountedRef.current || statusRevision !== requestedAtRevision) return;
      statusRef.current = next;
      setStatus(next);
    }).catch(() => undefined);
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [refreshLocal]);

  useEffect(() => {
    statusRef.current = status;
    if (observedScopeRef.current !== scope) {
      observedScopeRef.current = scope;
      setNetworkLoadFailed(false);
    }
    if (networkAvailable) void refreshNetwork();
    else setNetworkLoading(false);
  }, [networkAvailable, refreshNetwork, scope, status]);

  return {
    status,
    localCompanions,
    localLoading,
    localLoadFailed,
    refreshLocal,
    snapshot: visibleSnapshot,
    scope,
    networkAvailable,
    networkLoading,
    networkLoadFailed,
    stale: Boolean(visibleSnapshot && !networkAvailable),
    refreshNetwork,
  };
}
