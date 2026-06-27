import type {
  AddJourneyMilestoneInput,
  Concept,
  CreateJourneyInput,
  Insight,
  Journey,
  JourneyMilestone,
  CompanionJourney,
  JourneyMilestoneV2,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export function createJourney(input: CreateJourneyInput): Journey {
  const timestamp = nowIso();
  return {
    id: createId('journey'),
    title: input.title,
    description: input.description,
    status: 'active',
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createJourneyFromConcepts(input: {
  title: string;
  description?: string;
  concepts: Concept[];
  discoveryIds?: string[];
  insightIds?: string[];
}): Journey {
  return {
    ...createJourney({ title: input.title, description: input.description }),
    conceptIds: input.concepts.map((concept) => concept.id),
    discoveryIds: input.discoveryIds ?? [],
    insightIds: input.insightIds ?? []
  };
}

export function createJourneyMilestone(input: AddJourneyMilestoneInput): JourneyMilestone {
  const timestamp = nowIso();
  return {
    id: createId('milestone'),
    journeyId: input.journeyId,
    title: input.title,
    summary: input.summary,
    type: input.type,
    occurredAt: timestamp,
    createdAt: timestamp
  };
}

export function createMilestoneFromInsight(input: { journeyId: string; insight: Insight }): JourneyMilestone {
  return createJourneyMilestone({
    journeyId: input.journeyId,
    title: `Insight: ${input.insight.title}`,
    summary: input.insight.explanation,
    type: 'reflection'
  });
}

// ============================================================================
// Journey Engine V2 — Enhanced journey management
// ============================================================================

export function createCompanionJourney(input: {
  title: string;
  description?: string;
  origin: 'user' | 'discovery' | 'brain' | 'system';
}): CompanionJourney {
  const timestamp = nowIso();
  return {
    id: createId('journey'),
    title: input.title,
    description: input.description,
    status: 'active',
    origin: input.origin,
    milestones: [],
    relatedMemories: [],
    relatedInsights: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createJourneyMilestoneV2(input: {
  title: string;
  description?: string;
  status?: 'pending' | 'active' | 'completed' | 'skipped';
}): JourneyMilestoneV2 {
  return {
    id: createId('milestone'),
    title: input.title,
    description: input.description,
    status: input.status ?? 'pending',
  };
}

export function completeJourneyMilestone(milestone: JourneyMilestoneV2): JourneyMilestoneV2 {
  return {
    ...milestone,
    status: 'completed',
    completedAt: nowIso(),
  };
}

export function addMemoryToJourney(journey: CompanionJourney, memoryId: string): CompanionJourney {
  if (journey.relatedMemories.includes(memoryId)) {
    return journey;
  }
  return {
    ...journey,
    relatedMemories: [...journey.relatedMemories, memoryId],
    updatedAt: nowIso(),
  };
}

export function addInsightToJourney(journey: CompanionJourney, insightId: string): CompanionJourney {
  if (journey.relatedInsights.includes(insightId)) {
    return journey;
  }
  return {
    ...journey,
    relatedInsights: [...journey.relatedInsights, insightId],
    updatedAt: nowIso(),
  };
}

export function completeJourney(journey: CompanionJourney): CompanionJourney {
  return {
    ...journey,
    status: 'completed',
    updatedAt: nowIso(),
  };
}

export function pauseJourney(journey: CompanionJourney): CompanionJourney {
  return {
    ...journey,
    status: 'paused',
    updatedAt: nowIso(),
  };
}

export function resumeJourney(journey: CompanionJourney): CompanionJourney {
  return {
    ...journey,
    status: 'active',
    updatedAt: nowIso(),
  };
}

export function getJourneyProgress(journey: CompanionJourney): {
  total: number;
  completed: number;
  percentage: number;
} {
  const total = journey.milestones.length;
  const completed = journey.milestones.filter((m) => m.status === 'completed').length;
  return {
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
