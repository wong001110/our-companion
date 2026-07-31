from pathlib import Path

path = Path('apps/desktop/renderer/src/app/CompanionEntryShell.tsx')
source = path.read_text(encoding='utf-8')
old = 'const presentedVisitTurnRef = useRef<string>();'
new = 'const presentedVisitTurnRef = useRef<string | undefined>(undefined);'
if old not in source:
    raise SystemExit('presented Visit turn ref anchor not found')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
