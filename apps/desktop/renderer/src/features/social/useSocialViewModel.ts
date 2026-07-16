import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BlockedUserSummary,
  FriendPresence,
  FriendRequestSummary,
  FriendSummary,
  NetworkStatus,
  VisitInvitationSummary,
  VisitSessionSummary,
} from '@our-companion/shared';
import type { TranslationKey } from '../../i18n';

export type SocialFriend = Omit<FriendSummary, 'presence'> & { presence?: FriendPresence };
export type SocialFriendCompanion = { id: string; ownerUserId: string; name: string; publicDescription?: string; publicTags: string[]; activeAssetPackId?: string };
export type SocialDomain = 'friends' | 'presence' | 'incomingRequests' | 'outgoingRequests' | 'blockedUsers' | 'incomingVisitInvitations' | 'outgoingVisitInvitations' | 'visitSessions';
export type SocialDomainErrors = Partial<Record<SocialDomain, TranslationKey>>;
export type SocialDomainLoaded = Partial<Record<SocialDomain, boolean>>;

const CONTENT_BLOCKING_STATES = new Set<NetworkStatus['state']>(['disabled', 'authentication_required', 'authentication_failed', 'incompatible_client']);

export function socialScopeKey(status?: NetworkStatus): string | undefined {
  return status?.account ? `${status.serverUrl}\u0000${status.account.id}` : undefined;
}

export function socialDataMatchesScope(status: NetworkStatus | undefined, dataScope: string | undefined): boolean {
  const currentScope = socialScopeKey(status);
  return Boolean(currentScope && currentScope === dataScope);
}

/** Owns independently refreshed, account-and-server-scoped Social domains. */
export function useSocialViewModel() {
  const [status, setStatus] = useState<NetworkStatus>();
  const [dataScope, setDataScope] = useState<string>();
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestSummary[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestSummary[]>([]);
  const [blocked, setBlocked] = useState<BlockedUserSummary[]>([]);
  const [actionError, setActionError] = useState<TranslationKey>();
  const [domainErrors, setDomainErrors] = useState<SocialDomainErrors>({});
  const [loadedDomains, setLoadedDomains] = useState<SocialDomainLoaded>({});
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState<string>();
  const [busyAction, setBusyAction] = useState(false);
  const [friendCompanion, setFriendCompanion] = useState<SocialFriendCompanion>();
  const [friendAssetStatus, setFriendAssetStatus] = useState('');
  const [visitIncoming, setVisitIncoming] = useState<VisitInvitationSummary[]>([]);
  const [visitOutgoing, setVisitOutgoing] = useState<VisitInvitationSummary[]>([]);
  const [visitSessions, setVisitSessions] = useState<VisitSessionSummary[]>([]);
  const scopeRef = useRef<string | undefined>(undefined);
  const lastRevisionRef = useRef<number | undefined>(undefined);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const available = Boolean(status?.onlineModeEnabled && status.state === 'online' && status.account);
  const visitsAvailable = Boolean(status?.features?.visitInvitations && status.features?.visitSessions);
  const scope = socialScopeKey(status);
  const scopeMatches = socialDataMatchesScope(status, dataScope);
  const canShowContent = Boolean(status?.account && scope && (available || scopeMatches) && !CONTENT_BLOCKING_STATES.has(status.state));

  const clear = useCallback(() => {
    setDataScope(undefined);
    setFriends([]);
    setIncoming([]);
    setOutgoing([]);
    setBlocked([]);
    setVisitIncoming([]);
    setVisitOutgoing([]);
    setVisitSessions([]);
    setFriendCompanion(undefined);
    setFriendAssetStatus('');
    setActionError(undefined);
    setBusyAction(false);
    setDomainErrors({});
    setLoadedDomains({});
    setHasLoaded(false);
    setLoading(false);
    setLastSynchronizedAt(undefined);
    lastRevisionRef.current = undefined;
  }, []);

  const refresh = useCallback(async () => {
    if (!available || !scope) return;
    const scopeAtStart = scope;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        window.ourCompanion.network.friends.getAll(),
        window.ourCompanion.network.friends.getIncomingRequests(),
        window.ourCompanion.network.friends.getOutgoingRequests(),
        window.ourCompanion.network.blocks.getAll(),
        window.ourCompanion.network.presence.getFriendPresence(),
        visitsAvailable ? window.ourCompanion.network.visits.invitations.list({ direction: 'incoming' }) : Promise.resolve([]),
        visitsAvailable ? window.ourCompanion.network.visits.invitations.list({ direction: 'outgoing' }) : Promise.resolve([]),
        visitsAvailable ? window.ourCompanion.network.visits.sessions.list() : Promise.resolve([]),
      ]);
      if (scopeAtStart !== scopeRef.current) return;
      const [nextFriends, nextIncoming, nextOutgoing, nextBlocked, presence, nextVisitIncoming, nextVisitOutgoing, nextVisitSessions] = results;
      const errors: SocialDomainErrors = {};
      const loaded: SocialDomainLoaded = {};
      const presenceByUser = presence.status === 'fulfilled' ? new Map(presence.value.map((item) => [item.userId, item.status])) : undefined;

      if (nextFriends.status === 'fulfilled') {
        loaded.friends = true;
        setFriends(nextFriends.value.map((friend) => ({ ...friend, presence: presenceByUser?.get(friend.userId) })));
      } else {
        errors.friends = 'social_partial_friends';
        if (presenceByUser) setFriends((current) => current.map((friend) => ({ ...friend, presence: presenceByUser.get(friend.userId) })));
      }
      if (presence.status === 'rejected') {
        errors.presence = 'social_partial_presence';
        setFriends((current) => current.map((friend) => ({ ...friend, presence: undefined })));
      } else loaded.presence = true;
      if (nextIncoming.status === 'fulfilled') { loaded.incomingRequests = true; setIncoming(nextIncoming.value); }
      else errors.incomingRequests = 'social_partial_incoming_requests';
      if (nextOutgoing.status === 'fulfilled') { loaded.outgoingRequests = true; setOutgoing(nextOutgoing.value); }
      else errors.outgoingRequests = 'social_partial_outgoing_requests';
      if (nextBlocked.status === 'fulfilled') { loaded.blockedUsers = true; setBlocked(nextBlocked.value); }
      else errors.blockedUsers = 'social_partial_blocked_users';
      if (nextVisitIncoming.status === 'fulfilled') { loaded.incomingVisitInvitations = true; setVisitIncoming(nextVisitIncoming.value); }
      else errors.incomingVisitInvitations = 'social_partial_visit_invitations';
      if (nextVisitOutgoing.status === 'fulfilled') { loaded.outgoingVisitInvitations = true; setVisitOutgoing(nextVisitOutgoing.value); }
      else errors.outgoingVisitInvitations = 'social_partial_visit_invitations';
      if (nextVisitSessions.status === 'fulfilled') { loaded.visitSessions = true; setVisitSessions(nextVisitSessions.value); }
      else errors.visitSessions = 'social_partial_visit_sessions';
      setDomainErrors(errors);
      setLoadedDomains((current) => ({ ...current, ...loaded }));
      setDataScope(scopeAtStart);
      setHasLoaded(true);
      setLastSynchronizedAt(new Date().toISOString());
    } finally {
      if (scopeAtStart === scopeRef.current) setLoading(false);
    }
  }, [available, scope, visitsAvailable]);

  useEffect(() => {
    let statusEventReceived = false;
    const unsubscribe = window.ourCompanion.network.onStatusChanged((next) => {
      statusEventReceived = true;
      setStatus(next);
    });
    void window.ourCompanion.network.getStatus().then((initial) => {
      if (!statusEventReceived) setStatus(initial);
    }).catch(() => {
      if (!statusEventReceived) setStatus({ state: 'offline', onlineModeEnabled: false, serverUrl: '' });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const changedScope = scopeRef.current !== scope;
    scopeRef.current = scope;
    if (changedScope && dataScope && dataScope !== scope) {
      clear();
    }
    if (!scope || !status?.onlineModeEnabled || CONTENT_BLOCKING_STATES.has(status.state)) clear();
  }, [clear, dataScope, scope, status?.onlineModeEnabled, status?.state]);

  useEffect(() => {
    if (!available) return;
    const revision = status?.socialRevision;
    if (revision && revision !== lastRevisionRef.current) {
      lastRevisionRef.current = revision;
      const invalidation = status?.socialInvalidation;
      if (invalidation?.type === 'presence' && dataScope === scope) {
        setFriends((current) => current.map((friend) => friend.userId === invalidation.userId ? { ...friend, presence: invalidation.status } : friend));
        return;
      }
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => { void refresh(); }, 200);
      return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
    }
    void refresh();
  }, [available, dataScope, refresh, scope, status?.socialRevision]);

  const scoped = scopeMatches;
  return {
    status,
    available,
    canShowContent,
    stale: Boolean(status && status.state !== 'online' && scoped),
    visitsAvailable,
    friends: scoped ? friends : [],
    incoming: scoped ? incoming : [],
    outgoing: scoped ? outgoing : [],
    blocked: scoped ? blocked : [],
    actionError,
    setActionError,
    domainErrors: scoped ? domainErrors : {},
    loadedDomains: scoped ? loadedDomains : {},
    loading,
    hasLoaded: scoped && hasLoaded,
    lastSynchronizedAt: scoped ? lastSynchronizedAt : undefined,
    busyAction,
    setBusyAction,
    friendCompanion: scoped ? friendCompanion : undefined,
    setFriendCompanion,
    friendAssetStatus: scoped ? friendAssetStatus : '',
    setFriendAssetStatus,
    visitIncoming: scoped ? visitIncoming : [],
    visitOutgoing: scoped ? visitOutgoing : [],
    visitSessions: scoped ? visitSessions : [],
    scopeKey: scope,
    mutationsAllowed: available,
    isScopeCurrent: (candidate: string | undefined) => Boolean(candidate && candidate === scopeRef.current),
    refresh,
  };
}
