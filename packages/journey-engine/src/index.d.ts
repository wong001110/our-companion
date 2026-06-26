import type { AddJourneyMilestoneInput, Concept, CreateJourneyInput, Insight, Journey, JourneyMilestone } from '@our-companion/shared';
export declare function createJourney(input: CreateJourneyInput): Journey;
export declare function createJourneyFromConcepts(input: {
    title: string;
    description?: string;
    concepts: Concept[];
    discoveryIds?: string[];
    insightIds?: string[];
}): Journey;
export declare function createJourneyMilestone(input: AddJourneyMilestoneInput): JourneyMilestone;
export declare function createMilestoneFromInsight(input: {
    journeyId: string;
    insight: Insight;
}): JourneyMilestone;
