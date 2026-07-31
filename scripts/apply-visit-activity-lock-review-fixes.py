from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'anchor not found in {path}: {old[:180]!r}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    const result = await this.network.acceptVisitInvitation(invitationId);
    this.track(result.session);
    this.activityLock = {
      locked: true,
      kind: 'session_participant',
      networkCompanionId: result.session.networkCompanionId,
      sessionId: result.session.id,
      updatedAt: result.session.updatedAt,
    };''',
    '''    const result = await this.network.acceptVisitInvitation(invitationId);
    this.track(result.session);
    // The accepted Session summary identifies the visiting Companion, which is
    // not necessarily this device's Host Companion. Keep the lock immediately
    // without publishing a misleading Companion ID; server reconciliation fills it.
    this.activityLock = {
      locked: true,
      kind: 'session_participant',
      sessionId: result.session.id,
      updatedAt: result.session.updatedAt,
    };''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    const invitation = await this.network.declineVisitInvitation(invitationId);
    await this.refreshActivityLock();
    return invitation;''',
    '''    const invitation = await this.network.declineVisitInvitation(invitationId);
    void this.refreshActivityLock().catch(() => undefined);
    return invitation;''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    ''') void services.visits.refreshActivityLock();''',
    ''') void services.visits.refreshActivityLock().catch(() => undefined);''',
)
replace_once(
    'apps/desktop/electron/main/index.ts',
    '''      void services.network.enableOnlineMode().then(() => services.visits.reconcile());''',
    '''      void services.network.enableOnlineMode()
        .then(() => services.visits.reconcile())
        .catch(() => undefined);''',
)

spec = Path('apps/desktop/electron/main/visitActivityLock.test.ts')
source = spec.read_text(encoding='utf-8')
old = '''    expect(visitSource).toContain('void this.refreshActivityLock().catch(() => undefined)');'''
new = '''    expect(visitSource).toContain('void this.refreshActivityLock().catch(() => undefined)');
    expect(visitSource).toContain('not necessarily this device\\'s Host Companion');
    expect(indexSource).toContain('refreshActivityLock().catch(() => undefined)');'''
if old not in source:
    raise SystemExit('Visit activity review test anchor not found')
spec.write_text(source.replace(old, new, 1), encoding='utf-8')
