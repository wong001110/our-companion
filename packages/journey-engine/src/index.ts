import type { AddJourneyMilestoneInput, CreateJourneyInput, Journey, JourneyMilestone } from '@our-companion/shared';
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
