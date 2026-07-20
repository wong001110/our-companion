import { BROWSER_SEARCH_MAX_QUERY_LENGTH } from './browserSearchTypes';

const DOMAIN_PATTERN = /^[a-z0-9.-]+$/i;

export function cleanBrowserSearchDomain(domain: string): string | undefined {
  const value = domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? '';
  if (!value || !DOMAIN_PATTERN.test(value)) return undefined;
  return value;
}

export function buildBrowserSearchQuery(input: {
  query: string;
  domainHints?: string[];
  excludedDomains?: string[];
}): string {
  const base = input.query.trim();
  if (!base) throw new Error('browser_search_query_empty');
  const hints = (input.domainHints ?? [])
    .map(cleanBrowserSearchDomain)
    .filter((value): value is string => Boolean(value));
  const excluded = (input.excludedDomains ?? [])
    .map(cleanBrowserSearchDomain)
    .filter((value): value is string => Boolean(value));
  const finalQuery = [
    base,
    ...hints.map((domain) => `site:${domain}`),
    ...excluded.map((domain) => `-site:${domain}`),
  ].join(' ').trim();
  if (finalQuery.length > BROWSER_SEARCH_MAX_QUERY_LENGTH) {
    throw new Error('browser_search_query_too_long');
  }
  return finalQuery;
}
