import type { WebContents } from 'electron';
import type { BrowserSearchChallenge, BrowserSearchExtractedResult } from './browserSearchTypes';

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

  waitForResults(input: {
    webContents: WebContents;
    timeoutMs: number;
  }): Promise<void>;

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
