import { describe, expect, it } from 'vitest';
import { detectCognitivePatterns, detectPatterns, scorePattern } from './index';
describe('pattern engine', () => {
    it('scores repeated patterns with feedback weight', () => {
        const score = scorePattern({ frequency: 0.8, recency: 0.8, emotionalWeight: 0.7, feedbackWeight: 0.9 });
        expect(score.finalScore).toBeGreaterThan(0.75);
    });
    it('detects repeated memory themes', () => {
        const patterns = detectPatterns({
            userId: 'default',
            memoryNodes: [
                {
                    id: 'mem_1',
                    type: 'topic',
                    title: 'AI companion memory',
                    importanceScore: 80,
                    createdAt: 'now',
                    updatedAt: 'now'
                },
                {
                    id: 'mem_2',
                    type: 'topic',
                    title: 'Desktop companion presence',
                    importanceScore: 70,
                    createdAt: 'now',
                    updatedAt: 'now'
                }
            ],
            journeyMilestones: [],
            discoveryHistory: [],
            feedbackHistory: []
        });
        expect(patterns.some((pattern) => pattern.title.toLowerCase().includes('companion'))).toBe(true);
    });
    it('detects repeated concepts and cross-source trends', () => {
        const patterns = detectCognitivePatterns({
            userId: 'default',
            concepts: [
                {
                    id: 'concept_1',
                    key: 'local-first-memory',
                    name: 'Local-first memory',
                    summary: 'Personal memory architecture.',
                    topics: ['memory'],
                    entities: ['SQLite'],
                    relatedDiscoveryIds: ['disc_1', 'disc_2'],
                    firstSeenAt: 'now',
                    lastSeenAt: 'now',
                    strength: 3,
                    status: 'active'
                }
            ],
            discoveries: [
                {
                    id: 'disc_1',
                    source: 'github',
                    title: 'SQLite memory repo',
                    tags: ['memory'],
                    raw: {},
                    userInterestScore: 80,
                    userHistoryScore: 70,
                    characterExpertiseScore: 60,
                    noveltyScore: 75,
                    usefulnessScore: 80,
                    finalScore: 76,
                    status: 'saved',
                    createdAt: 'now'
                },
                {
                    id: 'disc_2',
                    source: 'hackernews',
                    title: 'Local memory discussion',
                    tags: ['memory'],
                    raw: {},
                    userInterestScore: 80,
                    userHistoryScore: 70,
                    characterExpertiseScore: 60,
                    noveltyScore: 75,
                    usefulnessScore: 80,
                    finalScore: 76,
                    status: 'shared',
                    createdAt: 'now'
                }
            ]
        });
        expect(patterns.map((pattern) => pattern.type)).toContain('repeated_topic');
        expect(patterns.map((pattern) => pattern.type)).toContain('cross_source_trend');
    });
});
