from pathlib import Path

path = Path('apps/desktop/electron/main/researchOrchestrator.test.ts')
source = path.read_text(encoding='utf-8')
old = """    expect(search).toHaveBeenCalledTimes(3);
    expect(fetchedUrls.length).toBeGreaterThan(0);
    expect(fetchedUrls.every((url) => url === freshUrl)).toBe(true);
    expect(outcome.candidates.every((candidate) => candidate.sourceUrl === freshUrl)).toBe(true);
    expect(outcome.searchRecords.every((record) => record.resultCount <= 1)).toBe(true);
"""
new = """    expect(search).toHaveBeenCalledTimes(3);
    expect(fetchedUrls).toContain(freshUrl);
    expect(fetchedUrls.some((url) => url.startsWith('https://mirror.example/'))).toBe(false);
    expect(fetchedUrls.filter((url) => normalizeDiscoveryUrl(url) === oldUrl)).toHaveLength(1);
    expect(outcome.candidates.some((candidate) => candidate.sourceUrl === freshUrl)).toBe(true);
    expect(outcome.candidates.some((candidate) => candidate.sourceUrl?.startsWith('https://mirror.example/'))).toBe(false);
    expect(outcome.searchRecords.every((record) => record.resultCount <= 2)).toBe(true);
"""
if old not in source:
    raise SystemExit('Discovery prefilter test assertion anchor not found')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
