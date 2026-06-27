import type { DatabaseService } from '@our-companion/database';
import type { DiscoverySchedulingDebug, EngineSnapshot, EngineSnapshotInput } from '@our-companion/shared';
import { DEFAULT_CHARACTER_ID, nowIso } from '@our-companion/shared';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

export function buildEngineSnapshot(
  db: DatabaseService,
  input: EngineSnapshotInput = {},
  characterId = DEFAULT_CHARACTER_ID,
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
    lastTickAt: orchestrator?.getLastTickAt(),
    lastSkipReason: orchestrator?.getLastSkipReason(),
    unannouncedCount,
    announcedCount: announcedIds.size
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
    insights: db.listCompanionInsights(userId, 20),
    explorationEvents: focusCycle ? db.listExplorationEventsForCycle(focusCycle.id) : [],
    recentDiscoveries: db.listDiscoveries({ limit: 10 }),
    actionPermissions: db.getActionPermissions(),
    discoveryScheduling: schedulingDebug
  };
}
