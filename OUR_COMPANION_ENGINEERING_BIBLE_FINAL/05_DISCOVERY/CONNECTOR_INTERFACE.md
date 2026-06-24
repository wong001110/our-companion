# Discovery Connector Interface

```ts
export interface DiscoveryConnector {
  source: DiscoverySource;
  fetch(input: DiscoveryFetchInput): Promise<RawDiscoveryItem[]>;
  normalize(item: RawDiscoveryItem): NormalizedDiscovery;
}

export type DiscoverySource = 'github' | 'reddit' | 'hackernews' | 'youtube';

export interface NormalizedDiscovery {
  source: DiscoverySource;
  externalId?: string;
  title: string;
  summary?: string;
  url?: string;
  tags: string[];
  publishedAt?: string;
  raw: unknown;
}
```

## v1 Implementation Note
Keep connectors simple. Use public feeds/APIs where possible. Do not require OAuth in v1.
