import type { DatabaseService } from '@our-companion/database';
import type { CompanionInsight, DiscoverySchedulingDebug, EngineSnapshot, EngineSnapshotInput, InsightV2, Pattern, PatternV2 } from '@our-companion/shared';
import { DEFAULT_CHARACTER_ID, nowIso } from '@our-companion/shared';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

function mapPatternToV2(p: Pattern): PatternV2 {
  return {
    id: p.id,
    userId: p.userId,
    category: 'interest',
    type: p.type,
    title: p.title,
    summary: p.summary,
    confidence: p.confidence,
    strength: p.strength,
    supportingMemoryIds: p.relatedConceptIds ?? [],
    firstDetectedAt: p.detectedAt ?? p.createdAt,
    lastUpdatedAt: p.updatedAt,
    reinforcementCount: 1,
    evidence: p.evidence
  };
}

function mapInsightToV2(i: CompanionInsight): InsightV2 {
  return {
    id: i.id,
    userId: i.userId,
    category: 'interest',
    title: i.title,
    summary: i.summary,
    explanation: i.insight,
    supportingPatternIds: i.relatedPatternIds ?? [],
    supportingMemoryIds: i.relatedMemoryIds ?? [],
    confidence: i.confidence,
    importance: i.practicalRelevance,
    novelty: i.novelty,
    evidenceCount: i.supportingCandidateIds.length,
    status: 'active',
    createdAt: i.createdAt,
    updatedAt: i.createdAt
  };
}

export function buildEngineSnapshot(
  db: DatabaseService,
  input: EngineSnapshotInput = {},
  characterId = db.resolveActiveCompanionId(),
  orchestrator?: DiscoveryShareOrchestrator
): EngineSnapshot {
  const userId = input.userId ?? 'default';
  const focusCycle =
    (input.cycleId ? db.getExplorationCycle(input.cycleId) : undefined) ??
    db.getCurrentExplorationCycle() ??
    db.listExplorationCycles(1)[0];

  const announcedIds = new Set(db.getAnnouncedDiscoveryIds());
  const allShared = db.listDiscoveries({ status: 'shared', limit: 200 });
  const unannouncedCount = allShared.filter((d) => !announcedIds.has(d.id)).length;

  const schedulingDebug: DiscoverySchedulingDebug = {
    isBusy: orchestrator?.isBusy() ?? false,
    hasPending: orchestrator?.hasPending() ?? false,
    pendingDiscoveryId: orchestrator?.getPendingDiscoveryId(),
    queueLength: orchestrator?.getQueueLength() ?? 0,
    lastTickAt: orchestrator?.getLastTickAt(),
    lastSkipReason: orchestrator?.getLastSkipReason(),
    lastAnnouncedId: orchestrator?.getLastAnnouncedId(),
    isProcessing: orchestrator?.isProcessing() ?? false,
    nextRetryAt: orchestrator?.getNextRetryAt(),
    unannouncedCount,
    announcedCount: announcedIds.size,
    queue: orchestrator?.getQueue().map((q) => ({
      id: q.discovery.id,
      title: q.discovery.title,
      status: q.status,
      retryCount: q.retryCount,
      interruptCount: q.interruptCount,
      retryAfterAt: q.retryAfterAt
    }))
  };

  return {
    capturedAt: nowIso(),
    characterState: db.getCharacterState(characterId),
    currentCycle: focusCycle,
    recentCycles: db.listExplorationCycles(10),
    patterns: db.listPatterns(userId, 20).map(mapPatternToV2),
    interestGraph: db.getInterestGraph(userId),
    curiosityTargets: db.listCuriosityTargets(userId, 20),
    explorationPlan: focusCycle?.explorationPlanId
      ? db.getExplorationPlan(focusCycle.explorationPlanId)
      : undefined,
    discoveryCandidates: db.listDiscoveryCandidates(userId, 20),
    insights: db.listCompanionInsights(userId, 20).map(mapInsightToV2),
    explorationEvents: focusCycle ? db.listExplorationEventsForCycle(focusCycle.id) : [],
    recentDiscoveries: db.listDiscoveries({ limit: 10 }),
    actionPermissions: db.getActionPermissions(),
    discoveryScheduling: schedulingDebug
  };
}
