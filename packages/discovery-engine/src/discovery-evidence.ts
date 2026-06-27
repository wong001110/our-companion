import type { DiscoveryEvidence, ExplorationPlanV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export function createEvidence(input: {
  title: string;
  source: string;
  snippet: string;
  relevance: number;
  confidence: number;
}): DiscoveryEvidence {
  return {
    id: createId('evidence'),
    title: input.title,
    source: input.source,
    snippet: input.snippet,
    relevance: input.relevance,
    confidence: input.confidence,
    timestamp: nowIso(),
  };
}

export function aggregateEvidence(evidence: DiscoveryEvidence[]): {
  avgRelevance: number;
  avgConfidence: number;
  totalCount: number;
} {
  if (evidence.length === 0) {
    return { avgRelevance: 0, avgConfidence: 0, totalCount: 0 };
  }

  const avgRelevance = evidence.reduce((sum, e) => sum + e.relevance, 0) / evidence.length;
  const avgConfidence = evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length;

  return {
    avgRelevance,
    avgConfidence,
    totalCount: evidence.length,
  };
}
