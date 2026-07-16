import { describe, expect, it } from 'vitest';
import type { AssetUploadProgress, NetworkAssetPack, PublicCompanionProfile } from '@our-companion/shared';
import { assetFailureCode, publicationUiState, uploadFeedbackMode } from './PublishedCompanionSection';

const profile: PublicCompanionProfile & { assetPacks: NetworkAssetPack[] } = {
  id: 'profile-1', ownerUserId: 'owner-1', name: 'Mira', publicTags: [], visibility: 'friends_only', published: true,
  activeAssetPackId: 'pack-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  assetPacks: [{ id: 'pack-1', companionId: 'profile-1', manifestHash: 'private', schemaVersion: 1, status: 'active', totalFiles: 3, totalBytes: 42, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
};

describe('Published Companion lifecycle presentation', () => {
  it('distinguishes local draft, active publication, update, and unpublish states', () => {
    expect(publicationUiState(0, undefined, 'idle')).toBe('no_local_companion');
    expect(publicationUiState(1, undefined, 'idle')).toBe('draft');
    expect(publicationUiState(1, undefined, 'idle', undefined, true)).toBe('validation_error');
    expect(publicationUiState(1, { activeNetworkCompanionId: profile.id, companions: [profile] }, 'idle')).toBe('published');
    expect(publicationUiState(1, { activeNetworkCompanionId: profile.id, companions: [profile] }, 'publishing')).toBe('updating');
    expect(publicationUiState(1, { activeNetworkCompanionId: profile.id, companions: [profile] }, 'unpublishing')).toBe('unpublishing');
  });

  it('uses determinate progress only when upload byte totals are available', () => {
    const base: AssetUploadProgress = { completedFiles: 0, totalFiles: 4, uploadedBytes: 0, totalBytes: 100, state: 'uploading' };
    expect(uploadFeedbackMode(base)).toBe('determinate');
    expect(uploadFeedbackMode({ ...base, totalBytes: 0 })).toBe('indeterminate');
    expect(uploadFeedbackMode({ ...base, state: 'verifying' })).toBe('indeterminate');
    expect(uploadFeedbackMode({ ...base, state: 'failed' })).toBe('terminal');
    expect(uploadFeedbackMode({ ...base, state: 'cancelled' })).toBe('terminal');
    expect(uploadFeedbackMode(undefined)).toBe('none');
  });

  it('recovers a safe structured code from Electron IPC error serialization', () => {
    expect(assetFailureCode(new Error("Error invoking remote method 'network:assets:publish': Error: ASSET_INTEGRITY_FAILED"))).toBe('ASSET_INTEGRITY_FAILED');
    expect(assetFailureCode(new Error('private implementation detail'))).toBe('private implementation detail');
  });
});
