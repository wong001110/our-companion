import { createId, nowIso } from '@our-companion/shared';
export function createJourney(input) {
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
export function createJourneyFromConcepts(input) {
    return {
        ...createJourney({ title: input.title, description: input.description }),
        conceptIds: input.concepts.map((concept) => concept.id),
        discoveryIds: input.discoveryIds ?? [],
        insightIds: input.insightIds ?? []
    };
}
export function createJourneyMilestone(input) {
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
export function createMilestoneFromInsight(input) {
    return createJourneyMilestone({
        journeyId: input.journeyId,
        title: `Insight: ${input.insight.title}`,
        summary: input.insight.explanation,
        type: 'reflection'
    });
}
