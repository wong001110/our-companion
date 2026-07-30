from pathlib import Path

path = Path('apps/desktop/electron/main/researchOrchestrator.test.ts')
source = path.read_text(encoding='utf-8')
old = "import type { DiscoveryBase, DiscoveryConnector } from '@our-companion/discovery-engine';\n"
new = "import { normalizeDiscoveryUrl, type DiscoveryBase, type DiscoveryConnector } from '@our-companion/discovery-engine';\n"
if old not in source:
    raise SystemExit('Research test discovery-engine import anchor not found')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
