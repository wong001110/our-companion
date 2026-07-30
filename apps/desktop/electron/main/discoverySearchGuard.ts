import { normalizeDiscoveryUrl } from '@our-companion/discovery-engine';

export const MAX_DISCOVERY_SEARCH_ATTEMPTS = 3;

export interface SeenDiscoverySearchEntry {
  canonicalUrl?: string;
  title: string;
  summary?: string;
  tags?: readonly string[];
}

export type SeenDiscoveryMatchReason = 'canonical_url' | 'semantic_title';

export function clampDiscoverySearchAttempts(value: number | undefined): number {
  if (!Number.isFinite(value)) return MAX_DISCOVERY_SEARCH_ATTEMPTS;
  return Math.max(1, Math.min(MAX_DISCOVERY_SEARCH_ATTEMPTS, Math.floor(value!)));
}

export function classifyPreviouslySeenSearchResult(
  candidate: { url?: string; title: string },
  seen: readonly SeenDiscoverySearchEntry[],
  options: { allowSeenCanonicalUrl?: boolean } = {},
): { seen: boolean; reason?: SeenDiscoveryMatchReason } {
  const candidateUrl = normalizeDiscoveryUrl(candidate.url);
  const candidateTitle = candidate.title.trim();

  for (const entry of seen) {
    if (!options.allowSeenCanonicalUrl && candidateUrl) {
      const seenUrl = normalizeDiscoveryUrl(entry.canonicalUrl);
      if (seenUrl && seenUrl === candidateUrl) {
        return { seen: true, reason: 'canonical_url' };
      }
    }

    if (semanticallyEquivalentTitle(candidateTitle, entry.title)) {
      return { seen: true, reason: 'semantic_title' };
    }
  }

  return { seen: false };
}

export function semanticallyEquivalentTitle(left: string, right: string): boolean {
  const leftCompact = compactSemanticText(left);
  const rightCompact = compactSemanticText(right);
  if (!leftCompact || !rightCompact) return false;
  if (leftCompact === rightCompact) return true;

  const shorter = leftCompact.length <= rightCompact.length ? leftCompact : rightCompact;
  const longer = leftCompact.length > rightCompact.length ? leftCompact : rightCompact;
  if (shorter.length >= 12 && longer.includes(shorter) && shorter.length / longer.length >= 0.85) {
    return true;
  }

  const leftTokens = semanticTokens(left);
  const rightTokens = semanticTokens(right);
  if (leftTokens.size < 3 || rightTokens.size < 3) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection >= 3 && intersection / union >= 0.82;
}

function compactSemanticText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function semanticTokens(value: string): Set<string> {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return new Set();

  const words = normalized.split(' ').filter((token) => token.length >= 2);
  if (words.length > 1) return new Set(words);

  const compact = compactSemanticText(normalized);
  const han = [...compact].every((character) => /\p{Script=Han}/u.test(character));
  if (!han || compact.length < 4) return new Set(words);
  const bigrams = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    bigrams.add(compact.slice(index, index + 2));
  }
  return bigrams;
}
