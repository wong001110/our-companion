import type { CuriosityCandidate, ExplorationPlanV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export function createExplorationPlan(
  curiosityTarget: CuriosityCandidate,
  context: { userInterests: string[]; recentMemoryTags: string[] }
): ExplorationPlanV2 {
  const searchTargets = [
    curiosityTarget.title,
    ...curiosityTarget.description.split(' ').slice(0, 3),
  ];

  return {
    objective: `Explore ${curiosityTarget.title} to find relevant information`,
    searchTargets,
    stoppingConditions: [
      'Found 3+ relevant results',
      'Confidence threshold met',
      'Search exhausted',
    ],
    maxCost: 100,
    expectedOutputs: [
      'Discovery evidence items',
      'Summary of findings',
      'Relevance assessment',
    ],
  };
}
