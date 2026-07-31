from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'anchor not found in {path}: {old[:180]!r}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


# Test doubles and older Network clients may not yet expose the reservation route.
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    const serverReservation = await this.network.getVisitReservation();
    if (serverReservation) {''',
    '''    const getReservation = this.network.getVisitReservation;
    const serverReservation = typeof getReservation === 'function'
      ? await getReservation.call(this.network)
      : undefined;
    if (serverReservation) {''',
)

# A temporary disconnect must not clear an already-known reservation. The server
# remains authoritative once the authenticated transport is back online.
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    if (!status.onlineModeEnabled || status.state !== 'online' || !status.account) {
      this.activityLock = { locked: false };
      return this.getActivityLock();
    }''',
    '''    if (!status.onlineModeEnabled || status.state !== 'online' || !status.account) {
      return this.getActivityLock();
    }''',
)

# Lock immediately after the mutation succeeds. Reconciliation is best-effort and
# must not turn a successful Visit mutation into a false client failure.
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    const invitation = await this.network.createVisitInvitation(hostUserId);
    await this.refreshActivityLock();
    return invitation;''',
    '''    const invitation = await this.network.createVisitInvitation(hostUserId);
    this.activityLock = {
      locked: true,
      kind: 'outgoing_invitation',
      networkCompanionId: invitation.networkCompanionId,
      invitationId: invitation.id,
      expiresAt: invitation.expiresAt,
      updatedAt: invitation.updatedAt,
    };
    void this.refreshActivityLock().catch(() => undefined);
    return invitation;''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    this.track(result.session);
    await this.refreshActivityLock();
    return result;''',
    '''    this.track(result.session);
    this.activityLock = {
      locked: true,
      kind: 'session_participant',
      networkCompanionId: result.session.networkCompanionId,
      sessionId: result.session.id,
      updatedAt: result.session.updatedAt,
    };
    void this.refreshActivityLock().catch(() => undefined);
    return result;''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    const invitation = await this.network.cancelVisitInvitation(invitationId);
    await this.refreshActivityLock();
    return invitation;''',
    '''    const invitation = await this.network.cancelVisitInvitation(invitationId);
    if (this.activityLock.invitationId === invitationId) this.activityLock = { locked: false };
    void this.refreshActivityLock().catch(() => undefined);
    return invitation;''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    const updated = await this.network.endVisitSession(sessionId);
    this.track(updated);
    await this.refreshActivityLock();
    return updated;''',
    '''    const updated = await this.network.endVisitSession(sessionId);
    this.track(updated);
    if (this.activityLock.sessionId === sessionId) this.activityLock = { locked: false };
    void this.refreshActivityLock().catch(() => undefined);
    return updated;''',
)

# Reconnect regression now includes one reservation read per reconciliation.
test = Path('apps/desktop/electron/main/networkConnection.test.ts')
source = test.read_text(encoding='utf-8')
old_chain = '''        .mockResolvedValueOnce(response([session]))
        .mockResolvedValueOnce(response(session))
        .mockResolvedValueOnce(response({ compatible: true, visit: { heartbeatIntervalSeconds: 5, heartbeatTimeoutSeconds: 30 } }))
        .mockResolvedValueOnce(response([session]))
        .mockResolvedValueOnce(response(session));'''
new_chain = '''        .mockResolvedValueOnce(response([session]))
        .mockResolvedValueOnce(response({ locked: true, kind: 'session_participant', networkCompanionId: 'companion-1', sessionId: 'session-1' }))
        .mockResolvedValueOnce(response(session))
        .mockResolvedValueOnce(response({ compatible: true, visit: { heartbeatIntervalSeconds: 5, heartbeatTimeoutSeconds: 30 } }))
        .mockResolvedValueOnce(response([session]))
        .mockResolvedValueOnce(response({ locked: true, kind: 'session_participant', networkCompanionId: 'companion-1', sessionId: 'session-1' }))
        .mockResolvedValueOnce(response(session));'''
if old_chain not in source:
    raise SystemExit('Network reconnect response chain anchor not found')
source = source.replace(old_chain, new_chain, 1)
source = source.replace('expect(fetch).toHaveBeenCalledTimes(5);', 'expect(fetch).toHaveBeenCalledTimes(6);', 1)
source = source.replace("expect(fetch.mock.calls[5][0]).toBe('http://localhost:3001/api/meta/client-compatibility');", "expect(fetch.mock.calls[6][0]).toBe('http://localhost:3001/api/meta/client-compatibility');", 1)
source = source.replace('expect(fetch).toHaveBeenCalledTimes(8);', 'expect(fetch).toHaveBeenCalledTimes(10);', 1)
test.write_text(source, encoding='utf-8')

# Protect optimistic and conservative lock semantics.
contract = Path('apps/desktop/electron/main/visitActivityLock.test.ts')
source = contract.read_text(encoding='utf-8')
old = '''    expect(visitSource).toContain('VISIT_COMPANION_RESERVED');
  });'''
new = '''    expect(visitSource).toContain('VISIT_COMPANION_RESERVED');
    expect(visitSource).toContain("kind: 'outgoing_invitation'");
    expect(visitSource).toContain("kind: 'session_participant'");
    expect(visitSource).toContain('void this.refreshActivityLock().catch(() => undefined)');
    expect(visitSource).toContain("typeof getReservation === 'function'");
  });'''
if old not in source:
    raise SystemExit('Visit activity lock contract anchor not found')
contract.write_text(source.replace(old, new, 1), encoding='utf-8')
