from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'Fix anchor not found in {path}: {old!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'apps/desktop/electron/main/network/visitService.ts',
    '      summary: discovery.summary.slice(0, 600),',
    '      summary: (discovery.summary ?? discovery.whyThisMatters ?? discovery.title).slice(0, 600),',
)
replace_once(
    'apps/desktop/renderer/src/features/social/SocialVisitConversation.tsx',
    '  const requestedSequence = useRef<number>();',
    '  const requestedSequence = useRef<number | undefined>(undefined);',
)
replace_once(
    'apps/desktop/renderer/src/pages/SocialPage.tsx',
    'map((item) => ({ id: item.id, title: item.title, summary: item.summary }));',
    'map((item) => ({ id: item.id, title: item.title, summary: item.summary ?? item.title }));',
)
Path('.github/agent/fix-social-visit-typecheck.py').unlink(missing_ok=True)
