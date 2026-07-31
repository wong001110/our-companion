import { useCallback, useEffect, useRef, useState } from 'react';
import type { FriendLookupResult, JoinableVisitRoom, NetworkStatus, ShareableTopicSummary, VisitInvitationSummary, VisitReservationSummary, VisitRoomState, VisitSessionSummary } from '@our-companion/shared';
import { PaperCard } from '../ui/NotebookPrimitives';
import { useVisualVisitState } from '../visits/RemoteVisitorLayer';
import { PublishedCompanionSection } from '../features/social/PublishedCompanionSection';
import { SocialVisitConversation } from '../features/social/SocialVisitConversation';
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
  const [uid, setUid] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);
  const [lookup, setLookup] = useState<FriendLookupResult>();
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<{ title: string; description: string; confirmLabel: string; phase: SocialMutationPhase; operation: () => Promise<unknown> }>();
  const [mutationPhase, setMutationPhase] = useState<SocialMutationPhase>();
  const [publicationAvailability, setPublicationAvailability] = useState({ loaded: false, canSendVisit: false });
  const [shareCandidates, setShareCandidates] = useState<Array<{ id: string; title: string; summary: string }>>([]);
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState('');
  const [visitMode, setVisitMode] = useState<'standard' | 'visitor_topic' | 'random_host_topic'>('standard');
  const [shareableTopics, setShareableTopics] = useState<ShareableTopicSummary[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedJoinTopicId, setSelectedJoinTopicId] = useState('');
  const [joinableRooms, setJoinableRooms] = useState<JoinableVisitRoom[]>([]);
  const [reservation, setReservation] = useState<VisitReservationSummary>({ locked: false });
  const [dismissedTerminalVisitIds, setDismissedTerminalVisitIds] = useState<string[]>([]);
  const scopeKeyRef = useRef(scopeKey);
  useEffect(() => { scopeKeyRef.current = scopeKey; }, [scopeKey]);
  const handlePublicationAvailability = useCallback((next: { loaded: boolean; canSendVisit: boolean }) => {
    setPublicationAvailability((current) => current.loaded === next.loaded && current.canSendVisit === next.canSendVisit ? current : next);
  }, []);

  const refreshVisitOptions = useCallback(async () => {
    if (!scopeKey) return;
    const operationScope = scopeKey;
    try {
      const [mine, currentReservation, rooms] = await Promise.all([
        window.ourCompanion.network.companions.getMine(),
        window.ourCompanion.network.visits.getReservation(),
        window.ourCompanion.network.visits.rooms.listJoinable(),
      ]);
      const topics = mine.activeNetworkCompanionId
        ? await window.ourCompanion.network.companions.listShareableTopics(mine.activeNetworkCompanionId)
        : [];
      if (scopeKeyRef.current !== operationScope) return;
      const activeTopics = topics.filter((topic) => !topic.revokedAt);
      setShareableTopics(activeTopics);
      setSelectedTopicId((current) => activeTopics.some((topic) => topic.id === current) ? current : activeTopics[0]?.id ?? '');
      setSelectedJoinTopicId((current) => activeTopics.some((topic) => topic.id === current) ? current : '');
      setReservation(currentReservation);
      setJoinableRooms(rooms);
    } catch {
      if (scopeKeyRef.current !== operationScope) return;
      setJoinableRooms([]);
    }
  }, [scopeKey]);

  useEffect(() => {
    setUid('');
    setCopiedUid(false);
    setLookup(undefined);
    setPendingDestructiveAction(undefined);
    setMutationPhase(undefined);
    setPublicationAvailability({ loaded: false, canSendVisit: false });
    setShareCandidates([]);
    setSelectedDiscoveryId('');
    setVisitMode('standard');
    setShareableTopics([]);
    setSelectedTopicId('');
    setSelectedJoinTopicId('');
    setJoinableRooms([]);
    setReservation({ locked: false });
    setDismissedTerminalVisitIds(readDismissedTerminalVisitIds(scopeKey));
    void window.ourCompanion.discovery.getFeed({ limit: 20 }).then((items) => {
      const candidates = items.filter((item) => item.title && item.summary).map((item) => ({ id: item.id, title: item.title, summary: item.summary ?? item.title }));
      setShareCandidates(candidates);
      setSelectedDiscoveryId(candidates[0]?.id ?? '');
    }).catch(() => undefined);
    void refreshVisitOptions();
    const unsubscribe = window.ourCompanion.network.onStatusChanged((next) => {
      if (next.socialInvalidation?.type === 'visit_session' || next.socialInvalidation?.type === 'visit_invitation') void refreshVisitOptions();
    });
    return unsubscribe;
  }, [refreshVisitOptions, scopeKey]);

  const clearTerminalVisit = useCallback((sessionId: string) => {
    if (!scopeKey) return;
    setDismissedTerminalVisitIds((current) => {
      if (current.includes(sessionId)) return current;
      const next = [...current, sessionId].slice(-100);
      writeDismissedTerminalVisitIds(scopeKey, next);
      return next;
    });
  }, [scopeKey]);

  if (!status) return <div data-testid="social-panel" className="social-page"><PaperCard title={t(lang, 'social_title')} tape className="settings-panel social-unavailable"><SectionLoading label={t(lang, 'social_availability_loading')} /></PaperCard></div>;
  if (!canShowContent || !status.account) return <div data-testid="social-panel" className="social-page"><PaperCard title={t(lang, 'social_title')} tape className="settings-panel social-unavailable"><ConnectionBanner status={status} onRetry={() => void window.ourCompanion.network.retryConnection()} /><EmptyState title={t(lang, 'social_unavailable')}>{socialAvailabilityMessage(status, lang)}</EmptyState></PaperCard></div>;
  const account = status.account;
  const mutationsDisabled = actionBusy || !available;
  const busyAction = mutationsDisabled;
  const copyOwnUid = async () => {
    try {
      await navigator.clipboard.writeText(account.uid);
      setCopiedUid(true);
      window.setTimeout(() => setCopiedUid(false), 1800);
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
  const liveVisits = visitSessions.filter((session) => ['preparing', 'ready', 'active', 'ending'].includes(session.state));
  const hostOccupancy = liveVisits.filter((session) => session.hostUserId === account.id).length;
  const localCompanionAway = liveVisits.some((session) => session.visitorOwnerUserId === account.id);
  const hostAtCapacity = hostOccupancy >= visualVisit.capacity;
  const latestTerminalVisit = visitSessions.find((session) => ['ended', 'cancelled', 'failed'].includes(session.state) && !dismissedTerminalVisitIds.includes(session.id));
  const userId = account.id;
  const friendsById = new Map(friends.map((friend) => [friend.userId, friend]));
  const suggestedFriend = friends.find((friend) => friend.presence === 'online');
  const visibleIncomingVisits = visibleInvitations(visitIncoming);
  const visibleOutgoingVisits = visibleInvitations(visitOutgoing);
  const mutationReason = mutationPhase ? t(lang, SOCIAL_MUTATION_PRESENTATION[mutationPhase].labelKey) : undefined;

  return <div data-testid="social-panel" className="social-page"><PaperCard title={t(lang, 'social_title')} tape className="settings-panel">
    <ConnectionBanner status={status} stale={stale} onRetry={() => void window.ourCompanion.network.retryConnection()} />
    <section className="social-overview" aria-label={t(lang, 'social_overview_label')}>
      <h3>{t(lang, 'social_overview')}</h3>
      <p><strong>{account.username}</strong> <span className="soft-pill">UID: {account.uid}</span></p>
      <div className="action-row"><button type="button" onClick={() => void copyOwnUid()}>{copiedUid ? t(lang, 'social_friend_code_copied') : t(lang, 'social_copy_friend_code')}</button><span>{t(lang, 'social_friend_count', { count: friends.length, plural: friends.length === 1 ? '' : 's' })} · {t(lang, 'social_pending_request_count', { count: incoming.length, plural: incoming.length === 1 ? '' : 's' })}</span></div>
    </section>
    {loadedDomains.visitSessions && <CurrentVisitSection lang={lang} stale={stale} liveVisits={liveVisits} latestTerminalVisit={latestTerminalVisit} userId={userId} visualVisit={visualVisit} busyAction={busyAction} action={action} refreshVisitOptions={refreshVisitOptions} onClearTerminalVisit={clearTerminalVisit} />}
    <section aria-labelledby="published-companion-heading"><h3 id="published-companion-heading">{t(lang, 'social_published_companion')}</h3><PublishedCompanionSection onVisitAvailabilityChange={handlePublicationAvailability} /></section>
    <div className="online-auth-form"><label><span>{t(lang, 'social_add_friend_by_code')}</span><input value={uid} onChange={(event) => setUid(event.target.value.toUpperCase())} placeholder="OC-7K4M92QX" /></label><button className="btn-secondary btn-sm" onClick={() => { setLookup(undefined); setActionError(undefined); void action(() => window.ourCompanion.network.friends.lookup(uid.trim()), { clearLookup: false, phase: 'sending', onSuccess: setLookup }); }} disabled={!uid.trim() || busyAction}>{t(lang, 'social_find')}</button></div>
    {lookup && <div data-testid="friend-lookup-result" className="online-user-info"><p><strong>{lookup.username}</strong> · UID: {lookup.uid}</p>{canSendFriendRequest(lookup.relationship) && <button data-testid="send-friend-request" className="btn-primary btn-sm" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.friends.sendRequest(lookup.id), { phase: 'sending' })}>{t(lang, 'social_send_request')}</button>}<p data-testid="friend-lookup-relationship" aria-live="polite">{friendLookupRelationshipMessage(lookup.relationship, lang)}</p></div>}
    {actionError && <InlineNotice tone="error">{t(lang, actionError)}</InlineNotice>}
    {mutationReason && <LoadingState label={mutationReason} />}
    {!hasLoaded && loading && <SectionLoading label={t(lang, 'social_loading')} />}
    {suggestedFriend && <section className="social-overview" data-testid="social-visit-suggestion">
      <h3>{lang === 'zh-CN' ? 'Companion 的拜访建议' : 'Companion visit suggestion'}</h3>
      <p>{lang === 'zh-CN' ? `${suggestedFriend.username} 在线。选择普通 Discovery、自己携带的主题，或让对方用随机主题开场。` : `${suggestedFriend.username} is online. Choose an approved Discovery, bring a Shareable Topic, or let the Host open with a random topic.`}</p>
      <label><span>{lang === 'zh-CN' ? '拜访方式' : 'Visit mode'}</span><select value={visitMode} onChange={(event) => setVisitMode(event.target.value as typeof visitMode)} disabled={reservation.locked}>
        <option value="standard">{lang === 'zh-CN' ? '带一条 Discovery 拜访' : 'Visit with a Discovery'}</option>
        <option value="visitor_topic">{lang === 'zh-CN' ? '带已发布主题拜访' : 'Visit with my Shareable Topic'}</option>
        <option value="random_host_topic">{lang === 'zh-CN' ? '由 Host 随机选择主题' : 'Host chooses a random topic'}</option>
      </select></label>
      {visitMode === 'standard' && <label><span>{lang === 'zh-CN' ? '允许分享的 Discovery' : 'Discovery approved to share'}</span><select value={selectedDiscoveryId} onChange={(event) => setSelectedDiscoveryId(event.target.value)}><option value="">{lang === 'zh-CN' ? '请选择' : 'Select one'}</option>{shareCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>}
      {visitMode === 'visitor_topic' && <label><span>{lang === 'zh-CN' ? '携带的主题' : 'Topic to bring'}</span><select value={selectedTopicId} onChange={(event) => setSelectedTopicId(event.target.value)}><option value="">{lang === 'zh-CN' ? '请选择' : 'Select one'}</option>{shareableTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>}
      {reservation.locked && <InlineNotice>{lang === 'zh-CN' ? '当前 Companion 已为一场 Visit 保留。在邀请结束或房间关闭前不能创建另一场 Visit，也不会执行 Discovery。' : 'This Companion is reserved for one Visit. Another Visit and Discovery are disabled until the reservation is released.'}</InlineNotice>}
    </section>}
    {joinableRooms.length > 0 && <section className="social-overview" data-testid="joinable-social-rooms">
      <h3>{lang === 'zh-CN' ? '可加入的好友房间' : 'Joinable friend rooms'}</h3>
      <label><span>{lang === 'zh-CN' ? '加入时排队的主题（可选）' : 'Topic to queue when joining (optional)'}</span><select value={selectedJoinTopicId} onChange={(event) => setSelectedJoinTopicId(event.target.value)}><option value="">{lang === 'zh-CN' ? '不携带主题' : 'Join without a topic'}</option>{shareableTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>
      {joinableRooms.map((room) => <article key={room.sessionId} className="online-user-info">
        <div className="operational-row-main"><strong>{room.hostCompanionName ?? room.hostUsername}</strong><span className="soft-pill">{room.participantCount} / {room.roomCapacity}</span></div>
        <p>{room.participants.map((participant) => participant.companionName ?? participant.role).join(' · ')}</p>
        {room.activeTopic && <p><strong>{lang === 'zh-CN' ? '当前主题：' : 'Current topic: '}</strong>{room.activeTopic.title}</p>}
        <button type="button" className="btn-primary btn-sm" disabled={busyAction || reservation.locked} onClick={() => void action(() => window.ourCompanion.network.visits.rooms.requestJoin(room.sessionId, selectedJoinTopicId || undefined), { phase: 'sending' }).then(() => void refreshVisitOptions())}>{lang === 'zh-CN' ? '申请加入' : 'Request to join'}</button>
      </article>)}
    </section>}
    <h3>{t(lang, 'social_friends')}</h3>{domainErrors.friends && <SectionPartialError message={t(lang, domainErrors.friends)} onRetry={() => void refresh()} />}{domainErrors.presence && <SectionPartialError message={t(lang, domainErrors.presence)} onRetry={() => void refresh()} />}{loadedDomains.friends && (friends.length ? friends.map((friend) => {
      const pendingVisit = visitOutgoing.some((invite) => invite.status === 'pending' && invite.hostUserId === friend.userId);
      const visitDisabledCode = hostOccupancy > 0 ? 'VISIT_HOST_HAS_ACTIVE_GUESTS' : localCompanionAway ? 'VISIT_HOST_COMPANION_AWAY' : undefined;
      const visitDisabledReason = mutationReason ?? (reservation.locked ? (lang === 'zh-CN' ? '当前 Companion 已保留给另一场 Visit。' : 'This Companion already has a Visit reservation.') : !available ? t(lang, 'online_state_detail_reconnecting') : !visitsAvailable ? t(lang, 'social_visit_unavailable') : !publicationAvailability.loaded ? t(lang, 'social_partial_publishing') : !publicationAvailability.canSendVisit ? t(lang, 'social_publish_before_visit_hint') : visitDisabledCode ? visitAdmissionMessage(lang, visitDisabledCode) : pendingVisit ? t(lang, 'social_pending') : undefined);
      return <FriendRow key={friend.userId} lang={lang} friend={friend} disabled={busyAction} visitDisabledReason={visitDisabledReason}
        onView={() => void action(() => window.ourCompanion.network.companions.getFriendCompanion(friend.userId), { phase: 'sending', onSuccess: (companion) => { setFriendCompanion(companion); setFriendAssetStatus(''); } })}
        onVisit={() => {
          if (reservation.locked) return setActionError('social_error_action_unavailable');
          const operation = visitMode === 'visitor_topic'
            ? selectedTopicId ? () => window.ourCompanion.network.visits.invitations.send(friend.userId, { mode: 'visitor_topic', topicId: selectedTopicId }) : undefined
            : visitMode === 'random_host_topic'
              ? () => window.ourCompanion.network.visits.invitations.send(friend.userId, { mode: 'random_host_topic' })
              : selectedDiscoveryId ? () => window.ourCompanion.network.visits.invitations.sendDiscovery({ hostUserId: friend.userId, discoveryId: selectedDiscoveryId }) : undefined;
          if (!operation) return setActionError('social_error_action_unavailable');
          void action(operation, { phase: 'sending' }).then(() => void refreshVisitOptions());
        }}
        onRemove={() => setPendingDestructiveAction({ title: t(lang, 'social_remove_friend_title'), description: t(lang, 'social_remove_friend_desc', { username: friend.username }), confirmLabel: t(lang, 'social_remove_friend'), phase: 'removing', operation: () => window.ourCompanion.network.friends.remove(friend.userId) })}
        onBlock={() => setPendingDestructiveAction({ title: t(lang, 'social_block_user_title'), description: t(lang, 'social_block_user_desc', { username: friend.username }), confirmLabel: t(lang, 'social_block_user'), phase: 'blocking', operation: () => window.ourCompanion.network.blocks.block(friend.userId) })}
      />;
    }) : <p>{t(lang, 'social_no_friends')}</p>)}
    {friendCompanion && <div className="online-user-info"><h3>{friendCompanion.name}</h3>{friendCompanion.publicDescription && <p>{friendCompanion.publicDescription}</p>}<p>{friendCompanion.publicTags.join(' · ')}</p>{friendCompanion.activeAssetPackId ? <button className="btn-secondary btn-sm" disabled={busyAction} onClick={() => void action(() => window.ourCompanion.network.assets.downloadPack({ assetPackId: friendCompanion.activeAssetPackId!, networkCompanionId: friendCompanion.id }), { phase: 'preparing', onSuccess: () => setFriendAssetStatus(t(lang, 'social_pack_downloaded')) })}>{t(lang, 'social_download_pack')}</button> : <p>{t(lang, 'social_no_active_pack')}</p>}{friendAssetStatus && <p aria-live="polite">{friendAssetStatus}</p>}</div>}
    <h3>{t(lang, 'social_visit_invitations')}</h3>{domainErrors.incomingVisitInvitations && <SectionPartialError message={t(lang, domainErrors.incomingVisitInvitations)} onRetry={() => void refresh()} />}{domainErrors.outgoingVisitInvitations && <SectionPartialError message={t(lang, domainErrors.outgoingVisitInvitations)} onRetry={() => void refresh()} />}{domainErrors.visitSessions && <SectionPartialError message={t(lang, domainErrors.visitSessions)} onRetry={() => void refresh()} />}
    {!visitsAvailable ? <p>{t(lang, 'social_visit_unavailable')}</p> : <>
      {loadedDomains.incomingVisitInvitations && (visibleIncomingVisits.length ? visibleIncomingVisits.map((invite) => <VisitInvitationRow key={invite.id} lang={lang} invitation={invite} direction="incoming" username={friendsById.get(invite.visitorOwnerUserId)?.username ?? t(lang, 'social_friend_fallback')} disabled={busyAction || hostAtCapacity || localCompanionAway} disabledReason={mutationReason ?? (hostAtCapacity ? visitAdmissionMessage(lang, 'VISIT_HOST_CAPACITY_REACHED') : localCompanionAway ? visitAdmissionMessage(lang, 'VISIT_HOST_COMPANION_AWAY') : undefined)} onAccept={() => void action(() => window.ourCompanion.network.visits.invitations.accept(invite.id), { phase: 'accepting' })} onDecline={() => void action(() => window.ourCompanion.network.visits.invitations.decline(invite.id), { phase: 'rejecting' })} />) : <p>{t(lang, 'social_no_incoming_visit')}</p>)}
      <h3>{t(lang, 'social_outgoing_visit_invitations')}</h3>
      {loadedDomains.outgoingVisitInvitations && (visibleOutgoingVisits.length ? visibleOutgoingVisits.map((invite) => <VisitInvitationRow key={invite.id} lang={lang} invitation={invite} direction="outgoing" username={friendsById.get(invite.hostUserId)?.username ?? t(lang, 'social_friend_fallback')} disabled={busyAction} disabledReason={mutationReason} onCancel={() => void action(() => window.ourCompanion.network.visits.invitations.cancel(invite.id), { phase: 'cancelling' })} />) : <p>{t(lang, 'social_no_outgoing_visit')}</p>)}
    </>}
    <h3>{t(lang, 'social_incoming_requests')}</h3>{domainErrors.incomingRequests && <SectionPartialError message={t(lang, domainErrors.incomingRequests)} onRetry={() => void refresh()} />}{loadedDomains.incomingRequests && (incoming.length ? incoming.map((request) => <FriendRequestRow key={request.id} lang={lang} request={request} disabled={busyAction} disabledReason={mutationReason} onAccept={() => void action(() => window.ourCompanion.network.friends.acceptRequest(request.id), { phase: 'accepting' })} onReject={() => void action(() => window.ourCompanion.network.friends.rejectRequest(request.id), { phase: 'rejecting' })} />) : <p>{t(lang, 'social_no_incoming_requests')}</p>)}
    <h3>{t(lang, 'social_outgoing_requests')}</h3>{domainErrors.outgoingRequests && <SectionPartialError message={t(lang, domainErrors.outgoingRequests)} onRetry={() => void refresh()} />}{loadedDomains.outgoingRequests && (outgoing.length ? outgoing.map((request) => <FriendRequestRow key={request.id} lang={lang} request={request} disabled={busyAction} disabledReason={mutationReason} onCancel={() => void action(() => window.ourCompanion.network.friends.cancelRequest(request.id), { phase: 'cancelling' })} />) : <p>{t(lang, 'social_no_outgoing_requests')}</p>)}
    <h3>{t(lang, 'social_blocked_users')}</h3>{domainErrors.blockedUsers && <SectionPartialError message={t(lang, domainErrors.blockedUsers)} onRetry={() => void refresh()} />}{loadedDomains.blockedUsers && (blocked.length ? blocked.map((user) => <BlockedUserRow key={user.userId} lang={lang} user={user} disabled={busyAction} disabledReason={mutationReason} onUnblock={() => void action(() => window.ourCompanion.network.blocks.unblock(user.userId), { phase: 'unblocking' })} />) : <p>{t(lang, 'social_no_blocked_users')}</p>)}
    <ConfirmDialog open={Boolean(pendingDestructiveAction)} title={pendingDestructiveAction?.title ?? ''} description={pendingDestructiveAction?.description ?? ''} confirmLabel={pendingDestructiveAction?.confirmLabel} busy={actionBusy} danger onClose={() => setPendingDestructiveAction(undefined)} onConfirm={() => { const pending = pendingDestructiveAction; if (pending) void action(pending.operation, { phase: pending.phase }).then(() => setPendingDestructiveAction(undefined)); }} />
  </PaperCard></div>;
}

function CurrentVisitSection({
  lang, stale, liveVisits, latestTerminalVisit, userId, visualVisit, busyAction, action, refreshVisitOptions, onClearTerminalVisit,
}: {
  lang: Lang;
  stale: boolean;
  liveVisits: VisitSessionSummary[];
  latestTerminalVisit?: VisitSessionSummary;
  userId: string;
  visualVisit: ReturnType<typeof useVisualVisitState>;
  busyAction: boolean;
  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
  onClearTerminalVisit: (sessionId: string) => void;
}) {
  const sessions = liveVisits.length ? liveVisits : latestTerminalVisit ? [latestTerminalVisit] : [];
  const visibleVisitors = Object.values(visualVisit.visitors).length;
  return <section aria-labelledby="current-visit-heading">
    <h3 id="current-visit-heading">{t(lang, 'social_visit_session')}</h3>
    <p data-testid="visit-capacity">Visitors: {visibleVisitors} / {visualVisit.capacity}</p>
    {sessions.length ? sessions.map((session) => <CurrentVisitCard key={session.id} session={session} live={liveVisits.some((candidate) => candidate.id === session.id)} lang={lang} stale={stale} userId={userId} visualVisit={visualVisit} busyAction={busyAction} action={action} refreshVisitOptions={refreshVisitOptions} onClearTerminalVisit={onClearTerminalVisit} />) : <p data-testid="visit-session-state">{t(lang, 'social_no_current_visit')}</p>}
  </section>;
}

function CurrentVisitCard({ session, live, lang, stale, userId, visualVisit, busyAction, action, refreshVisitOptions, onClearTerminalVisit }: {
  session: VisitSessionSummary;
  live: boolean;
  lang: Lang;
  stale: boolean;
  userId: string;
  visualVisit: ReturnType<typeof useVisualVisitState>;
  busyAction: boolean;
  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
  onClearTerminalVisit: (sessionId: string) => void;
}) {
  const [room, setRoom] = useState<VisitRoomState>();
  const loadRoom = useCallback(async () => {
    try { setRoom(await window.ourCompanion.network.visits.rooms.get(session.id)); }
    catch { setRoom(undefined); }
  }, [session.id]);

  useEffect(() => {
    void loadRoom();
    if (!live) return;
    const unsubscribe = window.ourCompanion.network.onStatusChanged((status) => {
      if (status.socialInvalidation?.type === 'visit_session' && status.socialInvalidation.sessionId === session.id) void loadRoom();
    });
    const timer = window.setInterval(() => void loadRoom(), 30_000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [live, loadRoom, session.id]);

  const me = room?.participants.find((participant) => participant.userId === userId && participant.state !== 'left');
  const currentUserReady = me ? ['ready', 'active'].includes(me.state) : session.visitorOwnerUserId === userId ? session.visitorOwnerReady : session.hostReady;
  const presentation = VISIT_SESSION_PRESENTATION[session.state];
  const run = async (operation: () => Promise<unknown>, phase: SocialMutationPhase) => {
    await action(operation, { phase });
    await Promise.all([loadRoom(), refreshVisitOptions()]);
  };
  const guestPreparing = session.state === 'active' && me?.role === 'guest' && me.state === 'preparing';
  const canEndRoom = me?.role !== 'guest';

  return <div data-testid="visit-session-state" data-session-id={session.id} data-state={session.state} className="operational-row">
    <div className="operational-row-main"><strong>{stale && live ? t(lang, 'social_visit_reconnecting') : visitSessionMessage(session, userId, lang)}</strong>{presentation && <span className={`status-badge status-badge-${presentation.tone}`}><span className="status-badge-marker" aria-hidden="true" />{t(lang, presentation.labelKey)}</span>}</div>
    {room && <div className="social-room-members" data-testid="social-room-members">
      <p><strong>{lang === 'zh-CN' ? '房间成员：' : 'Room members: '}</strong>{room.participants.filter((item) => item.state !== 'left').map((item) => `${item.companionName ?? item.role} (${item.role})`).join(' · ')}</p>
      {room.topics.length > 0 && <ol className="social-room-topic-queue">{room.topics.map((topic) => <li key={topic.id} data-topic-state={topic.state}><strong>{topic.title}</strong> <span className="soft-pill">{topic.state}</span></li>)}</ol>}
    </div>}
    {session.state === 'preparing' && <p>{t(lang, 'social_visit_readiness', { owner: session.visitorOwnerReady ? t(lang, 'social_ready') : t(lang, 'social_not_ready'), host: session.hostReady ? t(lang, 'social_ready') : t(lang, 'social_not_ready') })}</p>}
    {!stale && session.state === 'active' && <p>{visualVisitMessage(visualVisit, session, userId, lang)}</p>}
    {stale && live && <p className="state-reason">{t(lang, 'operational_content_stale')}</p>}
    {!live && <div className="terminal-visit-summary">
      <p>{t(lang, session.endReason ? visitEndReasonPresentation(session.endReason) : visitFailurePresentation(session.failureCode))}</p>
      <div className="operational-row-actions">
        <button type="button" className="btn-secondary btn-sm" data-testid="clear-terminal-visit" onClick={() => onClearTerminalVisit(session.id)}>{lang === 'zh-CN' ? '从此设备清除' : 'Clear from this device'}</button>
        <span className="state-reason">{lang === 'zh-CN' ? '只隐藏此设备上的记录；Network Portal 的 Social Journal 不会删除。' : 'This only hides the local card. The Network Portal Social Journal is preserved.'}</span>
      </div>
    </div>}
    {live && session.state !== 'ending' && <div className="operational-row-actions">
      {((session.state === 'preparing' && !currentUserReady) || guestPreparing) && <button data-testid="prepare-visit" disabled={busyAction || stale} onClick={() => void run(() => guestPreparing ? window.ourCompanion.network.visits.rooms.markParticipantReady(session.id) : window.ourCompanion.network.visits.sessions.prepare(session.id), 'preparing')}>{busyAction ? t(lang, 'social_preparing') : t(lang, 'social_prepare')}</button>}
      {session.state === 'ready' && session.hostUserId === userId && <button data-testid="start-visit" disabled={busyAction || stale} onClick={() => void run(() => window.ourCompanion.network.visits.sessions.start(session.id), 'starting')}>{t(lang, 'social_start_visit')}</button>}
      {me?.role === 'guest' && <button type="button" className="btn-secondary btn-sm" disabled={busyAction || stale} onClick={() => void run(() => window.ourCompanion.network.visits.rooms.leave(session.id), 'ending')}>{lang === 'zh-CN' ? '离开房间' : 'Leave room'}</button>}
      {canEndRoom && <button data-testid="end-visit" disabled={busyAction || stale} onClick={() => void run(() => window.ourCompanion.network.visits.sessions.end(session.id), 'ending')}>{session.state === 'preparing' || session.state === 'ready' ? t(lang, 'social_cancel_visit') : t(lang, 'social_end_visit')}</button>}
    </div>}
    {room?.session.hostUserId === userId && room.pendingJoinRequests.length > 0 && <section className="social-room-join-requests" data-testid="social-room-join-requests">
      <h4>{lang === 'zh-CN' ? '加入申请' : 'Join requests'}</h4>
      {room.pendingJoinRequests.map((request) => <article key={request.id} className="online-user-info">
        <strong>{request.companionName ?? (lang === 'zh-CN' ? 'Guest Companion' : 'Guest Companion')}</strong>
        {request.topic && <><p><strong>{lang === 'zh-CN' ? '排队主题：' : 'Queued topic: '}</strong>{request.topic.title}</p><p>{request.topic.summary}</p></>}
        <div className="operational-row-actions"><button type="button" disabled={busyAction || stale} onClick={() => void run(() => window.ourCompanion.network.visits.rooms.acceptJoinRequest(request.id), 'accepting')}>{t(lang, 'social_accept')}</button><button type="button" disabled={busyAction || stale} onClick={() => void run(() => window.ourCompanion.network.visits.rooms.declineJoinRequest(request.id), 'rejecting')}>{t(lang, 'social_decline')}</button></div>
      </article>)}
    </section>}
    <SocialVisitConversation session={session} userId={userId} lang={lang} stale={stale} />
  </div>;
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
  const visitor = Object.values(visual.visitors).find((candidate) => candidate.sessionId === session.id);
  if (visitor) return t(lang, 'social_visitor_visiting', { name: visitor.name });
  return t(lang, 'social_preparing_visitor_assets');
}

function messageKeyForSocialError(cause: unknown): TranslationKey {
  const code = cause instanceof Error ? cause.message : 'SOCIAL_ACTION_NOT_ALLOWED';
  return ({ INVALID_FRIEND_CODE: 'social_error_invalid_code', FRIEND_REQUEST_ALREADY_EXISTS: 'social_error_request_exists', FRIENDSHIP_ALREADY_EXISTS: 'social_error_friendship_exists', CANNOT_FRIEND_SELF: 'social_error_self', SOCIAL_ACTION_NOT_ALLOWED: 'social_error_action_unavailable', SOCIAL_DATA_OUT_OF_SYNC: 'social_error_sync', COMPANION_NOT_AVAILABLE: 'social_error_companion_unavailable', ASSET_STORAGE_UNAVAILABLE: 'social_error_storage_unavailable', VISIT_VISUAL_ASSETS_UNAVAILABLE: 'visit_failure_visual_assets', VISUAL_VISIT_ASSET_UNAVAILABLE: 'visit_failure_visual_assets', VISIT_HOST_COMPANION_AWAY: 'social_visit_host_companion_away', VISIT_HOST_CAPACITY_REACHED: 'social_visit_host_capacity_reached', VISIT_HOST_HAS_ACTIVE_GUESTS: 'social_visit_host_has_active_guests', VISIT_HOST_COMPANION_SWITCH_BLOCKED: 'social_visit_host_companion_switch_blocked', VISIT_COMPANION_RESERVED: 'social_error_action_unavailable', VISIT_RESERVATION_EXISTS: 'social_error_action_unavailable', VISIT_ROOM_NOT_JOINABLE: 'social_error_action_unavailable', VISIT_ROOM_CAPACITY_REACHED: 'social_visit_host_capacity_reached', VISIT_JOIN_REQUESTS_DISABLED: 'social_error_action_unavailable', VISIT_JOIN_REQUEST_EXISTS: 'social_error_action_unavailable', RATE_LIMITED: 'social_error_rate_limited' } as const)[code] ?? 'social_error_sync';
}

function visitAdmissionMessage(lang: Lang, code: 'VISIT_HOST_COMPANION_AWAY' | 'VISIT_HOST_CAPACITY_REACHED' | 'VISIT_HOST_HAS_ACTIVE_GUESTS' | 'VISIT_HOST_COMPANION_SWITCH_BLOCKED'): string {
  const key = {
    VISIT_HOST_COMPANION_AWAY: 'social_visit_host_companion_away',
    VISIT_HOST_CAPACITY_REACHED: 'social_visit_host_capacity_reached',
    VISIT_HOST_HAS_ACTIVE_GUESTS: 'social_visit_host_has_active_guests',
    VISIT_HOST_COMPANION_SWITCH_BLOCKED: 'social_visit_host_companion_switch_blocked',
  } as const;
  return t(lang, key[code]);
}

const DISMISSED_TERMINAL_VISITS_STORAGE_PREFIX = 'our-companion.social.dismissed-terminal-visits.';

function dismissedTerminalVisitsStorageKey(scopeKey: string): string {
  return `${DISMISSED_TERMINAL_VISITS_STORAGE_PREFIX}${encodeURIComponent(scopeKey)}`;
}

function readDismissedTerminalVisitIds(scopeKey?: string): string[] {
  if (!scopeKey) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dismissedTerminalVisitsStorageKey(scopeKey)) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(-100)
      : [];
  } catch {
    return [];
  }
}

function writeDismissedTerminalVisitIds(scopeKey: string, sessionIds: string[]): void {
  try {
    window.localStorage.setItem(dismissedTerminalVisitsStorageKey(scopeKey), JSON.stringify(sessionIds.slice(-100)));
  } catch {
    // Local history dismissal is optional and must not block the Social page.
  }
}

function visibleInvitations(invitations: VisitInvitationSummary[]): VisitInvitationSummary[] {
  const pending = invitations.filter((invitation) => invitation.status === 'pending');
  const latestTerminal = invitations
    .filter((invitation) => invitation.status !== 'pending')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  return latestTerminal ? [...pending, latestTerminal] : pending;
}
