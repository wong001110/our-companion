import { describe, expect, it } from 'vitest';
import {
  ASSET_PACK_PRESENTATION,
  ASSET_UPLOAD_PRESENTATION,
  FRIEND_PRESENCE_PRESENTATION,
  NETWORK_STATE_PRESENTATION,
  PUBLISHED_COMPANION_PRESENTATION,
  SOCIAL_MUTATION_PRESENTATION,
  VISIT_INVITATION_PRESENTATION,
  VISIT_SESSION_PRESENTATION,
  assetFailurePresentation,
  canRetryNetworkState,
  friendPresencePresentation,
  networkMutationsAllowed,
  visitEndReasonPresentation,
  visitFailurePresentation,
} from './operationalState';

describe('operational state presentation', () => {
  it('covers every contract-backed state family', () => {
    expect(Object.keys(NETWORK_STATE_PRESENTATION)).toEqual([
      'disabled', 'offline', 'checking_server', 'authentication_required', 'connecting', 'online', 'reconnecting', 'incompatible_client', 'server_unavailable', 'authentication_failed',
    ]);
    expect(Object.keys(FRIEND_PRESENCE_PRESENTATION)).toEqual(['online', 'idle', 'offline']);
    expect(Object.keys(VISIT_INVITATION_PRESENTATION)).toEqual(['pending', 'accepted', 'declined', 'cancelled', 'expired']);
    expect(Object.keys(VISIT_SESSION_PRESENTATION)).toEqual(['preparing', 'ready', 'active', 'ending', 'ended', 'cancelled', 'failed']);
    expect(Object.keys(ASSET_PACK_PRESENTATION)).toEqual(['draft', 'uploading', 'verifying', 'active', 'superseded', 'deleting', 'failed', 'abandoning', 'abandoned']);
    expect(Object.keys(ASSET_UPLOAD_PRESENTATION)).toEqual(['preparing', 'uploading', 'verifying', 'completed', 'failed', 'cancelled']);
    expect(Object.keys(PUBLISHED_COMPANION_PRESENTATION)).toHaveLength(9);
    expect(Object.keys(SOCIAL_MUTATION_PRESENTATION)).toEqual(['sending', 'accepting', 'rejecting', 'cancelling', 'removing', 'blocking', 'unblocking', 'preparing', 'starting', 'ending']);
  });

  it('does not equate Online Mode configuration with a live connection', () => {
    expect(NETWORK_STATE_PRESENTATION.online.tone).toBe('success');
    expect(NETWORK_STATE_PRESENTATION.connecting.tone).not.toBe('success');
    expect(NETWORK_STATE_PRESENTATION.reconnecting.phase).toBe('stale');
    expect(networkMutationsAllowed('online')).toBe(true);
    expect(networkMutationsAllowed('reconnecting')).toBe(false);
  });

  it('limits retry and presence claims to truthful states', () => {
    expect(canRetryNetworkState('server_unavailable')).toBe(true);
    expect(canRetryNetworkState('incompatible_client')).toBe(false);
    expect(friendPresencePresentation(undefined).labelKey).toBe('social_presence_unavailable');
  });

  it('maps allowlisted reasons and hides unknown technical codes', () => {
    expect(visitEndReasonPresentation('heartbeat_timeout')).toBe('visit_end_connection_timeout');
    expect(visitEndReasonPresentation('SECRET_INTERNAL_REASON')).toBe('visit_end_unknown');
    expect(visitFailurePresentation('VISIT_VISUAL_ASSETS_UNAVAILABLE')).toBe('visit_failure_visual_assets');
    expect(visitFailurePresentation('PRIVATE_VISIT_CODE')).toBe('visit_failure_general');
    expect(assetFailurePresentation('ASSET_PACK_MANIFEST_INVALID')).toBe('asset_failure_integrity');
    expect(assetFailurePresentation('R2_OBJECT_KEY_123')).toBe('asset_failure_general');
  });
});
