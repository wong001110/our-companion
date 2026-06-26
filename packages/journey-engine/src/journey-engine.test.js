import { describe, expect, it } from 'vitest';
import { createJourneyFromConcepts, createMilestoneFromInsight } from './index';
describe('journey engine', () => {
    it('groups concepts and creates milestones from insights', () => {
        const journey = createJourneyFromConcepts({
            title: 'Explore companion memory',
            concepts: [
                {
                    id: 'concept_1',
                    key: 'companion-memory',
                    name: 'Companion memory',
                    summary: 'Long-term memory for Ann.',
                    topics: ['memory'],
                    entities: [],
                    relatedDiscoveryIds: [],
                    firstSeenAt: 'now',
                    lastSeenAt: 'now',
                    strength: 1,
                    status: 'active'
                }
            ],
            insightIds: ['insight_1']
        });
        const milestone = createMilestoneFromInsight({
            journeyId: journey.id,
            insight: {
                id: 'insight_1',
                title: 'Memory needs evaluation',
                explanation: 'Evaluation changes what Ann should remember.',
                relatedConceptIds: ['concept_1'],
                relatedPatternIds: [],
                confidence: 0.8,
                growthValue: 82,
                createdAt: 'now',
                status: 'candidate'
            }
        });
        expect(journey.conceptIds).toContain('concept_1');
        expect(milestone.title).toContain('Insight:');
        expect(milestone.type).toBe('reflection');
    });
});
