import type {
  WebPageFetcher,
  WebPageFetcherInput,
  WebPageFetcherResult,
  WebSearchProvider,
  WebSearchProviderInput,
  WebSearchProviderItem
} from '../production-runtime';

export class FakeWebSearchProvider implements WebSearchProvider {
  readonly calls: WebSearchProviderInput[] = [];
  constructor(readonly results: WebSearchProviderItem[] = [], readonly mode: 'fixture' | 'unavailable' = 'fixture') {}
  async search(input: WebSearchProviderInput): Promise<WebSearchProviderItem[]> {
    this.calls.push(structuredClone(input));
    if (this.mode === 'unavailable') return [];
    return this.results.slice(0, input.limit).map((item, index) => ({ ...structuredClone(item), rank: item.rank ?? index + 1 }));
  }
}

export class FakeWebPageFetcher implements WebPageFetcher {
  readonly calls: WebPageFetcherInput[] = [];
  constructor(readonly evidenceByUrl: Record<string, WebPageFetcherResult> = {}, readonly mode: 'fixture' | 'unavailable' = 'fixture') {}
  async fetchPage(input: WebPageFetcherInput): Promise<WebPageFetcherResult> {
    this.calls.push(structuredClone(input));
    if (this.mode === 'unavailable') throw new Error('unavailable');
    const evidence = this.evidenceByUrl[input.url];
    if (!evidence) throw new Error('fixture_page_not_found');
    return structuredClone(evidence);
  }
}
