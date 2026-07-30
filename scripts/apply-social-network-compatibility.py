from pathlib import Path

path = Path('apps/desktop/electron/main/network/visitService.ts')
source = path.read_text(encoding='utf-8')
old = '''    const next = await this.network.appendVisitSocialTurn(sessionId, {
      clientTurnId: randomUUID(),
      intent: proposal.intent,
      message: proposal.message,
      emotion: proposal.emotion,
      topic: proposal.topic,
    }) as SocialVisitState;
    return {
      ...next,
      privateReflection: this.db?.getAppSetting<string>(`${REFLECTION_PREFIX}${sessionId}`),
    };'''
new = '''    const appended = await this.network.appendVisitSocialTurn(sessionId, {
      clientTurnId: randomUUID(),
      intent: proposal.intent,
      message: proposal.message,
      emotion: proposal.emotion,
      topic: proposal.topic,
    });
    // During a rolling deployment an older Network server returns only the
    // appended turn. Newer servers return the full state and save one request.
    const next = isSocialVisitState(appended)
      ? appended
      : await this.network.getVisitSocialState(sessionId) as SocialVisitState;
    return {
      ...next,
      privateReflection: this.db?.getAppSetting<string>(`${REFLECTION_PREFIX}${sessionId}`),
    };'''
if old not in source:
    raise SystemExit('respondSocial optimized response anchor not found')
source = source.replace(old, new, 1)
anchor = '''type PendingShare = {'''
helper = '''function isSocialVisitState(value: unknown): value is SocialVisitState {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SocialVisitState>;
  return typeof record.sessionId === 'string'
    && typeof record.maxTurns === 'number'
    && Array.isArray(record.turns);
}

'''
if anchor not in source:
    raise SystemExit('SocialVisitState helper anchor not found')
source = source.replace(anchor, helper + anchor, 1)
path.write_text(source, encoding='utf-8')

view_model = Path('apps/desktop/renderer/src/features/social/useSocialViewModel.ts')
view_source = view_model.read_text(encoding='utf-8')
overview_old = '''      const getOverview = window.ourCompanion.network.friends.getOverview;
      if (typeof getOverview === 'function') {
        const overview = await getOverview();
        if (scopeAtStart !== scopeRef.current) return;
        setFriends(overview.friends);
        setIncoming(overview.incomingRequests);
        setOutgoing(overview.outgoingRequests);
        setBlocked(overview.blockedUsers);
        setVisitIncoming(overview.visitInvitations.incoming);
        setVisitOutgoing(overview.visitInvitations.outgoing);
        setVisitSessions(overview.visitSessions);
        setDomainErrors({});
        setLoadedDomains({
          friends: true,
          presence: true,
          incomingRequests: true,
          outgoingRequests: true,
          blockedUsers: true,
          incomingVisitInvitations: true,
          outgoingVisitInvitations: true,
          visitSessions: true,
        });
        setDataScope(scopeAtStart);
        setHasLoaded(true);
        setLastSynchronizedAt(overview.synchronizedAt);
        return;
      }

      // Compatibility with a pre-overview server during rolling deployment.'''
overview_new = '''      const getOverview = window.ourCompanion.network.friends.getOverview;
      if (typeof getOverview === 'function') {
        try {
          const overview = await getOverview();
          if (scopeAtStart !== scopeRef.current) return;
          setFriends(overview.friends);
          setIncoming(overview.incomingRequests);
          setOutgoing(overview.outgoingRequests);
          setBlocked(overview.blockedUsers);
          setVisitIncoming(overview.visitInvitations.incoming);
          setVisitOutgoing(overview.visitInvitations.outgoing);
          setVisitSessions(overview.visitSessions);
          setDomainErrors({});
          setLoadedDomains({
            friends: true,
            presence: true,
            incomingRequests: true,
            outgoingRequests: true,
            blockedUsers: true,
            incomingVisitInvitations: true,
            outgoingVisitInvitations: true,
            visitSessions: true,
          });
          setDataScope(scopeAtStart);
          setHasLoaded(true);
          setLastSynchronizedAt(overview.synchronizedAt);
          return;
        } catch {
          // A pre-overview Network server returns 404. Continue with the legacy
          // bounded fan-out until Railway finishes the rolling deployment.
        }
      }

      // Compatibility with a pre-overview server during rolling deployment.'''
if overview_old not in view_source:
    raise SystemExit('Social overview rolling fallback anchor not found')
view_model.write_text(view_source.replace(overview_old, overview_new, 1), encoding='utf-8')

test = Path('apps/desktop/electron/main/network/visitService.social.test.ts')
test_source = test.read_text(encoding='utf-8')
marker = "describe('VisitService social MVP', () => {"
if marker not in test_source:
    raise SystemExit('VisitService social test suite anchor not found')
if 'rolling Network deployment' not in test_source:
    test_source = test_source.replace(marker, marker + "\n  it('keeps a rolling Network deployment fallback for legacy turn responses', () => {\n    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'visitService.ts'), 'utf8');\n    expect(source).toContain('isSocialVisitState(appended)');\n    expect(source).toContain('getVisitSocialState(sessionId)');\n  });\n", 1)
    test.write_text(test_source, encoding='utf-8')

performance_test = Path('apps/desktop/electron/main/socialNetworkPerformance.test.ts')
performance_source = performance_test.read_text(encoding='utf-8')
if 'pre-overview Network server returns 404' not in performance_source:
    performance_source = performance_source.replace(
        "    expect(connection).toContain(\"/api/friends/overview\");\n",
        "    expect(connection).toContain(\"/api/friends/overview\");\n    const viewModel = readFileSync(new URL('../../renderer/src/features/social/useSocialViewModel.ts', import.meta.url), 'utf8');\n    expect(viewModel).toContain('pre-overview Network server returns 404');\n    expect(viewModel).toContain('Promise.allSettled');\n",
        1,
    )
    performance_test.write_text(performance_source, encoding='utf-8')
