import { describe, expect, it } from 'vitest';
import { detectCognitivePatterns, detectPatterns, scorePattern, PatternEngine, calculatePatternConfidence, detectInterestPatterns, detectBehaviourPatterns, detectRelationshipPatterns, } from './index';
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
describe('pattern engine v2', () => {
    const createMemory = (overrides = {}) => ({
        id: 'mem_1',
        tier: 'long_term',
        type: 'topic',
        content: 'User explores PixiJS tutorials',
        source: 'conversation',
        tags: ['pixijs', 'frontend'],
        entities: ['user', 'PixiJS'],
        importance: 70,
        confidence: 0.8,
        reinforcementCount: 2,
        lastAccessedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        decayScore: 1.0,
        ...overrides,
    });
    describe('confidence calculation', () => {
        it('calculates confidence from multiple factors', () => {
            const confidence = calculatePatternConfidence({
                supportingMemoryCount: 5,
                recency: 0.9,
                reinforcementCount: 3,
                consistency: 0.8,
                avgMemoryImportance: 75,
            });
            expect(confidence).toBeGreaterThan(0.5);
            expect(confidence).toBeLessThanOrEqual(1);
        });
        it('returns low confidence for weak patterns', () => {
            const confidence = calculatePatternConfidence({
                supportingMemoryCount: 1,
                recency: 0.3,
                reinforcementCount: 0,
                consistency: 0.2,
                avgMemoryImportance: 30,
            });
            expect(confidence).toBeLessThan(0.3);
        });
    });
    describe('interest patterns', () => {
        it('detects repeated interests', () => {
            const memories = [
                createMemory({ id: 'mem_1', tags: ['pixijs', 'game'] }),
                createMemory({ id: 'mem_2', tags: ['pixijs', 'rendering'] }),
                createMemory({ id: 'mem_3', tags: ['pixijs', 'animation'] }),
            ];
            const patterns = detectInterestPatterns(memories, 'user_1');
            expect(patterns.length).toBeGreaterThan(0);
            expect(patterns[0].category).toBe('interest');
            expect(patterns[0].title).toContain('pixijs');
        });
    });
    describe('behaviour patterns', () => {
        it('detects recurring behaviours', () => {
            const memories = [
                createMemory({ id: 'mem_1', source: 'voice_input' }),
                createMemory({ id: 'mem_2', source: 'voice_input' }),
                createMemory({ id: 'mem_3', source: 'voice_input' }),
            ];
            const patterns = detectBehaviourPatterns(memories, 'user_1');
            expect(patterns.length).toBeGreaterThan(0);
            expect(patterns[0].category).toBe('behaviour');
        });
    });
    describe('relationship patterns', () => {
        it('detects entity relationships', () => {
            const memories = [
                createMemory({ id: 'mem_1', entities: ['Ann', 'PixiJS'] }),
                createMemory({ id: 'mem_2', entities: ['Ann', 'PixiJS'] }),
                createMemory({ id: 'mem_3', entities: ['Ann', 'PixiJS'] }),
            ];
            const patterns = detectRelationshipPatterns(memories, 'user_1');
            expect(patterns.length).toBeGreaterThan(0);
            expect(patterns[0].category).toBe('relationship');
            expect(patterns[0].title).toContain('Ann');
            expect(patterns[0].title).toContain('PixiJS');
        });
    });
    describe('pattern engine class', () => {
        it('detects and stores patterns', () => {
            const engine = new PatternEngine();
            const memories = [
                createMemory({ id: 'mem_1', tags: ['ai', 'companion'] }),
                createMemory({ id: 'mem_2', tags: ['ai', 'desktop'] }),
                createMemory({ id: 'mem_3', tags: ['ai', 'memory'] }),
            ];
            const result = engine.detectPatterns({ userId: 'user_1', memories });
            expect(result.patterns.length).toBeGreaterThan(0);
            expect(result.metadata.memoriesAnalyzed).toBe(3);
        });
        it('retrieves patterns by category', () => {
            const engine = new PatternEngine();
            const memories = [
                createMemory({ id: 'mem_1', tags: ['pixijs'] }),
                createMemory({ id: 'mem_2', tags: ['pixijs'] }),
                createMemory({ id: 'mem_3', source: 'voice_input' }),
            ];
            engine.detectPatterns({ userId: 'user_1', memories });
            const interestPatterns = engine.getPatterns({ categories: ['interest'] });
            const behaviourPatterns = engine.getPatterns({ categories: ['behaviour'] });
            expect(interestPatterns.every((p) => p.category === 'interest')).toBe(true);
            expect(behaviourPatterns.every((p) => p.category === 'behaviour')).toBe(true);
        });
        it('reinforces patterns', () => {
            const engine = new PatternEngine();
            const memories = [
                createMemory({ id: 'mem_1', tags: ['pixijs'] }),
                createMemory({ id: 'mem_2', tags: ['pixijs'] }),
            ];
            const result = engine.detectPatterns({ userId: 'user_1', memories });
            const patternId = result.patterns[0].id;
            const before = engine.getPatternById(patternId);
            engine.reinforcePattern(patternId);
            const after = engine.getPatternById(patternId);
            expect(after.reinforcementCount).toBe(before.reinforcementCount + 1);
            expect(after.confidence).toBeGreaterThanOrEqual(before.confidence);
        });
        it('retrieves patterns by confidence', () => {
            const engine = new PatternEngine();
            const memories = [
                createMemory({ id: 'mem_1', tags: ['pixijs'], importance: 90 }),
                createMemory({ id: 'mem_2', tags: ['pixijs'], importance: 85 }),
                createMemory({ id: 'mem_3', tags: ['frontend'], importance: 40 }),
            ];
            engine.detectPatterns({ userId: 'user_1', memories });
            const highConfidence = engine.getPatterns({ minConfidence: 0.5 });
            expect(highConfidence.every((p) => p.confidence >= 0.5)).toBe(true);
        });
    });
});
