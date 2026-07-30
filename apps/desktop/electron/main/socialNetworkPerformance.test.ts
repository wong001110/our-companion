import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const connection = readFileSync(new URL('./networkConnection.ts', import.meta.url), 'utf8');
const socialVisit = readFileSync(new URL('../../renderer/src/features/social/SocialVisitConversation.tsx', import.meta.url), 'utf8');

describe('Social Network performance contract', () => {
  it('uses one overview endpoint for the Social dashboard', () => {
    expect(connection).toContain("/api/friends/overview");
    const viewModel = readFileSync(new URL('../../renderer/src/features/social/useSocialViewModel.ts', import.meta.url), 'utf8');
    expect(viewModel).toContain('pre-overview Network server returns 404');
    expect(viewModel).toContain('Promise.allSettled');
  });
  it('uses socket invalidation and a 30 second repair read instead of 1.5 second polling', () => {
    expect(socialVisit).toContain("invalidation?.type === 'visit_session'");
    expect(socialVisit).toContain('30_000');
    expect(socialVisit).not.toContain('1_500');
  });
});
