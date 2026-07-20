import { detectBrowserSearchChallenge } from '../browserSearchChallenge';
import { extractOrganicResultsFromHtml } from '../browserSearchExtraction';
import type { BrowserSearchEngineAdapter, ResultState } from '../BrowserSearchEngineAdapter';

export const DUCKDUCKGO_HTML_ADAPTER_ID = 'duckduckgo-html';

/** DuckDuckGo HTML lite — no API key, no login, public organic results only. */
export class DuckDuckGoHtmlAdapter implements BrowserSearchEngineAdapter {
  readonly id = DUCKDUCKGO_HTML_ADAPTER_ID;
  readonly version = 1;
  readonly allowedNavigationHosts = ['html.duckduckgo.com', 'duckduckgo.com'];

  buildSearchUrl(input: { query: string; limit: number; language?: string }): URL {
    const url = new URL('https://html.duckduckgo.com/html/');
    url.searchParams.set('q', input.query);
    url.searchParams.set('kl', input.language === 'zh-CN' ? 'cn-zh' : 'us-en');
    return url;
  }

  async detectResultState(input: { webContents: import('electron').WebContents }): Promise<ResultState> {
    const state = await input.webContents.executeJavaScript(
      'Boolean(document.querySelector(".result")) ? "results" : Boolean(document.querySelector(".msg") || document.body?.innerText?.includes("No results.")) ? "no_results" : "loading"',
      true,
    ).catch(() => 'loading');
    return state as ResultState;
  }

  detectChallenge(input: { url: string; title: string; visibleText: string }) {
    return detectBrowserSearchChallenge(input);
  }

  async extractResults(input: { webContents: import('electron').WebContents; limit: number }) {
    const html = await input.webContents.executeJavaScript('document.documentElement.outerHTML', true);
    const pageUrl = input.webContents.getURL();
    const results = extractOrganicResultsFromHtml({
      html: String(html ?? ''),
      pageUrl,
      limit: input.limit,
      isSponsored: (element) => element.hasClass('result--ad') || element.hasClass('result--pub'),
      pickLink: (element) => {
        const link = element.find('a.result__a').first();
        const href = link.attr('href') ?? undefined;
        const title = link.text().trim() || undefined;
        const snippet = element.find('.result__snippet').first().text().trim() || undefined;
        if (!href || !title) return null;
        return { href, title, snippet };
      },
    });
    return results;
  }
}
