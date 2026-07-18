import type {
  BlockedUserSummary,
  FriendRequestSummary,
  VisitInvitationSummary,
} from '@our-companion/shared';
import { OperationalRow } from '../../components/feedback/OperationalState';
import { VISIT_INVITATION_PRESENTATION } from '../operational/operationalState';
import { t, type Lang } from '../../i18n';
import type { SocialFriend } from './useSocialViewModel';
import { friendPresencePresentation } from '../operational/operationalState';

function formatDateTime(value: string, lang: Lang): string {
  return new Date(value).toLocaleString(lang === 'zh-CN' ? 'zh-CN' : 'en');
}

export function FriendRow({ lang, friend, disabled, visitDisabledReason, onView, onVisit, onRemove, onBlock }: {
  lang: Lang;
  friend: SocialFriend;
  disabled: boolean;
  visitDisabledReason?: string;
  onView: () => void;
  onVisit: () => void;
  onRemove: () => void;
  onBlock: () => void;
}) {
  const presence = friendPresencePresentation(friend.presence);
  return <OperationalRow
    label={friend.username}
    testId="friend-row"
    identity={<><strong>{friend.username}</strong><span className="selectable-code">{friend.friendCode}</span></>}
    status={{ label: t(lang, presence.labelKey), tone: presence.tone }}
    supporting={!friend.hasPublishedCompanion ? t(lang, 'social_friend_unpublished_hint') : undefined}
    actions={<>
      <button className="btn-ghost btn-sm" disabled={disabled || !friend.hasPublishedCompanion} onClick={onView}>{friend.hasPublishedCompanion ? t(lang, 'social_view_companion') : t(lang, 'social_no_published_companion')}</button>
      <button data-testid="send-visit-invitation" className="btn-secondary btn-sm" disabled={disabled || Boolean(visitDisabledReason)} onClick={onVisit}>{t(lang, 'social_send_visit')}</button>
      <details className="friend-overflow"><summary aria-label={t(lang, 'social_more_actions', { username: friend.username })}>{t(lang, 'social_more')}</summary><div className="friend-overflow-menu">
        <button className="btn-ghost btn-sm" disabled={disabled} onClick={onRemove}>{t(lang, 'social_remove_friend')}</button>
        <button className="btn-danger btn-sm" disabled={disabled} onClick={onBlock}>{t(lang, 'social_block_user')}</button>
      </div></details>
    </>}
    reason={visitDisabledReason}
  />;
}

export function FriendRequestRow({ lang, request, disabled, disabledReason, onAccept, onReject, onCancel }: {
  lang: Lang;
  request: FriendRequestSummary;
  disabled: boolean;
  disabledReason?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
}) {
  return <OperationalRow
    label={request.username}
    identity={<><strong>{request.username}</strong><span className="selectable-code">{request.friendCode}</span></>}
    status={{ label: t(lang, 'social_pending'), tone: 'warning' }}
    supporting={<><span>{t(lang, request.direction === 'incoming' ? 'social_request_received' : 'social_request_sent')}</span> <time dateTime={request.createdAt}>{formatDateTime(request.createdAt, lang)}</time></>}
    actions={request.direction === 'incoming' ? <><button disabled={disabled} onClick={onAccept}>{t(lang, 'social_accept')}</button><button disabled={disabled} onClick={onReject}>{t(lang, 'social_reject')}</button></> : <button disabled={disabled} onClick={onCancel}>{t(lang, 'social_cancel')}</button>}
    reason={disabledReason}
  />;
}

export function BlockedUserRow({ lang, user, disabled, disabledReason, onUnblock }: { lang: Lang; user: BlockedUserSummary; disabled: boolean; disabledReason?: string; onUnblock: () => void }) {
  return <OperationalRow
    label={user.username}
    identity={<strong>{user.username}</strong>}
    status={{ label: t(lang, 'social_blocked'), tone: 'neutral' }}
    supporting={<><span>{t(lang, 'social_blocked_on')}</span> <time dateTime={user.blockedAt}>{formatDateTime(user.blockedAt, lang)}</time></>}
    actions={<button disabled={disabled} onClick={onUnblock}>{t(lang, 'social_unblock')}</button>}
    reason={disabledReason ?? t(lang, 'social_unblock_note')}
  />;
}

export function VisitInvitationRow({ lang, invitation, direction, username, disabled, disabledReason, onAccept, onDecline, onCancel }: {
  lang: Lang;
  invitation: VisitInvitationSummary;
  direction: 'incoming' | 'outgoing';
  username: string;
  disabled: boolean;
  disabledReason?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}) {
  const presentation = VISIT_INVITATION_PRESENTATION[invitation.status];
  return <OperationalRow
    label={invitation.companionName}
    testId={direction === 'incoming' ? 'incoming-visit-invitation' : undefined}
    identity={<><strong>{invitation.companionName}</strong><span>{direction === 'incoming' ? t(lang, 'social_visit_from', { username }) : t(lang, 'social_visit_to', { username })}</span></>}
    status={{ label: t(lang, presentation.labelKey), tone: presentation.tone }}
    supporting={<>{invitation.companionDescription && <p>{invitation.companionDescription}</p>}<p>{invitation.companionTags.join(' · ') || t(lang, 'social_no_public_tags')}</p><p>{t(lang, direction === 'incoming' ? 'social_visit_role_host' : 'social_visit_role_visitor')} · {t(lang, 'social_visit_visual_only')}</p><p>{t(lang, 'social_expires', { time: '' })} <time dateTime={invitation.expiresAt}>{formatDateTime(invitation.expiresAt, lang)}</time></p></>}
    actions={invitation.status === 'pending' ? direction === 'incoming' ? <><button data-testid="accept-visit-invitation" disabled={disabled} onClick={onAccept}>{t(lang, 'social_accept')}</button><button disabled={disabled} onClick={onDecline}>{t(lang, 'social_decline')}</button></> : <button disabled={disabled} onClick={onCancel}>{t(lang, 'social_cancel')}</button> : undefined}
    reason={disabledReason}
  />;
}
