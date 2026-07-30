from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


# Shared contract for the one-call social overview.
replace_once(
    'packages/shared/src/index.ts',
    '''export interface BlockedUserSummary { userId: string; username: string; uid?: string; blockedAt: string; }
export interface PublicCompanionProfile {''',
    '''export interface BlockedUserSummary { userId: string; username: string; uid?: string; blockedAt: string; }
export interface SocialOverview {
  friends: FriendSummary[];
  incomingRequests: FriendRequestSummary[];
  outgoingRequests: FriendRequestSummary[];
  blockedUsers: BlockedUserSummary[];
  visitInvitations: { incoming: VisitInvitationSummary[]; outgoing: VisitInvitationSummary[] };
  visitSessions: VisitSessionSummary[];
  synchronizedAt: string;
}
export interface PublicCompanionProfile {''',
)
replace_once(
    'packages/shared/src/index.ts',
    '''      getAll(): Promise<FriendSummary[]>;
      getIncomingRequests(): Promise<FriendRequestSummary[]>;''',
    '''      getAll(): Promise<FriendSummary[]>;
      getOverview(): Promise<SocialOverview>;
      getIncomingRequests(): Promise<FriendRequestSummary[]>;''',
)

# Main-process Network client and IPC/preload wiring.
replace_once(
    'apps/desktop/electron/main/networkConnection.ts',
    '''import type { BlockedUserSummary, CompanionAssetManifest, CompleteAssetPackResult, DeveloperDebugUploadEvent, FriendLookupRelationship, FriendLookupResult, FriendPresence, FriendRequestSummary, FriendSummary, NetworkAssetPack, PublicCompanionProfile, VisitInvitationStatus, VisitInvitationSummary, VisitRuntimeConfig, VisitSessionSummary, VisitSessionState } from '@our-companion/shared';''',
    '''import type { BlockedUserSummary, CompanionAssetManifest, CompleteAssetPackResult, DeveloperDebugUploadEvent, FriendLookupRelationship, FriendLookupResult, FriendPresence, FriendRequestSummary, FriendSummary, NetworkAssetPack, PublicCompanionProfile, SocialOverview, VisitInvitationStatus, VisitInvitationSummary, VisitRuntimeConfig, VisitSessionSummary, VisitSessionState } from '@our-companion/shared';''',
)
replace_once(
    'apps/desktop/electron/main/networkConnection.ts',
    '''  getFriends = async (): Promise<FriendSummary[]> => this.smokeFriendLookupFixture ? [] : (await this.socialRequest<Array<{ id: string; username: string; uid: string; friendCode?: string; hasPublishedCompanion: boolean }>>('/api/friends')).map((friend) => ({ userId: friend.id, username: friend.username, uid: friend.uid, friendCode: friend.friendCode, presence: 'offline', hasPublishedCompanion: friend.hasPublishedCompanion }));
  getIncomingRequests''',
    '''  getFriends = async (): Promise<FriendSummary[]> => this.smokeFriendLookupFixture ? [] : (await this.socialRequest<Array<{ id: string; username: string; uid: string; friendCode?: string; hasPublishedCompanion: boolean }>>('/api/friends')).map((friend) => ({ userId: friend.id, username: friend.username, uid: friend.uid, friendCode: friend.friendCode, presence: 'offline', hasPublishedCompanion: friend.hasPublishedCompanion }));
  getSocialOverview = (): Promise<SocialOverview> => this.socialRequest<SocialOverview>('/api/friends/overview');
  getIncomingRequests''',
)
replace_once(
    'apps/desktop/electron/preload/index.ts',
    '''      getAll: () => invoke('network:friends:getAll'),
      getIncomingRequests: () => invoke('network:friends:getIncomingRequests'),''',
    '''      getAll: () => invoke('network:friends:getAll'),
      getOverview: () => invoke('network:friends:getOverview'),
      getIncomingRequests: () => invoke('network:friends:getIncomingRequests'),''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''    'network:friends:getAll': services.network.getFriends,
    'network:friends:getIncomingRequests': services.network.getIncomingRequests,''',
    '''    'network:friends:getAll': services.network.getFriends,
    'network:friends:getOverview': services.network.getSocialOverview,
    'network:friends:getIncomingRequests': services.network.getIncomingRequests,''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''    case 'network:friends:getAll': failure('friends'); return { handled: true, result: fixture.friends ?? [] };
    case 'network:friends:getIncomingRequests': failure('incomingRequests');''',
    '''    case 'network:friends:getAll': failure('friends'); return { handled: true, result: fixture.friends ?? [] };
    case 'network:friends:getOverview': return { handled: true, result: {
      friends: fixture.friends ?? [],
      incomingRequests: fixture.incomingRequests ?? [],
      outgoingRequests: fixture.outgoingRequests ?? [],
      blockedUsers: fixture.blockedUsers ?? [],
      visitInvitations: { incoming: fixture.incomingInvitations ?? [], outgoing: fixture.outgoingInvitations ?? [] },
      visitSessions: fixture.sessions ?? [],
      synchronizedAt: new Date().toISOString(),
    } };
    case 'network:friends:getIncomingRequests': failure('incomingRequests');''',
)

# Use POST /turns response directly instead of doing a second GET /social.
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    await this.network.appendVisitSocialTurn(sessionId, {
      clientTurnId: randomUUID(),
      intent: proposal.intent,
      message: proposal.message,
      emotion: proposal.emotion,
      topic: proposal.topic,
    });
    return this.getSocialState(sessionId);''',
    '''    const next = await this.network.appendVisitSocialTurn(sessionId, {
      clientTurnId: randomUUID(),
      intent: proposal.intent,
      message: proposal.message,
      emotion: proposal.emotion,
      topic: proposal.topic,
    }) as SocialVisitState;
    return {
      ...next,
      privateReflection: this.db?.getAppSetting<string>(`${REFLECTION_PREFIX}${sessionId}`),
    };''',
)

# Replace 1.5 second polling with event-driven refresh plus a low-frequency repair read.
replace_once(
    'apps/desktop/renderer/src/features/social/SocialVisitConversation.tsx',
    '''    void load();
    if (!live) return () => { cancelled = true; };
    const timer = window.setInterval(() => void load(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };''',
    '''    void load();
    if (!live) return () => { cancelled = true; };
    const unsubscribe = window.ourCompanion.network.onStatusChanged((status) => {
      const invalidation = status.socialInvalidation;
      if (invalidation?.type === 'visit_session' && invalidation.sessionId === session.id) {
        void load();
      }
    });
    // Socket events are authoritative. This slow reconciliation only repairs a
    // missed event after sleep, reconnect, or a renderer suspension.
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
    };''',
)

# Prefer the one-call overview while retaining a compatibility fallback for old servers and smoke fixtures.
path = Path('apps/desktop/renderer/src/features/social/useSocialViewModel.ts')
source = path.read_text(encoding='utf-8')
start = source.index('  const refresh = useCallback(async () => {')
end = source.index('\n  useEffect(() => {', start)
replacement = '''  const refresh = useCallback(async () => {
    if (!available || !scope) return;
    const scopeAtStart = scope;
    setLoading(true);
    try {
      const getOverview = window.ourCompanion.network.friends.getOverview;
      if (typeof getOverview === 'function') {
        const overview = await getOverview();
        if (scopeAtStart !== scopeRef.current) return;
        setFriends(overview.friends);
        setIncoming(overview.incomingRequests);
        setOutgoing(overview.outgoingRequests);
        setBlocked(overview.blockedUsers);
        setVisitIncoming(overview.visitInvitations.incoming);
        setVisitOutgoing(overview.visitInvitations.outgoing);
        setVisitSessions(overview.visitSessions);
        setDomainErrors({});
        setLoadedDomains({
          friends: true,
          presence: true,
          incomingRequests: true,
          outgoingRequests: true,
          blockedUsers: true,
          incomingVisitInvitations: true,
          outgoingVisitInvitations: true,
          visitSessions: true,
        });
        setDataScope(scopeAtStart);
        setHasLoaded(true);
        setLastSynchronizedAt(overview.synchronizedAt);
        return;
      }

      // Compatibility with a pre-overview server during rolling deployment.
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
      if (nextFriends.status === 'fulfilled') { loaded.friends = true; setFriends(nextFriends.value.map((friend) => ({ ...friend, presence: presenceByUser?.get(friend.userId) ?? friend.presence }))); }
      else errors.friends = 'social_partial_friends';
      if (presence.status === 'fulfilled') loaded.presence = true; else errors.presence = 'social_partial_presence';
      if (nextIncoming.status === 'fulfilled') { loaded.incomingRequests = true; setIncoming(nextIncoming.value); } else errors.incomingRequests = 'social_partial_incoming_requests';
      if (nextOutgoing.status === 'fulfilled') { loaded.outgoingRequests = true; setOutgoing(nextOutgoing.value); } else errors.outgoingRequests = 'social_partial_outgoing_requests';
      if (nextBlocked.status === 'fulfilled') { loaded.blockedUsers = true; setBlocked(nextBlocked.value); } else errors.blockedUsers = 'social_partial_blocked_users';
      if (nextVisitIncoming.status === 'fulfilled') { loaded.incomingVisitInvitations = true; setVisitIncoming(nextVisitIncoming.value); } else errors.incomingVisitInvitations = 'social_partial_visit_invitations';
      if (nextVisitOutgoing.status === 'fulfilled') { loaded.outgoingVisitInvitations = true; setVisitOutgoing(nextVisitOutgoing.value); } else errors.outgoingVisitInvitations = 'social_partial_visit_invitations';
      if (nextVisitSessions.status === 'fulfilled') { loaded.visitSessions = true; setVisitSessions(nextVisitSessions.value); } else errors.visitSessions = 'social_partial_visit_sessions';
      setDomainErrors(errors);
      setLoadedDomains((current) => ({ ...current, ...loaded }));
      setDataScope(scopeAtStart);
      setHasLoaded(true);
      setLastSynchronizedAt(new Date().toISOString());
    } catch {
      if (scopeAtStart !== scopeRef.current) return;
      setDomainErrors({
        friends: 'social_partial_friends',
        presence: 'social_partial_presence',
        incomingRequests: 'social_partial_incoming_requests',
        outgoingRequests: 'social_partial_outgoing_requests',
        blockedUsers: 'social_partial_blocked_users',
        incomingVisitInvitations: 'social_partial_visit_invitations',
        outgoingVisitInvitations: 'social_partial_visit_invitations',
        visitSessions: 'social_partial_visit_sessions',
      });
    } finally {
      if (scopeAtStart === scopeRef.current) setLoading(false);
    }
  }, [available, scope, visitsAvailable]);
'''
path.write_text(source[:start] + replacement + source[end:], encoding='utf-8')

# Contract-level test: the optimized endpoint and slow reconciliation remain explicit.
test = Path('apps/desktop/electron/main/socialNetworkPerformance.test.ts')
test.write_text('''import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const connection = readFileSync(new URL('./networkConnection.ts', import.meta.url), 'utf8');
const socialVisit = readFileSync(new URL('../../renderer/src/features/social/SocialVisitConversation.tsx', import.meta.url), 'utf8');

describe('Social Network performance contract', () => {
  it('uses one overview endpoint for the Social dashboard', () => {
    expect(connection).toContain("/api/friends/overview");
  });
  it('uses socket invalidation and a 30 second repair read instead of 1.5 second polling', () => {
    expect(socialVisit).toContain("invalidation?.type === 'visit_session'");
    expect(socialVisit).toContain('30_000');
    expect(socialVisit).not.toContain('1_500');
  });
});
''', encoding='utf-8')
