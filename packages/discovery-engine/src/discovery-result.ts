import type { DiscoveryJob, DiscoveryEvidence, DiscoveryResult } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { aggregateEvidence } from './discovery-evidence';

export function generateDiscoveryResult(
  job: DiscoveryJob,
  evidence: DiscoveryEvidence[]
): DiscoveryResult {
  const stats = aggregateEvidence(evidence);

  return {
    id: createId('discovery_result'),
    jobId: job.id,
    summary: `Discovery exploration for "${job.relatedTopics[0] ?? 'topic'}" completed with ${evidence.length} evidence items.`,
    detailedFindings: evidence.map((e) => `${e.title}: ${e.snippet}`).join('\n\n'),
    evidence,
    confidence: stats.avgConfidence,
    novelty: Math.max(0.3, 1 - job.retryCount * 0.1),
    suggestedMemoryUpdates: evidence.slice(0, 2).map((e) => e.title),
    suggestedInsights: stats.avgConfidence > 0.7 ? ['Consider exploring this topic further'] : [],
    suggestedFollowUps: stats.avgRelevance > 0.6 ? [`Follow up on ${job.relatedTopics[0]}`] : [],
    createdAt: nowIso(),
  };
}
