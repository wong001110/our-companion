from pathlib import Path

path = Path('apps/desktop/electron/main/researchOrchestrator.ts')
source = path.read_text(encoding='utf-8')
old = """        const unseenFound = found.filter((result) => !classifyPreviouslySeenSearchResult(
          result,
          input.seenDiscoveryEntries ?? [],
          {
            allowSeenCanonicalUrl: input.materialUpdateProbe,
            allowSeenSemanticTitle: input.materialUpdateProbe,
          },
        ).seen);
"""
new = """        const unseenFound = found.filter((result) => {
          const canonicalUrl = normalizeDiscoveryUrl(result.url) ?? result.url;
          return !classifyPreviouslySeenSearchResult(
            result,
            input.seenDiscoveryEntries ?? [],
            {
              // Keep one explicitly bounded same-URL verification probe available
              // to the existing page selector. Mirror URLs and semantic repeats
              // remain excluded unless this cycle explicitly requires an update.
              allowSeenCanonicalUrl: input.materialUpdateProbe || historicalSeenUrls.has(canonicalUrl),
              allowSeenSemanticTitle: input.materialUpdateProbe,
            },
          ).seen;
        });
"""
if old not in source:
    raise SystemExit('Discovery search prefilter anchor not found')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
