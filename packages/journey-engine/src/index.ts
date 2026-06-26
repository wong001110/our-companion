import type { AddJourneyMilestoneInput, Concept, CreateJourneyInput, Insight, Journey, JourneyMilestone } from '@our-companion/shared';
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
