import type { AddJourneyMilestoneInput, Concept, CreateJourneyInput, Insight, Journey, JourneyMilestone, CompanionJourney, JourneyMilestoneV2 } from '@our-companion/shared';
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
export declare function createCompanionJourney(input: {
    title: string;
    description?: string;
    origin: 'user' | 'discovery' | 'brain' | 'system';
}): CompanionJourney;
export declare function createJourneyMilestoneV2(input: {
    title: string;
    description?: string;
    status?: 'pending' | 'active' | 'completed' | 'skipped';
}): JourneyMilestoneV2;
export declare function completeJourneyMilestone(milestone: JourneyMilestoneV2): JourneyMilestoneV2;
export declare function addMemoryToJourney(journey: CompanionJourney, memoryId: string): CompanionJourney;
export declare function addInsightToJourney(journey: CompanionJourney, insightId: string): CompanionJourney;
export declare function completeJourney(journey: CompanionJourney): CompanionJourney;
export declare function pauseJourney(journey: CompanionJourney): CompanionJourney;
export declare function resumeJourney(journey: CompanionJourney): CompanionJourney;
export declare function getJourneyProgress(journey: CompanionJourney): {
    total: number;
    completed: number;
    percentage: number;
};
