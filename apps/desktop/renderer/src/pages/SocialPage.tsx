import { useState } from 'react';
import type { FriendLookupResult, NetworkStatus, VisitSessionSummary } from '@our-companion/shared';
import { PaperCard } from '../ui/NotebookPrimitives';
import { useVisualVisitState } from '../visits/RemoteVisitorLayer';
import { PublishedCompanionSection } from '../features/social/PublishedCompanionSection';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { EmptyState } from '../components/feedback/EmptyState';
import { t, type Lang } from '../i18n';
import { useLang } from '../ui/NotebookPrimitives';
import { useSocialViewModel } from '../features/social/useSocialViewModel';
import { canSendFriendRequest, friendLookupRelationshipMessage } from '../features/social/friendLookup';

export function SocialPage() {
  const lang = useLang();
  const visualVisit = useVisualVisitState();
  const { status, available, visitsAvailable, friends, incoming, outgoing, blocked, error, setError, loading, busyAction, setBusyAction, friendCompanion, setFriendCompanion, friendAssetStatus, setFriendAssetStatus, visitIncoming, visitOutgoing, visitSessions, canSendVisit, refresh } = useSocialViewModel(lang);
  const [friendCode, setFriendCode] = useState('');
  const [copiedFriendCode, setCopiedFriendCode] = useState(false);
  const [lookup, setLookup] = useState<FriendLookupResult>();
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<{ title: string; description: string; confirmLabel: string; operation: () => Promise<unknown> }>();

  if (!available || !status?.account) return <div data-testid="social-panel" className="social-page"><PaperCard title={t(lang, 'social_title')} tape className="settings-panel social-unavailable"><EmptyState title={t(lang, 'social_unavailable')}>{socialAvailabilityMessage(status, lang)}</EmptyState></PaperCard></div>;
  const account = status.account;
  const copyOwnFriendCode = async () => {
    try {
      await navigator.clipboard.writeText(account.friendCode);
      setCopiedFriendCode(true);
      window.setTimeout(() => setCopiedFriendCode(false), 1800);
    } catch {
      setError(t(lang, 'social_copy_failed'));
    }
  };
  const action = async (operation: () => Promise<unknown>, options: { clearLookup?: boolean } = {}) => { if (busyAction) return; setBusyAction(true); try { await operation(); await window.ourCompanion.network.presence.sendActivity(); if (options.clearLookup ?? true) setLookup(undefined); await refresh(); } catch (cause) { setError(messageForSocialError(cause, lang)); } finally { setBusyAction(false); } };
  const liveVisit = visitSessions.find((session) => ['preparing', 'ready', 'active', 'ending'].includes(session.state));
  const latestTerminalVisit = visitSessions.find((session) => ['ended', 'cancelled', 'failed'].includes(session.state));
  const userId = account.id;
  const currentUserReadyForVisit = liveVisit ? (liveVisit.visitorOwnerUserId === userId ? liveVisit.visitorOwnerReady : liveVisit.hostReady) : false;
  const friendsById = new Map(friends.map((friend) => [friend.userId, friend]));

  return <div data-testid="social-panel" className="social-page"><PaperCard title={t(lang, 'social_title')} tape className="settings-panel">
    <section className="social-overview" aria-label={t(lang, 'social_overview_label')}>
      <h3>{t(lang, 'social_overview')}</h3>
      <p><strong>{account.username} (@{account.username})</strong> <span className="soft-pill">{account.friendCode}</span></p>
      <div className="action-row"><button type="button" onClick={() => void copyOwnFriendCode()}>{copiedFriendCode ? t(lang, 'social_friend_code_copied') : t(lang, 'social_copy_friend_code')}</button><span>{t(lang, 'social_friend_count', { count: friends.length, plural: friends.length === 1 ? '' : 's' })} · {t(lang, 'social_pending_request_count', { count: incoming.length, plural: incoming.length === 1 ? '' : 's' })}</span></div>
    </section>
    <CurrentVisitSection lang={lang} liveVisit={liveVisit} latestTerminalVisit={latestTerminalVisit} userId={userId} currentUserReadyForVisit={currentUserReadyForVisit} visualVisit={visualVisit} busyAction={busyAction} action={action} />
    <section aria-labelledby="published-companion-heading"><h3 id="published-companion-heading">{t(lang, 'social_published_companion')}</h3><PublishedCompanionSection /></section>
    <div className="online-auth-form"><label><span>{t(lang, 'social_add_friend_by_code')}</span><input value={friendCode} onChange={(event) => setFriendCode(event.target.value.toUpperCase())} placeholder="ABC12345" /></label><button className="btn-secondary btn-sm" onClick={() => { setLookup(undefined); setError(''); void action(async () => { const result = await window.ourCompanion.network.friends.lookup(friendCode.trim()); setLookup(result); }, { clearLookup: false }); }} disabled={!friendCode.trim() || busyAction}>{t(lang, 'social_find')}</button></div>
    {lookup && <div data-testid="friend-lookup-result" className="online-user-info"><p><strong>{lookup.username}</strong> · {lookup.friendCode}</p>{canSendFriendRequest(lookup.relationship) && <button data-testid="send-friend-request" className="btn-primary btn-sm" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.sendRequest(lookup.id))}>{t(lang, 'social_send_request')}</button>}<p data-testid="friend-lookup-relationship" aria-live="polite">{friendLookupRelationshipMessage(lookup.relationship, lang)}</p></div>}
    {error && <p className="creation-error" role="alert">{error}</p>}
    {loading && <p aria-live="polite">{t(lang, 'social_loading')}</p>}
    <h3>{t(lang, 'social_friends')}</h3>{friends.length ? friends.map((friend) => <div data-testid="friend-row" className="online-user-info" key={friend.userId}><strong>{friend.username}</strong><span> · {friend.friendCode} · {presenceMessage(friend.presence, lang)}</span><div className="action-row"><button className="btn-ghost btn-sm" disabled={busyAction || !friend.hasPublishedCompanion} title={friend.hasPublishedCompanion ? undefined : t(lang, 'social_friend_unpublished_hint')} onClick={() => void action(async () => { setFriendCompanion(await window.ourCompanion.network.companions.getFriendCompanion(friend.userId)); setFriendAssetStatus(''); })}>{friend.hasPublishedCompanion ? t(lang, 'social_view_companion') : t(lang, 'social_no_published_companion')}</button><button data-testid="send-visit-invitation" className="btn-secondary btn-sm" disabled={busyAction || !canSendVisit || Boolean(liveVisit) || visitOutgoing.some((invite) => invite.status === 'pending' && invite.hostUserId === friend.userId)} title={!canSendVisit ? t(lang, 'social_publish_before_visit_hint') : liveVisit ? t(lang, 'social_finish_visit_hint') : undefined} onClick={() => void action(() => window.ourCompanion.network.visits.invitations.send(friend.userId))}>{t(lang, 'social_send_visit')}</button><details className="friend-overflow"><summary aria-label={t(lang, 'social_more_actions', { username: friend.username })}>{t(lang, 'social_more')}</summary><div className="friend-overflow-menu"><button className="btn-ghost btn-sm" disabled={busyAction} onClick={() => setPendingDestructiveAction({ title: t(lang, 'social_remove_friend_title'), description: t(lang, 'social_remove_friend_desc', { username: friend.username }), confirmLabel: t(lang, 'social_remove_friend'), operation: () => window.ourCompanion.network.friends.remove(friend.userId) })}>{t(lang, 'social_remove_friend')}</button><button className="btn-danger btn-sm" disabled={busyAction} onClick={() => setPendingDestructiveAction({ title: t(lang, 'social_block_user_title'), description: t(lang, 'social_block_user_desc', { username: friend.username }), confirmLabel: t(lang, 'social_block_user'), operation: () => window.ourCompanion.network.blocks.block(friend.userId) })}>{t(lang, 'social_block_user')}</button></div></details></div></div>) : <p>{t(lang, 'social_no_friends')}</p>}
    {friendCompanion && <div className="online-user-info"><h3>{friendCompanion.name}</h3>{friendCompanion.publicDescription && <p>{friendCompanion.publicDescription}</p>}<p>{friendCompanion.publicTags.join(' · ')}</p>{friendCompanion.activeAssetPackId ? <button className="btn-secondary btn-sm" disabled={busyAction} onClick={() => void action(async () => { await window.ourCompanion.network.assets.downloadPack({ assetPackId: friendCompanion.activeAssetPackId!, networkCompanionId: friendCompanion.id }); setFriendAssetStatus(t(lang, 'social_pack_downloaded')); })}>{t(lang, 'social_download_pack')}</button> : <p>{t(lang, 'social_no_active_pack')}</p>}{friendAssetStatus && <p aria-live="polite">{friendAssetStatus}</p>}</div>}
    <h3>{t(lang, 'social_visit_invitations')}</h3>
    {!visitsAvailable ? <p>{t(lang, 'social_visit_unavailable')}</p> : <>{visitIncoming.filter((invite) => invite.status === 'pending').length ? visitIncoming.filter((invite) => invite.status === 'pending').map((invite) => { const username = friendsById.get(invite.visitorOwnerUserId)?.username ?? t(lang, 'social_friend_fallback'); return <div data-testid="incoming-visit-invitation" className="online-user-info" key={invite.id}><strong>{t(lang, 'social_friend_would_like_visit', { username })}</strong><p>{invite.companionName}</p>{invite.companionDescription && <p>{invite.companionDescription}</p>}<p>{invite.companionTags.join(' · ') || t(lang, 'social_no_public_tags')} · {t(lang, 'social_expires', { time: new Date(invite.expiresAt).toLocaleString() })}</p><div className="action-row"><button data-testid="accept-visit-invitation" disabled={busyAction || Boolean(liveVisit)} onClick={() => void action(() => window.ourCompanion.network.visits.invitations.accept(invite.id))}>{t(lang, 'social_accept')}</button><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.invitations.decline(invite.id))}>{t(lang, 'social_decline')}</button></div></div>; }) : <p>{t(lang, 'social_no_incoming_visit')}</p>}
    {visitOutgoing.filter((invite) => invite.status === 'pending').length ? <><h3>{t(lang, 'social_outgoing_visit_invitations')}</h3>{visitOutgoing.filter((invite) => invite.status === 'pending').map((invite) => <div className="action-row" key={invite.id}><span>{friendsById.get(invite.hostUserId)?.username ?? t(lang, 'social_friend_fallback')} · {invite.companionName} · {t(lang, 'social_pending')}</span><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.invitations.cancel(invite.id))}>{t(lang, 'social_cancel')}</button></div>)}</> : null}</>}
    <h3>{t(lang, 'social_incoming_requests')}</h3>{incoming.length ? incoming.map((request) => <div className="action-row" key={request.id}><span>{request.username}</span><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.acceptRequest(request.id))}>{t(lang, 'social_accept')}</button><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.rejectRequest(request.id))}>{t(lang, 'social_reject')}</button></div>) : <p>{t(lang, 'social_no_incoming_requests')}</p>}
    <h3>{t(lang, 'social_outgoing_requests')}</h3>{outgoing.length ? outgoing.map((request) => <div className="action-row" key={request.id}><span>{request.username} · {t(lang, 'social_pending')}</span><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.cancelRequest(request.id))}>{t(lang, 'social_cancel')}</button></div>) : <p>{t(lang, 'social_no_outgoing_requests')}</p>}
    <h3>{t(lang, 'social_blocked_users')}</h3>{blocked.length ? blocked.map((user) => <div className="action-row" key={user.userId}><span>{user.username}</span><button disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.blocks.unblock(user.userId))}>{t(lang, 'social_unblock')}</button></div>) : <p>{t(lang, 'social_no_blocked_users')}</p>}
    <ConfirmDialog open={Boolean(pendingDestructiveAction)} title={pendingDestructiveAction?.title ?? ''} description={pendingDestructiveAction?.description ?? ''} confirmLabel={pendingDestructiveAction?.confirmLabel} busy={busyAction} danger onClose={() => setPendingDestructiveAction(undefined)} onConfirm={() => { const operation = pendingDestructiveAction?.operation; setPendingDestructiveAction(undefined); if (operation) void action(operation); }} />
  </PaperCard></div>;
}

function CurrentVisitSection({
  lang, liveVisit, latestTerminalVisit, userId, currentUserReadyForVisit, visualVisit, busyAction, action,
}: {
  lang: Lang;
  liveVisit?: VisitSessionSummary;
  latestTerminalVisit?: VisitSessionSummary;
  userId: string;
  currentUserReadyForVisit: boolean;
  visualVisit: ReturnType<typeof useVisualVisitState>;
  busyAction: boolean;
  action: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  return <section aria-labelledby="current-visit-heading">
    <h3 id="current-visit-heading">{t(lang, 'social_visit_session')}</h3>
    {liveVisit ? <div data-testid="visit-session-state" data-state={liveVisit.state} className="online-user-info">
      <strong>{visitSessionMessage(liveVisit, userId, lang)}</strong>
      {liveVisit.state === 'active' && <p>{visualVisitMessage(visualVisit, liveVisit, userId, lang)}</p>}
      <div className="action-row">
        {liveVisit.state === 'preparing' && (currentUserReadyForVisit
          ? <span>{t(lang, 'social_prepared')}</span>
          : <button data-testid="prepare-visit" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.prepare(liveVisit.id))}>{busyAction ? t(lang, 'social_preparing') : t(lang, 'social_prepare')}</button>)}
        {liveVisit.state === 'ready' && liveVisit.hostUserId === userId && <button data-testid="start-visit" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.start(liveVisit.id))}>{t(lang, 'social_start_visit')}</button>}
        <button data-testid="end-visit" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.end(liveVisit.id))}>{liveVisit.state === 'preparing' || liveVisit.state === 'ready' ? t(lang, 'social_cancel_visit') : t(lang, 'social_end_visit')}</button>
      </div>
    </div> : latestTerminalVisit ? <div data-testid="visit-session-state" data-state={latestTerminalVisit.state} className="online-user-info"><strong>{visitSessionMessage(latestTerminalVisit, userId, lang)}</strong>{latestTerminalVisit.endReason && <p>{t(lang, 'social_reason_unavailable')}</p>}</div> : <p data-testid="visit-session-state">{t(lang, 'social_no_current_visit')}</p>}
  </section>;
}

function socialAvailabilityMessage(status: NetworkStatus | undefined, lang: Lang): string {
  if (!status?.onlineModeEnabled || status.state === 'disabled') return t(lang, 'social_availability_disabled');
  if (status.state === 'authentication_required' || status.state === 'authentication_failed') return t(lang, 'social_availability_auth');
  if (status.state === 'reconnecting' || status.state === 'connecting' || status.state === 'checking_server') return t(lang, 'social_availability_reconnecting');
  if (status.state === 'server_unavailable') return t(lang, 'social_availability_server');
  if (status.state === 'incompatible_client') return t(lang, 'social_availability_incompatible');
  return t(lang, 'social_availability_loading');
}

function presenceMessage(presence: string, lang: Lang): string {
  const key = ({ online: 'social_presence_online', idle: 'social_presence_idle', offline: 'social_presence_offline' } as const)[presence as 'online' | 'idle' | 'offline'] ?? 'social_presence_offline';
  return t(lang, key);
}

function visitSessionMessage(session: VisitSessionSummary, userId: string, lang: Lang): string {
  if (session.state === 'preparing') {
    const mineReady = session.visitorOwnerUserId === userId ? session.visitorOwnerReady : session.hostReady;
    return mineReady ? t(lang, 'social_visit_waiting_prepare') : t(lang, 'social_visit_preparing_assets');
  }
  if (session.state === 'ready') return session.hostUserId === userId ? t(lang, 'social_visit_ready_host') : t(lang, 'social_visit_ready_waiting');
  if (session.state === 'active') return t(lang, 'social_visit_active');
  return t(lang, 'social_visit_terminal', { state: session.state });
}

function visualVisitMessage(visual: import('@our-companion/shared').VisualVisitRendererState, session: VisitSessionSummary, userId: string, lang: Lang): string {
  if (visual.error === 'VISUAL_VISIT_ASSET_UNAVAILABLE' || visual.error === 'VISUAL_VISIT_RENDERER_UNAVAILABLE') return t(lang, 'social_visitor_unavailable');
  if (visual.error === 'VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE') return t(lang, 'social_owner_mapping_unavailable');
  if (session.visitorOwnerUserId === userId && visual.ownerPresenceMode === 'away_visiting') return t(lang, 'social_owner_visiting');
  if (visual.visitor?.sessionId === session.id) return t(lang, 'social_visitor_visiting', { name: visual.visitor.name });
  return t(lang, 'social_preparing_visitor_assets');
}

function messageForSocialError(cause: unknown, lang: Lang = 'en'): string {
  const code = cause instanceof Error ? cause.message : 'SOCIAL_ACTION_NOT_ALLOWED';
  const key = ({ INVALID_FRIEND_CODE: 'social_error_invalid_code', FRIEND_REQUEST_ALREADY_EXISTS: 'social_error_request_exists', FRIENDSHIP_ALREADY_EXISTS: 'social_error_friendship_exists', CANNOT_FRIEND_SELF: 'social_error_self', SOCIAL_ACTION_NOT_ALLOWED: 'social_error_action_unavailable', SOCIAL_DATA_OUT_OF_SYNC: 'social_error_sync', COMPANION_NOT_AVAILABLE: 'social_error_companion_unavailable', ASSET_STORAGE_UNAVAILABLE: 'social_error_storage_unavailable', RATE_LIMITED: 'social_error_rate_limited' } as const)[code] ?? 'social_error_sync';
  return t(lang, key);
}
