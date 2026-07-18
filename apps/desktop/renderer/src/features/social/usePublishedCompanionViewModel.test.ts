import { describe, expect, it } from 'vitest';
import type { NetworkStatus } from '@our-companion/shared';
import {
  publishedCompanionDataMatchesScope,
  publishedCompanionScopeKey,
} from './usePublishedCompanionViewModel';

function status(serverUrl: string, accountId: string): NetworkStatus {
  return {
    state: 'online',
    onlineModeEnabled: true,
    serverUrl,
    account: { id: accountId, email: 'private@example.test', username: 'Mira', uid: 'OC-MIRA8XYZ', friendCode: 'MIRA0001' },
  };
}

describe('Published Companion data scope', () => {
  it('binds the publication snapshot to both server and account', () => {
    const firstScope = publishedCompanionScopeKey(status('https://one.example', 'account-1'));
    expect(publishedCompanionDataMatchesScope(status('https://one.example', 'account-1'), firstScope)).toBe(true);
    expect(publishedCompanionDataMatchesScope(status('https://two.example', 'account-1'), firstScope)).toBe(false);
    expect(publishedCompanionDataMatchesScope(status('https://one.example', 'account-2'), firstScope)).toBe(false);
  });

  it('does not expose retained publication data without an account', () => {
    expect(publishedCompanionScopeKey({ state: 'authentication_required', onlineModeEnabled: true, serverUrl: 'https://one.example' })).toBeUndefined();
    expect(publishedCompanionDataMatchesScope(undefined, 'stale-scope')).toBe(false);
  });
});
