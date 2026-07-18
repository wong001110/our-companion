import { useCallback, useEffect, useState } from 'react';
import type { FriendLookupResult, NetworkStatus, VisitInvitationSummary, VisitSessionSummary } from '@our-companion/shared';
import { PaperCard } from '../ui/NotebookPrimitives';
import { useVisualVisitState } from '../visits/RemoteVisitorLayer';
import { PublishedCompanionSection } from '../features/social/PublishedCompanionSection';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { EmptyState } from '../components/feedback/EmptyState';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { LoadingState } from '../components/feedback/LoadingState';
import { ConnectionBanner, SectionLoading, SectionPartialError } from '../components/feedback/OperationalState';
import { networkStatePresentation, SOCIAL_MUTATION_PRESENTATION, visitEndReasonPresentation, visitFailurePresentation, VISIT_SESSION_PRESENTATION, type SocialMutationPhase } from '../features/operational/operationalState';
import { t, type Lang, type TranslationKey } from '../i18n';
import { useLang } from '../ui/NotebookPrimitives';
import { useSocialViewModel } from '../features/social/useSocialViewModel';
import { canSendFriendRequest, friendLookupRelationshipMessage } from '../features/social/friendLookup';
import { BlockedUserRow, FriendRequestRow, FriendRow, VisitInvitationRow } from '../features/social/SocialRows';

export function SocialPage() {
  const lang = useLang();
  const visualVisit = useVisualVisitState();
  const { status, available, canShowContent, stale, visitsAvailable, friends, incoming, outgoing, blocked, actionError, setActionError, domainErrors, loadedDomains, loading, hasLoaded, busyAction: actionBusy, setBusyAction, friendCompanion, setFriendCompanion, friendAssetStatus, setFriendAssetStatus, visitIncoming, visitOutgoing, visitSessions, scopeKey, isScopeCurrent, refresh } = useSocialViewModel();
  const [friendCode, setFriendCode] = useState('');
  const [copiedFriendCode, setCopiedFriendCode] = useState(false);
  const [lookup, setLookup] = useState<FriendLookupResult>();
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<{ title: string; description: string; confirmLabel: string; phase: SocialMutationPhase; operation: () => Promise<unknown> }>();
  const [mutationPhase, setMutationPhase] = useState<SocialMutationPhase>();
  const [publicationAvailability, setPublicationAvailability] = useState({ loaded: false, canSendVisit: false });
  const handlePublicationAvailability = useCallback((next: { loaded: boolean; canSendVisit: boolean }) => {
    setPublicationAvailability((current) => current.loaded === next.loaded && current.canSendVisit === next.canSendVisit ? current : next);
  }, []);

  useEffect(() => {
    setFriendCode('');
    setCopiedFriendCode(false);
    setLookup(undefined);
    setPendingDestructiveAction(undefined);
    setMutationPhase(undefined);
    setPublicationAvailability({ loaded: false, canSendVisit: false });
  }, [scopeKey]);

  if (!status) return <div data-testid="social-panel" className="social-page"><PaperCard title={t(lang, 'social_title')} tape className="settings-panel social-unavailable"><SectionLoading label={t(lang, 'social_availability_loading')} /></PaperCard></div>;
  if (!canShowContent || !status.account) return <div data-testid="social-panel" className="social-page"><PaperCard title={t(lang, 'social_title')} tape className="settings-panel social-unavailable"><ConnectionBanner status={status} onRetry={() => void window.ourCompanion.network.retryConnection()} /><EmptyState title={t(lang, 'social_unavailable')}>{socialAvailabilityMessage(status, lang)}</EmptyState></PaperCard></div>;
  const account = status.account;
  const mutationsDisabled = actionBusy || !available;
  const busyAction = mutationsDisabled;
  const copyOwnFriendCode = async () => {
    try {
      await navigator.clipboard.writeText(account.friendCode);
      setCopiedFriendCode(true);
      window.setTimeout(() => setCopiedFriendCode(false), 1800);
    } catch {
      setActionError('social_copy_failed');
    }
  };
  const action = async <T,>(operation: () => Promise<T>, options: { clearLookup?: boolean; onSuccess?: (value: T) => void; phase?: SocialMutationPhase } = {}) => {
    if (mutationsDisabled) return;
    const operationScope = scopeKey;
    setBusyAction(true);
    setMutationPhase(options.phase ?? 'sending');
    setActionError(undefined);
    try {
      const value = await operation();
      if (!isScopeCurrent(operationScope)) return;
      options.onSuccess?.(value);
      await window.ourCompanion.network.presence.sendActivity();
      if (!isScopeCurrent(operationScope)) return;
      if (options.clearLookup ?? true) setLookup(undefined);
      await refresh();
    } catch (cause) {
      if (isScopeCurrent(operationScope)) setActionError(messageKeyForSocialError(cause));
    } finally {
      if (isScopeCurrent(operationScope)) setBusyAction(false);
      if (isScopeCurrent(operationScope)) setMutationPhase(undefined);
    }
  };
  const liveVisit = visitSessions.find((session) => ['preparing', 'ready', 'active', 'ending'].includes(session.state));
  const latestTerminalVisit = visitSessions.find((session) => ['ended', 'cancelled', 'failed'].includes(session.state));
  const userId = account.id;
  const currentUserReadyForVisit = liveVisit ? (liveVisit.visitorOwnerUserId === userId ? liveVisit.visitorOwnerReady : liveVisit.hostReady) : false;
  const friendsById = new Map(friends.map((friend) => [friend.userId, friend]));
  const visibleIncomingVisits = visibleInvitations(visitIncoming);
  const visibleOutgoingVisits = visibleInvitations(visitOutgoing);
  const mutationReason = mutationPhase ? t(lang, SOCIAL_MUTATION_PRESENTATION[mutationPhase].labelKey) : undefined;

  return <div data-testid="social-panel" className="social-page"><PaperCard title={t(lang, 'social_title')} tape className="settings-panel">
    <ConnectionBanner status={status} stale={stale} onRetry={() => void window.ourCompanion.network.retryConnection()} />
    <section className="social-overview" aria-label={t(lang, 'social_overview_label')}>
      <h3>{t(lang, 'social_overview')}</h3>
      <p><strong>{account.username} (@{account.username})</strong> <span className="soft-pill">{account.friendCode}</span></p>
      <div className="action-row"><button type="button" onClick={() => void copyOwnFriendCode()}>{copiedFriendCode ? t(lang, 'social_friend_code_copied') : t(lang, 'social_copy_friend_code')}</button><span>{t(lang, 'social_friend_count', { count: friends.length, plural: friends.length === 1 ? '' : 's' })} · {t(lang, 'social_pending_request_count', { count: incoming.length, plural: incoming.length === 1 ? '' : 's' })}</span></div>
    </section>
    {loadedDomains.visitSessions && <CurrentVisitSection lang={lang} stale={stale} liveVisit={liveVisit} latestTerminalVisit={latestTerminalVisit} userId={userId} currentUserReadyForVisit={currentUserReadyForVisit} visualVisit={visualVisit} busyAction={busyAction} action={action} />}
    <section aria-labelledby="published-companion-heading"><h3 id="published-companion-heading">{t(lang, 'social_published_companion')}</h3><PublishedCompanionSection onVisitAvailabilityChange={handlePublicationAvailability} /></section>
    <div className="online-auth-form"><label><span>{t(lang, 'social_add_friend_by_code')}</span><input value={friendCode} onChange={(event) => setFriendCode(event.target.value.toUpperCase())} placeholder="ABC12345" /></label><button className="btn-secondary btn-sm" onClick={() => { setLookup(undefined); setActionError(undefined); void action(() => window.ourCompanion.network.friends.lookup(friendCode.trim()), { clearLookup: false, phase: 'sending', onSuccess: setLookup }); }} disabled={!friendCode.trim() || busyAction}>{t(lang, 'social_find')}</button></div>
    {lookup && <div data-testid="friend-lookup-result" className="online-user-info"><p><strong>{lookup.username}</strong> · {lookup.friendCode}</p>{canSendFriendRequest(lookup.relationship) && <button data-testid="send-friend-request" className="btn-primary btn-sm" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.sendRequest(lookup.id), { phase: 'sending' })}>{t(lang, 'social_send_request')}</button>}<p data-testid="friend-lookup-relationship" aria-live="polite">{friendLookupRelationshipMessage(lookup.relationship, lang)}</p></div>}
    {actionError && <InlineNotice tone="error">{t(lang, actionError)}</InlineNotice>}
    {mutationReason && <LoadingState label={mutationReason} />}
    {!hasLoaded && loading && <SectionLoading label={t(lang, 'social_loading')} />}
    <h3>{t(lang, 'social_friends')}</h3>{domainErrors.friends && <SectionPartialError message={t(lang, domainErrors.friends)} onRetry={() => void refresh()} />}{domainErrors.presence && <SectionPartialError message={t(lang, domainErrors.presence)} onRetry={() => void refresh()} />}{loadedDomains.friends && (friends.length ? friends.map((friend) => {
      const pendingVisit = visitOutgoing.some((invite) => invite.status === 'pending' && invite.hostUserId === friend.userId);
      const visitDisabledReason = mutationReason ?? (!available ? t(lang, 'online_state_detail_reconnecting') : !visitsAvailable ? t(lang, 'social_visit_unavailable') : !publicationAvailability.loaded ? t(lang, 'social_partial_publishing') : !publicationAvailability.canSendVisit ? t(lang, 'social_publish_before_visit_hint') : liveVisit ? t(lang, 'social_finish_visit_hint') : pendingVisit ? t(lang, 'social_pending') : undefined);
      return <FriendRow key={friend.userId} lang={lang} friend={friend} disabled={busyAction} visitDisabledReason={visitDisabledReason}
        onView={() => void action(() => window.ourCompanion.network.companions.getFriendCompanion(friend.userId), { phase: 'sending', onSuccess: (companion) => { setFriendCompanion(companion); setFriendAssetStatus(''); } })}
        onVisit={() => void action(() => window.ourCompanion.network.visits.invitations.send(friend.userId), { phase: 'sending' })}
        onRemove={() => setPendingDestructiveAction({ title: t(lang, 'social_remove_friend_title'), description: t(lang, 'social_remove_friend_desc', { username: friend.username }), confirmLabel: t(lang, 'social_remove_friend'), phase: 'removing', operation: () => window.ourCompanion.network.friends.remove(friend.userId) })}
        onBlock={() => setPendingDestructiveAction({ title: t(lang, 'social_block_user_title'), description: t(lang, 'social_block_user_desc', { username: friend.username }), confirmLabel: t(lang, 'social_block_user'), phase: 'blocking', operation: () => window.ourCompanion.network.blocks.block(friend.userId) })}
      />;
    }) : <p>{t(lang, 'social_no_friends')}</p>)}
    {friendCompanion && <div className="online-user-info"><h3>{friendCompanion.name}</h3>{friendCompanion.publicDescription && <p>{friendCompanion.publicDescription}</p>}<p>{friendCompanion.publicTags.join(' · ')}</p>{friendCompanion.activeAssetPackId ? <button className="btn-secondary btn-sm" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.assets.downloadPack({ assetPackId: friendCompanion.activeAssetPackId!, networkCompanionId: friendCompanion.id }), { phase: 'preparing', onSuccess: () => setFriendAssetStatus(t(lang, 'social_pack_downloaded')) })}>{t(lang, 'social_download_pack')}</button> : <p>{t(lang, 'social_no_active_pack')}</p>}{friendAssetStatus && <p aria-live="polite">{friendAssetStatus}</p>}</div>}
    <h3>{t(lang, 'social_visit_invitations')}</h3>{domainErrors.incomingVisitInvitations && <SectionPartialError message={t(lang, domainErrors.incomingVisitInvitations)} onRetry={() => void refresh()} />}{domainErrors.outgoingVisitInvitations && <SectionPartialError message={t(lang, domainErrors.outgoingVisitInvitations)} onRetry={() => void refresh()} />}{domainErrors.visitSessions && <SectionPartialError message={t(lang, domainErrors.visitSessions)} onRetry={() => void refresh()} />}
    {!visitsAvailable ? <p>{t(lang, 'social_visit_unavailable')}</p> : <>
      {loadedDomains.incomingVisitInvitations && (visibleIncomingVisits.length ? visibleIncomingVisits.map((invite) => <VisitInvitationRow key={invite.id} lang={lang} invitation={invite} direction="incoming" username={friendsById.get(invite.visitorOwnerUserId)?.username ?? t(lang, 'social_friend_fallback')} disabled={busyAction} disabledReason={mutationReason} liveVisit={Boolean(liveVisit)} onAccept={() => void action(() => window.ourCompanion.network.visits.invitations.accept(invite.id), { phase: 'accepting' })} onDecline={() => void action(() => window.ourCompanion.network.visits.invitations.decline(invite.id), { phase: 'rejecting' })} />) : <p>{t(lang, 'social_no_incoming_visit')}</p>)}
      <h3>{t(lang, 'social_outgoing_visit_invitations')}</h3>
      {loadedDomains.outgoingVisitInvitations && (visibleOutgoingVisits.length ? visibleOutgoingVisits.map((invite) => <VisitInvitationRow key={invite.id} lang={lang} invitation={invite} direction="outgoing" username={friendsById.get(invite.hostUserId)?.username ?? t(lang, 'social_friend_fallback')} disabled={busyAction} disabledReason={mutationReason} liveVisit={Boolean(liveVisit)} onCancel={() => void action(() => window.ourCompanion.network.visits.invitations.cancel(invite.id), { phase: 'cancelling' })} />) : <p>{t(lang, 'social_no_outgoing_visit')}</p>)}
    </>}
    <h3>{t(lang, 'social_incoming_requests')}</h3>{domainErrors.incomingRequests && <SectionPartialError message={t(lang, domainErrors.incomingRequests)} onRetry={() => void refresh()} />}{loadedDomains.incomingRequests && (incoming.length ? incoming.map((request) => <FriendRequestRow key={request.id} lang={lang} request={request} disabled={busyAction} disabledReason={mutationReason} onAccept={() => void action(() => window.ourCompanion.network.friends.acceptRequest(request.id), { phase: 'accepting' })} onReject={() => void action(() => window.ourCompanion.network.friends.rejectRequest(request.id), { phase: 'rejecting' })} />) : <p>{t(lang, 'social_no_incoming_requests')}</p>)}
    <h3>{t(lang, 'social_outgoing_requests')}</h3>{domainErrors.outgoingRequests && <SectionPartialError message={t(lang, domainErrors.outgoingRequests)} onRetry={() => void refresh()} />}{loadedDomains.outgoingRequests && (outgoing.length ? outgoing.map((request) => <FriendRequestRow key={request.id} lang={lang} request={request} disabled={busyAction} disabledReason={mutationReason} onCancel={() => void action(() => window.ourCompanion.network.friends.cancelRequest(request.id), { phase: 'cancelling' })} />) : <p>{t(lang, 'social_no_outgoing_requests')}</p>)}
    <h3>{t(lang, 'social_blocked_users')}</h3>{domainErrors.blockedUsers && <SectionPartialError message={t(lang, domainErrors.blockedUsers)} onRetry={() => void refresh()} />}{loadedDomains.blockedUsers && (blocked.length ? blocked.map((user) => <BlockedUserRow key={user.userId} lang={lang} user={user} disabled={busyAction} disabledReason={mutationReason} onUnblock={() => void action(() => window.ourCompanion.network.blocks.unblock(user.userId), { phase: 'unblocking' })} />) : <p>{t(lang, 'social_no_blocked_users')}</p>)}
    <ConfirmDialog open={Boolean(pendingDestructiveAction)} title={pendingDestructiveAction?.title ?? ''} description={pendingDestructiveAction?.description ?? ''} confirmLabel={pendingDestructiveAction?.confirmLabel} busy={actionBusy} danger onClose={() => setPendingDestructiveAction(undefined)} onConfirm={() => { const pending = pendingDestructiveAction; if (pending) void action(pending.operation, { phase: pending.phase }).then(() => setPendingDestructiveAction(undefined)); }} />
  </PaperCard></div>;
}

function CurrentVisitSection({
  lang, stale, liveVisit, latestTerminalVisit, userId, currentUserReadyForVisit, visualVisit, busyAction, action,
}: {
  lang: Lang;
  stale: boolean;
  liveVisit?: VisitSessionSummary;
  latestTerminalVisit?: VisitSessionSummary;
  userId: string;
  currentUserReadyForVisit: boolean;
  visualVisit: ReturnType<typeof useVisualVisitState>;
  busyAction: boolean;
  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
}) {
  const session = liveVisit ?? latestTerminalVisit;
  const presentation = session ? VISIT_SESSION_PRESENTATION[session.state] : undefined;
  return <section aria-labelledby="current-visit-heading">
    <h3 id="current-visit-heading">{t(lang, 'social_visit_session')}</h3>
    {session ? <div data-testid="visit-session-state" data-state={session.state} className="operational-row">
      <div className="operational-row-main"><strong>{stale && liveVisit ? t(lang, 'social_visit_reconnecting') : visitSessionMessage(session, userId, lang)}</strong>{presentation && <span className={`status-badge status-badge-${presentation.tone}`}><span className="status-badge-marker" aria-hidden="true" />{t(lang, presentation.labelKey)}</span>}</div>
      {session.state === 'preparing' && <p>{t(lang, 'social_visit_readiness', { owner: session.visitorOwnerReady ? t(lang, 'social_ready') : t(lang, 'social_not_ready'), host: session.hostReady ? t(lang, 'social_ready') : t(lang, 'social_not_ready') })}</p>}
      {!stale && session.state === 'active' && <p>{visualVisitMessage(visualVisit, session, userId, lang)}</p>}
      {stale && liveVisit && <p className="state-reason">{t(lang, 'operational_content_stale')}</p>}
      {!liveVisit && <p>{t(lang, session.endReason ? visitEndReasonPresentation(session.endReason) : visitFailurePresentation(session.failureCode))}</p>}
      {liveVisit && session.state !== 'ending' && <div className="operational-row-actions">
        {session.state === 'preparing' && !currentUserReadyForVisit && <button data-testid="prepare-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.prepare(session.id), { phase: 'preparing' })}>{busyAction ? t(lang, 'social_preparing') : t(lang, 'social_prepare')}</button>}
        {session.state === 'ready' && session.hostUserId === userId && <button data-testid="start-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.start(session.id), { phase: 'starting' })}>{t(lang, 'social_start_visit')}</button>}
        <button data-testid="end-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.end(session.id), { phase: 'ending' })}>{session.state === 'preparing' || session.state === 'ready' ? t(lang, 'social_cancel_visit') : t(lang, 'social_end_visit')}</button>
      </div>}
    </div> : <p data-testid="visit-session-state">{t(lang, 'social_no_current_visit')}</p>}
  </section>;
}

function socialAvailabilityMessage(status: NetworkStatus | undefined, lang: Lang): string {
  if (!status) return t(lang, 'social_availability_loading');
  const detailKey = networkStatePresentation(status.state).detailKey;
  return detailKey ? t(lang, detailKey) : t(lang, 'social_availability_loading');
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
  const error = visual.errors?.[session.id];
  if (error === 'VISUAL_VISIT_ASSET_UNAVAILABLE' || error === 'VISUAL_VISIT_RENDERER_UNAVAILABLE') return t(lang, 'social_visitor_unavailable');
  if (error === 'VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE') return t(lang, 'social_owner_mapping_unavailable');
  if (session.visitorOwnerUserId === userId && visual.ownerPresenceMode === 'away_visiting') return t(lang, 'social_owner_visiting');
  const visitor = visual.visitors[session.id];
  if (visitor) return t(lang, 'social_visitor_visiting', { name: visitor.name });
  return t(lang, 'social_preparing_visitor_assets');
}

function messageKeyForSocialError(cause: unknown): TranslationKey {
  const code = cause instanceof Error ? cause.message : 'SOCIAL_ACTION_NOT_ALLOWED';
  return ({ INVALID_FRIEND_CODE: 'social_error_invalid_code', FRIEND_REQUEST_ALREADY_EXISTS: 'social_error_request_exists', FRIENDSHIP_ALREADY_EXISTS: 'social_error_friendship_exists', CANNOT_FRIEND_SELF: 'social_error_self', SOCIAL_ACTION_NOT_ALLOWED: 'social_error_action_unavailable', SOCIAL_DATA_OUT_OF_SYNC: 'social_error_sync', COMPANION_NOT_AVAILABLE: 'social_error_companion_unavailable', ASSET_STORAGE_UNAVAILABLE: 'social_error_storage_unavailable', VISIT_VISUAL_ASSETS_UNAVAILABLE: 'visit_failure_visual_assets', VISUAL_VISIT_ASSET_UNAVAILABLE: 'visit_failure_visual_assets', RATE_LIMITED: 'social_error_rate_limited' } as const)[code] ?? 'social_error_sync';
}

function visibleInvitations(invitations: VisitInvitationSummary[]): VisitInvitationSummary[] {
  const pending = invitations.filter((invitation) => invitation.status === 'pending');
  const latestTerminal = invitations
    .filter((invitation) => invitation.status !== 'pending')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  return latestTerminal ? [...pending, latestTerminal] : pending;
}
