import { useCallback, useEffect, useRef, useState } from 'react';
import type { NetworkStatus, VisitInvitationSummary, VisitSessionSummary } from '@our-companion/shared';
import { t, type Lang } from '../../i18n';

export type SocialFriend = { userId: string; username: string; friendCode: string; presence: string; hasPublishedCompanion: boolean };
export type SocialFriendCompanion = { id: string; ownerUserId: string; name: string; publicDescription?: string; publicTags: string[]; activeAssetPackId?: string };

/** Owns the independently refreshed Social data domains without coupling them to page markup. */
export function useSocialViewModel(lang: Lang) {
  const [status, setStatus] = useState<NetworkStatus>();
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [incoming, setIncoming] = useState<Array<{ id: string; username: string }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ id: string; username: string }>>([]);
  const [blocked, setBlocked] = useState<Array<{ userId: string; username: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [friendCompanion, setFriendCompanion] = useState<SocialFriendCompanion>();
  const [friendAssetStatus, setFriendAssetStatus] = useState('');
  const [visitIncoming, setVisitIncoming] = useState<VisitInvitationSummary[]>([]);
  const [visitOutgoing, setVisitOutgoing] = useState<VisitInvitationSummary[]>([]);
  const [visitSessions, setVisitSessions] = useState<VisitSessionSummary[]>([]);
  const [canSendVisit, setCanSendVisit] = useState(false);
  const scopeRef = useRef<string | undefined>(undefined);
  const lastRevisionRef = useRef<number | undefined>(undefined);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const available = Boolean(status?.onlineModeEnabled && status.state === 'online' && status.account);
  const visitsAvailable = Boolean(status?.features?.visitInvitations && status.features?.visitSessions);
  const scope = status?.account ? `${status.serverUrl}:${status.account.id}` : undefined;

  const clear = useCallback(() => {
    setFriends([]); setIncoming([]); setOutgoing([]); setBlocked([]); setVisitIncoming([]); setVisitOutgoing([]); setVisitSessions([]); setCanSendVisit(false); setFriendCompanion(undefined); setFriendAssetStatus(''); setError('');
  }, []);

  const refresh = useCallback(async () => {
    const scopeAtStart = scopeRef.current;
    if (!available || !scopeAtStart) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        window.ourCompanion.network.friends.getAll(), window.ourCompanion.network.friends.getIncomingRequests(), window.ourCompanion.network.friends.getOutgoingRequests(), window.ourCompanion.network.blocks.getAll(), window.ourCompanion.network.presence.getFriendPresence(), visitsAvailable ? window.ourCompanion.network.visits.invitations.list({ direction: 'incoming' }) : Promise.resolve([]), visitsAvailable ? window.ourCompanion.network.visits.invitations.list({ direction: 'outgoing' }) : Promise.resolve([]), visitsAvailable ? window.ourCompanion.network.visits.sessions.list() : Promise.resolve([]), window.ourCompanion.network.companions.getMine(),
      ]);
      if (scopeAtStart !== scopeRef.current) return;
      const [nextFriends, nextIncoming, nextOutgoing, nextBlocked, presence, nextVisitIncoming, nextVisitOutgoing, nextVisitSessions, mine] = results;
      if (nextFriends.status === 'fulfilled') {
        const presenceByUser = presence.status === 'fulfilled' ? new Map(presence.value.map((item) => [item.userId, item.status])) : new Map<string, string>();
        setFriends(nextFriends.value.map((friend) => ({ ...friend, presence: presenceByUser.get(friend.userId) ?? 'offline' })));
      }
      if (nextIncoming.status === 'fulfilled') setIncoming(nextIncoming.value);
      if (nextOutgoing.status === 'fulfilled') setOutgoing(nextOutgoing.value);
      if (nextBlocked.status === 'fulfilled') setBlocked(nextBlocked.value);
      if (nextVisitIncoming.status === 'fulfilled') setVisitIncoming(nextVisitIncoming.value);
      if (nextVisitOutgoing.status === 'fulfilled') setVisitOutgoing(nextVisitOutgoing.value);
      if (nextVisitSessions.status === 'fulfilled') setVisitSessions(nextVisitSessions.value);
      if (mine.status === 'fulfilled') {
        const activeCompanion = mine.value.companions.find((companion) => companion.id === mine.value.activeNetworkCompanionId);
        const activePack = activeCompanion?.assetPacks.find((pack) => pack.id === activeCompanion.activeAssetPackId && pack.status === 'active');
        setCanSendVisit(Boolean(visitsAvailable && activeCompanion?.published && activeCompanion.visibility === 'friends_only' && activePack));
      }
      if (results.some((result) => result.status === 'rejected')) setError(t(lang, 'social_error_sync'));
      else setError('');
    } finally {
      if (scopeAtStart === scopeRef.current) setLoading(false);
    }
  }, [available, lang, visitsAvailable]);

  useEffect(() => {
    void window.ourCompanion.network.getStatus().then(setStatus);
    return window.ourCompanion.network.onStatusChanged(setStatus);
  }, []);
  useEffect(() => {
    scopeRef.current = scope;
    if (!scope || !status?.onlineModeEnabled || ['disabled', 'authentication_required', 'authentication_failed', 'incompatible_client'].includes(status.state)) clear();
  }, [clear, scope, status?.onlineModeEnabled, status?.state]);
  useEffect(() => {
    if (!available) return;
    const revision = status?.socialRevision;
    if (revision && revision !== lastRevisionRef.current) {
      lastRevisionRef.current = revision;
      const invalidation = status?.socialInvalidation;
      if (invalidation?.type === 'presence') {
        setFriends((current) => current.map((friend) => friend.userId === invalidation.userId ? { ...friend, presence: invalidation.status } : friend));
        return;
      }
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => { void refresh(); }, 200);
      return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
    }
    void refresh();
  }, [available, refresh, status?.socialRevision]);

  return { status, available, visitsAvailable, friends, incoming, outgoing, blocked, error, setError, loading, busyAction, setBusyAction, friendCompanion, setFriendCompanion, friendAssetStatus, setFriendAssetStatus, visitIncoming, visitOutgoing, visitSessions, canSendVisit, refresh };
}
