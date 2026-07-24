export type BrowserSearchErrorCode =
  | 'browser_search_timeout'
  | 'browser_search_navigation_failed'
  | 'browser_search_http_blocked'
  | 'browser_search_challenge'
  | 'browser_search_parse_failed'
  | 'browser_search_no_results'
  | 'browser_search_destroyed'
  | 'browser_search_rate_limited'
  | 'browser_search_unavailable';

export type BrowserSearchChallengeKind = 'captcha' | 'rate_limit' | 'access_denied';

export interface BrowserSearchChallenge {
  kind: BrowserSearchChallengeKind;
  matchedText: string;
}

export interface BrowserSearchExtractedResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}

export class BrowserSearchError extends Error {
  constructor(readonly code: BrowserSearchErrorCode, message: string = code) {
    super(message);
    this.name = 'BrowserSearchError';
  }
}

export const BROWSER_SEARCH_PROVIDER_ID = 'electron-browser-search';
export const BROWSER_SEARCH_HARD_TIMEOUT_MS = 10_000;
export const BROWSER_SEARCH_MIN_INTERVAL_MS = 2_000;
export const BROWSER_SEARCH_HOURLY_BUDGET = 10;
export const BROWSER_SEARCH_COOLDOWN_MS = 30 * 60_000;
export const BROWSER_SEARCH_MAX_QUERY_LENGTH = 420;
