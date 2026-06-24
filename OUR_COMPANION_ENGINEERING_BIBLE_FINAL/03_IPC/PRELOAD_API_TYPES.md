# Preload API Types

```ts
export interface ToolExecuteInput {
  toolName: 'open_url' | 'open_app' | 'search_web' | 'browser_navigation';
  args: Record<string, unknown>;
  requireConfirmation?: boolean;
}

export interface DiscoveryFeedInput {
  limit?: number;
  status?: 'candidate' | 'shared' | 'saved' | 'rejected';
}

export interface AddDiscoveryToJourneyInput {
  discoveryId: string;
  journeyId?: string;
  createJourneyTitle?: string;
}

export interface CreateMemoryNodeInput {
  type: MemoryNodeType;
  title: string;
  summary?: string;
  content?: string;
  source?: string;
  sourceUrl?: string;
}
```
