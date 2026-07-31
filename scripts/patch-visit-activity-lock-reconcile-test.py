from pathlib import Path

path = Path('apps/desktop/electron/main/network/visitService.test.ts')
source = path.read_text(encoding='utf-8')
old = '''    expect(network.listVisitSessions).toHaveBeenCalledTimes(2);'''
new = '''    // Two reconciliation passes plus one legacy reservation derivation per pass.
    expect(network.listVisitSessions).toHaveBeenCalledTimes(4);'''
if old not in source:
    raise SystemExit('Visit reconcile count assertion anchor not found')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
