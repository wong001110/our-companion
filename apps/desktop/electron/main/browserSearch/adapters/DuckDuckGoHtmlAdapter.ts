import { detectBrowserSearchChallenge } from '../browserSearchChallenge';
import { extractOrganicResultsFromHtml } from '../browserSearchExtraction';
import type { BrowserSearchEngineAdapter } from '../BrowserSearchEngineAdapter';

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

  async waitForResults(input: { webContents: import('electron').WebContents; timeoutMs: number }): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < input.timeoutMs) {
      const ready = await input.webContents.executeJavaScript(
        'Boolean(document.querySelector(".result") || document.querySelector(".msg") || document.body?.innerText?.includes("No results."))',
        true,
      ).catch(() => false);
      if (ready) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('browser_search_timeout');
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
