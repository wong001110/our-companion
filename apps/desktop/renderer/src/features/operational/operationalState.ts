import type {
  AssetUploadProgress,
  FriendPresence,
  NetworkAssetPack,
  NetworkConnectionState,
  VisitInvitationStatus,
  VisitSessionState,
} from '@our-companion/shared';
import type { TranslationKey } from '../../i18n';

export type OperationalTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type OperationalPhase = 'loading' | 'ready' | 'stale' | 'terminal' | 'error';

export interface OperationalPresentation {
  labelKey: TranslationKey;
  detailKey?: TranslationKey;
  tone: OperationalTone;
  phase: OperationalPhase;
}

export const NETWORK_STATE_PRESENTATION = {
  disabled: { labelKey: 'online_state_disabled', detailKey: 'online_state_detail_disabled', tone: 'neutral', phase: 'terminal' },
  offline: { labelKey: 'online_state_offline', detailKey: 'online_state_detail_offline', tone: 'neutral', phase: 'stale' },
  checking_server: { labelKey: 'online_state_checking_server', detailKey: 'online_state_detail_checking_server', tone: 'info', phase: 'loading' },
  authentication_required: { labelKey: 'online_state_authentication_required', detailKey: 'online_state_detail_authentication_required', tone: 'warning', phase: 'terminal' },
  connecting: { labelKey: 'online_state_connecting', detailKey: 'online_state_detail_connecting', tone: 'info', phase: 'loading' },
  online: { labelKey: 'online_state_online', detailKey: 'online_state_detail_online', tone: 'success', phase: 'ready' },
  reconnecting: { labelKey: 'online_state_reconnecting', detailKey: 'online_state_detail_reconnecting', tone: 'warning', phase: 'stale' },
  incompatible_client: { labelKey: 'online_state_incompatible_client', detailKey: 'online_state_detail_incompatible_client', tone: 'danger', phase: 'error' },
  server_unavailable: { labelKey: 'online_state_server_unavailable', detailKey: 'online_state_detail_server_unavailable', tone: 'danger', phase: 'error' },
  authentication_failed: { labelKey: 'online_state_authentication_failed', detailKey: 'online_state_detail_authentication_failed', tone: 'danger', phase: 'error' },
} as const satisfies Record<NetworkConnectionState, OperationalPresentation>;

export const FRIEND_PRESENCE_PRESENTATION = {
  online: { labelKey: 'social_presence_online', tone: 'success', phase: 'ready' },
  idle: { labelKey: 'social_presence_idle', tone: 'warning', phase: 'ready' },
  offline: { labelKey: 'social_presence_offline', tone: 'neutral', phase: 'ready' },
} as const satisfies Record<FriendPresence, OperationalPresentation>;

export const VISIT_INVITATION_PRESENTATION = {
  pending: { labelKey: 'visit_invitation_pending', tone: 'warning', phase: 'ready' },
  accepted: { labelKey: 'visit_invitation_accepted', tone: 'success', phase: 'terminal' },
  declined: { labelKey: 'visit_invitation_declined', tone: 'neutral', phase: 'terminal' },
  cancelled: { labelKey: 'visit_invitation_cancelled', tone: 'neutral', phase: 'terminal' },
  expired: { labelKey: 'visit_invitation_expired', tone: 'warning', phase: 'terminal' },
} as const satisfies Record<VisitInvitationStatus, OperationalPresentation>;

export const VISIT_SESSION_PRESENTATION = {
  preparing: { labelKey: 'visit_session_preparing', tone: 'info', phase: 'loading' },
  ready: { labelKey: 'visit_session_ready', tone: 'success', phase: 'ready' },
  active: { labelKey: 'visit_session_active', tone: 'success', phase: 'ready' },
  ending: { labelKey: 'visit_session_ending', tone: 'warning', phase: 'loading' },
  ended: { labelKey: 'visit_session_ended', tone: 'neutral', phase: 'terminal' },
  cancelled: { labelKey: 'visit_session_cancelled', tone: 'neutral', phase: 'terminal' },
  failed: { labelKey: 'visit_session_failed', tone: 'danger', phase: 'error' },
} as const satisfies Record<VisitSessionState, OperationalPresentation>;

export const ASSET_PACK_PRESENTATION = {
  draft: { labelKey: 'asset_pack_draft', tone: 'neutral', phase: 'ready' },
  uploading: { labelKey: 'asset_pack_uploading', tone: 'info', phase: 'loading' },
  verifying: { labelKey: 'asset_pack_verifying', tone: 'info', phase: 'loading' },
  active: { labelKey: 'asset_pack_active', tone: 'success', phase: 'ready' },
  superseded: { labelKey: 'asset_pack_superseded', tone: 'neutral', phase: 'terminal' },
  deleting: { labelKey: 'asset_pack_deleting', tone: 'warning', phase: 'loading' },
  failed: { labelKey: 'asset_pack_failed', tone: 'danger', phase: 'error' },
  abandoning: { labelKey: 'asset_pack_abandoning', tone: 'warning', phase: 'loading' },
  abandoned: { labelKey: 'asset_pack_abandoned', tone: 'neutral', phase: 'terminal' },
} as const satisfies Record<NetworkAssetPack['status'], OperationalPresentation>;

export const ASSET_UPLOAD_PRESENTATION = {
  preparing: { labelKey: 'publish_state_preparing', tone: 'info', phase: 'loading' },
  uploading: { labelKey: 'publish_state_uploading', tone: 'info', phase: 'loading' },
  verifying: { labelKey: 'publish_state_verifying', tone: 'info', phase: 'loading' },
  completed: { labelKey: 'publish_state_completed', tone: 'success', phase: 'terminal' },
  failed: { labelKey: 'publish_state_failed', tone: 'danger', phase: 'error' },
  cancelled: { labelKey: 'publish_state_cancelled', tone: 'neutral', phase: 'terminal' },
} as const satisfies Record<AssetUploadProgress['state'], OperationalPresentation>;

export type PublishedCompanionUiState =
  | 'no_local_companion'
  | 'draft'
  | 'validation_error'
  | 'no_active_pack'
  | 'publishing'
  | 'published'
  | 'updating'
  | 'unpublishing'
  | 'storage_unavailable';

export const PUBLISHED_COMPANION_PRESENTATION = {
  no_local_companion: { labelKey: 'published_state_no_local', tone: 'neutral', phase: 'terminal' },
  draft: { labelKey: 'published_state_draft', tone: 'neutral', phase: 'ready' },
  validation_error: { labelKey: 'published_state_validation_error', tone: 'danger', phase: 'error' },
  no_active_pack: { labelKey: 'published_state_no_active_pack', tone: 'warning', phase: 'stale' },
  publishing: { labelKey: 'published_state_publishing', tone: 'info', phase: 'loading' },
  published: { labelKey: 'published_state_published', tone: 'success', phase: 'ready' },
  updating: { labelKey: 'published_state_updating', tone: 'info', phase: 'loading' },
  unpublishing: { labelKey: 'published_state_unpublishing', tone: 'warning', phase: 'loading' },
  storage_unavailable: { labelKey: 'published_state_storage_unavailable', tone: 'danger', phase: 'error' },
} as const satisfies Record<PublishedCompanionUiState, OperationalPresentation>;

export type SocialMutationPhase = 'sending' | 'accepting' | 'rejecting' | 'cancelling' | 'removing' | 'blocking' | 'unblocking' | 'preparing' | 'starting' | 'ending';

export const SOCIAL_MUTATION_PRESENTATION = {
  sending: { labelKey: 'social_mutation_sending', tone: 'info', phase: 'loading' },
  accepting: { labelKey: 'social_mutation_accepting', tone: 'info', phase: 'loading' },
  rejecting: { labelKey: 'social_mutation_rejecting', tone: 'info', phase: 'loading' },
  cancelling: { labelKey: 'social_mutation_cancelling', tone: 'info', phase: 'loading' },
  removing: { labelKey: 'social_mutation_removing', tone: 'warning', phase: 'loading' },
  blocking: { labelKey: 'social_mutation_blocking', tone: 'warning', phase: 'loading' },
  unblocking: { labelKey: 'social_mutation_unblocking', tone: 'info', phase: 'loading' },
  preparing: { labelKey: 'social_mutation_preparing', tone: 'info', phase: 'loading' },
  starting: { labelKey: 'social_mutation_starting', tone: 'info', phase: 'loading' },
  ending: { labelKey: 'social_mutation_ending', tone: 'warning', phase: 'loading' },
} as const satisfies Record<SocialMutationPhase, OperationalPresentation>;

const RETRYABLE_CONNECTION_STATES = new Set<NetworkConnectionState>(['offline', 'reconnecting', 'server_unavailable']);

export function networkStatePresentation(state: NetworkConnectionState): OperationalPresentation {
  return NETWORK_STATE_PRESENTATION[state];
}

export function canRetryNetworkState(state: NetworkConnectionState): boolean {
  return RETRYABLE_CONNECTION_STATES.has(state);
}

export function networkMutationsAllowed(state: NetworkConnectionState): boolean {
  return state === 'online';
}

export function friendPresencePresentation(state?: FriendPresence): OperationalPresentation {
  return state ? FRIEND_PRESENCE_PRESENTATION[state] : { labelKey: 'social_presence_unavailable', tone: 'neutral', phase: 'stale' };
}

export function visitEndReasonPresentation(reason?: string): TranslationKey {
  const known: Record<string, TranslationKey> = {
    host_ended: 'visit_end_host_ended',
    visitor_owner_ended: 'visit_end_owner_ended',
    friendship_removed: 'visit_end_friendship_removed',
    user_blocked: 'visit_end_relationship_unavailable',
    companion_unpublished: 'visit_end_companion_unpublished',
    preparation_timeout: 'visit_end_preparation_timeout',
    session_timeout: 'visit_end_session_timeout',
    heartbeat_timeout: 'visit_end_connection_timeout',
  };
  return reason ? known[reason] ?? 'visit_end_unknown' : 'visit_end_unknown';
}

const VISIT_FAILURE_KEYS: Record<string, TranslationKey> = {
  VISIT_VISUAL_ASSETS_UNAVAILABLE: 'visit_failure_visual_assets',
  VISUAL_VISIT_ASSET_UNAVAILABLE: 'visit_failure_visual_assets',
  VISUAL_VISIT_RENDERER_UNAVAILABLE: 'visit_failure_renderer',
  VISIT_PREPARATION_TIMEOUT: 'visit_end_preparation_timeout',
  VISIT_HEARTBEAT_TIMEOUT: 'visit_end_connection_timeout',
};

export function visitFailurePresentation(code?: string): TranslationKey {
  return code ? VISIT_FAILURE_KEYS[code] ?? 'visit_failure_general' : 'visit_failure_general';
}

const ASSET_FAILURE_KEYS: Record<string, TranslationKey> = {
  ASSET_INTEGRITY_FAILED: 'asset_failure_integrity',
  ASSET_PACK_FILE_MISSING: 'asset_failure_integrity',
  ASSET_PACK_MANIFEST_INVALID: 'asset_failure_integrity',
  ASSET_VERIFICATION_RETRYABLE: 'asset_failure_integrity',
  ASSET_STORAGE_LIMIT_EXCEEDED: 'asset_failure_quota',
  ASSET_PACK_TOO_LARGE: 'asset_failure_quota',
  STORAGE_QUOTA_EXCEEDED: 'asset_failure_quota',
  UPLOAD_SESSION_EXPIRED: 'asset_failure_expired',
  ASSET_UPLOAD_SESSION_EXPIRED: 'asset_failure_expired',
  ASSET_STORAGE_UNAVAILABLE: 'asset_failure_storage',
  SECURE_STORAGE_UNAVAILABLE: 'asset_failure_storage',
};

export function assetFailurePresentation(code?: string): TranslationKey {
  return code ? ASSET_FAILURE_KEYS[code] ?? 'asset_failure_general' : 'asset_failure_general';
}
