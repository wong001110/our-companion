import type { WebContents } from 'electron';
import type { BrowserSearchChallenge, BrowserSearchExtractedResult } from './browserSearchTypes';

export type ResultState = 'loading' | 'results' | 'no_results';

export interface BrowserSearchEngineAdapter {
  id: string;
  version: number;

  buildSearchUrl(input: {
    query: string;
    limit: number;
    language?: string;
    freshnessDays?: number;
  }): URL;

  allowedNavigationHosts: string[];

  detectResultState(input: {
    webContents: WebContents;
  }): Promise<ResultState>;

  detectChallenge(input: {
    url: string;
    title: string;
    visibleText: string;
  }): BrowserSearchChallenge | null;

  extractResults(input: {
    webContents: WebContents;
    limit: number;
  }): Promise<BrowserSearchExtractedResult[]>;
}
