import type { DatabaseService } from '@our-companion/database';
import type { EngineSnapshot, EngineSnapshotInput } from '@our-companion/shared';
import { DEFAULT_CHARACTER_ID, nowIso } from '@our-companion/shared';

export function buildEngineSnapshot(
  db: DatabaseService,
  input: EngineSnapshotInput = {},
  characterId = DEFAULT_CHARACTER_ID
): EngineSnapshot {
  const userId = input.userId ?? 'default';
  const focusCycle =
    (input.cycleId ? db.getExplorationCycle(input.cycleId) : undefined) ??
    db.getCurrentExplorationCycle() ??
    db.listExplorationCycles(1)[0];

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
    actionPermissions: db.getActionPermissions()
  };
}
