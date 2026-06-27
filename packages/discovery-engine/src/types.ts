import type { DiscoveryJob, DiscoveryJobStatus } from '@our-companion/shared';

export const MAX_RETRIES = 3;
export const JOB_EXPIRY_HOURS = 24;
export const MAX_QUEUE_SIZE = 20;
export const DEFAULT_MAX_COST = 100;

export interface DiscoveryContext {
  userInterests: string[];
  recentMemoryTags: string[];
  activeCharacterExpertise: string[];
}

export interface EvidenceSource {
  fetch(query: string): Promise<Array<{ title: string; snippet: string; source: string; url?: string }>>;
}
