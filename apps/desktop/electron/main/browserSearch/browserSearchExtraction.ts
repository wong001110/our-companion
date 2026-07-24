import { load, type Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import { createId } from '@our-companion/shared';
import type { WebSearchResult } from '@our-companion/shared';
import type { BrowserSearchExtractedResult } from './browserSearchTypes';

const MAX_TITLE_LENGTH = 240;
const MAX_SNIPPET_LENGTH = 420;

export function decodeSearchRedirectUrl(rawUrl: string, pageUrl?: string): string | undefined {
  try {
    const parsed = new URL(rawUrl, pageUrl);
    if (parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
      const redirected = parsed.searchParams.get('uddg');
      if (redirected) return decodeSearchRedirectUrl(redirected);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function normalizeBrowserSearchUrl(rawUrl: string, pageUrl?: string): string | undefined {
  const resolved = decodeSearchRedirectUrl(rawUrl.trim(), pageUrl);
  if (!resolved) return undefined;
  try {
    const parsed = new URL(resolved);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function extractOrganicResultsFromHtml(input: {
  html: string;
  pageUrl: string;
  limit: number;
  isSponsored?: (element: Cheerio<Element>) => boolean;
  pickLink?: (element: Cheerio<Element>) => { href?: string; title?: string; snippet?: string } | null;
}): BrowserSearchExtractedResult[] {
  const $ = load(input.html);
  const results: BrowserSearchExtractedResult[] = [];
  const seen = new Set<string>();
  const nodes = $('.result').toArray();
  for (const node of nodes) {
    const element = $(node);
    if (input.isSponsored?.(element)) continue;
    const picked = input.pickLink?.(element) ?? defaultPickLink(element, input.pageUrl);
    if (!picked?.href || !picked.title) continue;
    const url = normalizeBrowserSearchUrl(picked.href, input.pageUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title: boundText(picked.title, MAX_TITLE_LENGTH),
      url,
      snippet: picked.snippet ? boundText(picked.snippet, MAX_SNIPPET_LENGTH) : undefined,
    });
    if (results.length >= input.limit) break;
  }
  return results;
}

function defaultPickLink(
  element: Cheerio<Element>,
  pageUrl: string,
): { href?: string; title?: string; snippet?: string } | null {
  const link = element.find('a.result__a').first();
  const href = link.attr('href') ?? undefined;
  const title = link.text().trim() || undefined;
  const snippet = element.find('.result__snippet').first().text().trim() || undefined;
  if (!href || !title) return null;
  return { href, title, snippet };
}

function boundText(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export function toWebSearchResults(input: {
  query: string;
  providerId: string;
  results: BrowserSearchExtractedResult[];
}): WebSearchResult[] {
  return input.results.map((result, index) => {
    const parsed = new URL(result.url);
    return {
      id: createId('search_result'),
      query: input.query,
      title: result.title,
      url: result.url,
      domain: parsed.hostname.toLowerCase(),
      snippet: result.snippet,
      publishedAt: result.publishedAt,
      rank: index + 1,
      provider: input.providerId,
    };
  });
}
