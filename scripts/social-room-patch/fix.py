from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'{label} anchor not found')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


replace_once(
    'apps/desktop/renderer/src/app/CompanionEntryShell.tsx',
    'const presentedVisitTurnRef = useRef<string>();',
    'const presentedVisitTurnRef = useRef<string | undefined>(undefined);',
    'presented Visit turn ref',
)
replace_once(
    'apps/desktop/electron/main/network/visitService.social.test.ts',
    "    getStatusSnapshot: vi.fn().mockReturnValue({ visit: { heartbeatIntervalSeconds: 60 } }),\n    listVisitSessions: vi.fn().mockResolvedValue([]),",
    "    getStatusSnapshot: vi.fn().mockReturnValue({ visit: { heartbeatIntervalSeconds: 60 } }),\n    getVisitReservation: vi.fn().mockResolvedValue({ locked: false }),\n    listVisitSessions: vi.fn().mockResolvedValue([]),",
    'Visit reservation test mock',
)
