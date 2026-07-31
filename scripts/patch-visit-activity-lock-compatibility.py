from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'anchor not found in {path}: {old[:180]!r}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    const getReservation = this.network.getVisitReservation;
    const serverReservation = typeof getReservation === 'function'
      ? await getReservation.call(this.network)
      : undefined;
    if (serverReservation) {''',
    '''    const getReservation = this.network.getVisitReservation;
    let serverReservation: VisitReservationSummary | undefined;
    try {
      serverReservation = typeof getReservation === 'function'
        ? await getReservation.call(this.network)
        : undefined;
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      if (code.includes('ONLINE_MODE_DISABLED') || code.includes('NETWORK_')) return this.getActivityLock();
      throw error;
    }
    if (serverReservation) {''',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '''    const [outgoing, sessions] = await Promise.all([
      this.network.listVisitInvitations({ direction: 'outgoing', status: 'pending' }),
      this.network.listVisitSessions(),
    ]);
    const session = sessions.find((candidate) => LIVE_STATES.has(candidate.state));
    const invitation = outgoing.find((candidate) => candidate.status === 'pending');''',
    '''    let outgoing: VisitInvitationSummary[] = [];
    let sessions: VisitSessionSummary[] = [];
    try {
      const results = await Promise.all([
        this.network.listVisitInvitations({ direction: 'outgoing', status: 'pending' }),
        this.network.listVisitSessions(),
      ]);
      outgoing = Array.isArray(results[0]) ? results[0] : [];
      sessions = Array.isArray(results[1]) ? results[1] : [];
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      if (code.includes('ONLINE_MODE_DISABLED') || code.includes('NETWORK_')) return this.getActivityLock();
      throw error;
    }
    const session = sessions.find((candidate) => LIVE_STATES.has(candidate.state));
    const invitation = outgoing.find((candidate) => candidate.status === 'pending');''',
)

# The reservation error replaces the old host-specific switch error.
test = Path('apps/desktop/electron/main/network/visitService.test.ts')
source = test.read_text(encoding='utf-8')
old = "await expect(service.assertCanSwitchLocalCompanion()).rejects.toThrow('VISIT_HOST_COMPANION_SWITCH_BLOCKED');"
new = "await expect(service.assertCanSwitchLocalCompanion()).rejects.toThrow('VISIT_COMPANION_RESERVED');"
if old not in source:
    raise SystemExit('Visit switch error assertion anchor not found')
test.write_text(source.replace(old, new, 1), encoding='utf-8')

contract = Path('apps/desktop/electron/main/visitActivityLock.test.ts')
source = contract.read_text(encoding='utf-8')
old = '''    expect(visitSource).toContain("typeof getReservation === 'function'");
  });'''
new = '''    expect(visitSource).toContain("typeof getReservation === 'function'");
    expect(visitSource).toContain("Array.isArray(results[0])");
    expect(visitSource).toContain("code.includes('ONLINE_MODE_DISABLED')");
  });'''
if old not in source:
    raise SystemExit('Visit compatibility contract anchor not found')
contract.write_text(source.replace(old, new, 1), encoding='utf-8')
