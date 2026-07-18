import type { DatabaseService } from '@our-companion/database';
import type { CompanionInsight, DiscoverySchedulingDebug, EngineSnapshot, EngineSnapshotInput, GeneratedInsight } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import { evaluateEvidenceCoverage } from '@our-companion/discovery-engine';
import type { ResearchCapabilityStatus } from '@our-companion/shared';
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
  orchestrator?: DiscoveryShareOrchestrator,
  researchCapabilities: ResearchCapabilityStatus[] = []
): EngineSnapshot {
  const userId = input.userId ?? 'default';
  const companionCycles = db.listExplorationCycles(100).filter((cycle) => cycle.companionId === characterId);
  const requestedCycle = input.cycleId ? db.getExplorationCycle(input.cycleId) : undefined;
  const focusCycle =
    (requestedCycle?.companionId === characterId ? requestedCycle : undefined) ??
    companionCycles.find((cycle) => !cycle.completedAt) ??
    companionCycles[0];
  const researchIntent = focusCycle?.researchIntentId
    ? db.getResearchIntent(focusCycle.researchIntentId, characterId)
    : undefined;
  const researchPlan = focusCycle?.researchPlanId
    ? db.getResearchPlan(focusCycle.researchPlanId, characterId)
    : undefined;
  const researchEvidence = db.listWebPageEvidence({ companionId: characterId, cycleId: focusCycle?.id, limit: 50 });

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
    recentCycles: companionCycles.slice(0, 10),
    patterns: db.listPatterns(userId, 20, characterId),
    interestGraph: db.getInterestGraph(`${userId}:${characterId}`),
    curiosityTargets: db.listCuriosityTargets(userId, 20, characterId),
    researchIntent,
    researchPlan,
    researchEvidence,
    researchCapabilities,
    researchCoverage: researchIntent ? evaluateEvidenceCoverage(researchIntent, researchEvidence) : undefined,
    researchStopReason: researchPlan?.outcome?.stopReason
      ?? (researchEvidence.length
        ? 'evidence_collected'
        : researchCapabilities.some((capability) =>
            capability.available && (capability.kind === 'open_web_search' || capability.kind === 'structured_connector'))
          ? 'no_valid_external_evidence'
          : 'RESEARCH_NO_DISCOVERY_PROVIDER'),
    discoveryCandidates: db.listDiscoveryCandidates(userId, 20, characterId),
    insights: db.listCompanionInsights(userId, 20, characterId).map(mapGeneratedInsight),
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
