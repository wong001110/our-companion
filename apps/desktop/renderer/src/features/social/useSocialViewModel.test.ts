import { describe, expect, it } from 'vitest';
import type { NetworkStatus } from '@our-companion/shared';
import { socialDataMatchesScope, socialScopeKey } from './useSocialViewModel';

function status(serverUrl: string, accountId: string): NetworkStatus {
  return {
    state: 'online',
    onlineModeEnabled: true,
    serverUrl,
    account: { id: accountId, email: 'private@example.test', username: 'Mira', friendCode: 'MIRA0001' },
  };
}

describe('Social data scope', () => {
  it('binds retained data to both server and account', () => {
    const first = status('https://one.example', 'account-1');
    const firstScope = socialScopeKey(first);
    expect(socialDataMatchesScope(first, firstScope)).toBe(true);
    expect(socialDataMatchesScope(status('https://two.example', 'account-1'), firstScope)).toBe(false);
    expect(socialDataMatchesScope(status('https://one.example', 'account-2'), firstScope)).toBe(false);
  });

  it('never treats accountless status as a retained-data scope', () => {
    expect(socialScopeKey({ state: 'authentication_required', onlineModeEnabled: true, serverUrl: 'https://one.example' })).toBeUndefined();
    expect(socialDataMatchesScope(undefined, 'stale-scope')).toBe(false);
  });
});
