from pathlib import Path

path = Path('apps/desktop/electron/main/visitActivityLock.test.ts')
source = path.read_text(encoding='utf-8')
old = '''    expect(indexSource).not.toContain("VISIT_RESERVED_ACTIVITY_CHANNELS = new Set([
  'companion:turn'");'''
new = '''    expect(indexSource).not.toContain("'companion:turn',");'''
if old not in source:
    raise SystemExit('Visit activity lock multiline test anchor not found')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
