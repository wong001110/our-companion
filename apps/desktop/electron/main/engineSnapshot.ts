import type { DatabaseService } from '@our-companion/database';
import type { CompanionInsight, DiscoverySchedulingDebug, EngineSnapshot, EngineSnapshotInput, GeneratedInsight } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

function mapGeneratedInsight(i: CompanionInsight): GeneratedInsight {
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
  const recoverableDiscoveries = db.listQueuedOrEligible(200, characterId);

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
    unannouncedCount: recoverableDiscoveries.length,
    announcedCount: announcedIds.size,
    queue: orchestrator?.getQueue().map((q) => ({
      id: q.discovery.id,
      title: q.discovery.title,
      status: q.status,
      retryCount: q.retryCount,
      interruptCount: q.interruptCount
    }))
  };

  return {
    capturedAt: nowIso(),
    characterState: db.getCharacterState(characterId),
    currentCycle: focusCycle,
    recentCycles: db.listExplorationCycles(10),
    patterns: db.listPatterns(userId, 20),
    interestGraph: db.getInterestGraph(userId),
    curiosityTargets: db.listCuriosityTargets(userId, 20),
    explorationPlan: focusCycle?.explorationPlanId
      ? db.getExplorationPlan(focusCycle.explorationPlanId)
      : undefined,
    discoveryCandidates: db.listDiscoveryCandidates(userId, 20),
    insights: db.listCompanionInsights(userId, 20).map(mapGeneratedInsight),
    explorationEvents: focusCycle ? db.listExplorationEventsForCycle(focusCycle.id) : [],
    recentDiscoveries: db.listDiscoveries({ limit: 10 }),
    actionPermissions: db.getActionPermissions(),
    discoveryScheduling: schedulingDebug,
    engineTraces: db.listEngineTraces({
      cycleId: input.cycleId ?? focusCycle?.id,
      correlationId: input.correlationId,
      companionId: characterId,
      limit: input.traceLimit ?? 100
    })
  };
}
