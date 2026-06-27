import { describe, expect, it } from 'vitest';
import { buildInterestGraph, archiveKnowledge, conceptKey, createConcept, createKnowledgeFromInsight, createMemoryEdge, createMemoryNode, buildKnowledgeGraph, decayConcept, graphFromMemory, matchConcept, restoreKnowledge, retrieveKnowledge, reviveConcept, updateMemoryNode, MemoryEngine, createShortTermMemory, applyDecay, } from './index';
describe('memory engine', () => {
    it('creates editable graph nodes and edges', () => {
        const first = createMemoryNode({ type: 'topic', title: 'PixiJS' });
        const second = createMemoryNode({ type: 'resource', title: 'Sprite guide' });
        const edge = createMemoryEdge({ fromNodeId: first.id, toNodeId: second.id, relationType: 'related_to' });
        const graph = graphFromMemory([first, second], [edge]);
        expect(graph.nodes).toHaveLength(2);
        expect(graph.edges).toHaveLength(1);
    });
    it('marks memory as wrong without deleting it', () => {
        const node = createMemoryNode({ type: 'topic', title: 'Old note' });
        const updated = updateMemoryNode(node, { id: node.id, isMarkedWrong: true });
        expect(updated.isMarkedWrong).toBe(true);
    });
    it('builds an interest graph from memory and patterns', () => {
        const graph = buildInterestGraph({
            userId: 'default',
            memoryNodes: [
                createMemoryNode({
                    type: 'topic',
                    title: 'Autonomous companion discovery',
                    summary: 'Ann explores and returns with insights.'
                })
            ],
            patterns: [
                {
                    id: 'pattern_1',
                    userId: 'default',
                    type: 'repeated_theme',
                    title: 'Companion presence',
                    summary: 'The user returns to companion-like AI.',
                    confidence: 0.8,
                    strength: 0.85,
                    freshness: 0.9,
                    evidence: [],
                    createdAt: 'now',
                    updatedAt: 'now'
                }
            ],
            discoveries: [],
            feedback: []
        });
        expect(graph.nodes.map((node) => node.label)).toContain('Companion presence');
        expect(graph.recommendedExpansionPaths?.length).toBeGreaterThan(0);
    });
    it('creates and matches concepts by stable key and topic overlap', () => {
        const concept = createConcept({
            name: 'SQLite-backed local-first memory',
            summary: 'Personal memory stored locally.',
            topics: ['sqlite', 'local-first'],
            discoveryId: 'disc_1'
        });
        const result = matchConcept({
            name: 'SQLite local memory',
            topics: ['sqlite', 'local-first', 'memory'],
            entities: ['SQLite'],
            discoveryId: 'disc_2'
        }, [concept]);
        expect(conceptKey('SQLite-backed local-first memory')).toBe('sqlite-backed-local-first-memory');
        expect(result.type).toBe('matched');
        expect(result.concept.relatedDiscoveryIds).toContain('disc_2');
        expect(result.concept.entities).toContain('SQLite');
    });
    it('revives dormant concepts and archives/restores knowledge', () => {
        const concept = createConcept({ name: 'Evaluation for companions', topics: ['evaluation'] });
        const dormant = decayConcept(concept, 30);
        const revived = reviveConcept(dormant, 'New discovery changed the understanding.');
        const knowledge = createKnowledgeFromInsight({
            insight: {
                id: 'insight_1',
                title: 'Evaluation matters',
                explanation: 'Evaluation became a missing piece.',
                relatedConceptIds: [concept.id],
                relatedPatternIds: [],
                confidence: 0.8,
                growthValue: 88,
                createdAt: 'now',
                status: 'candidate'
            },
            concepts: [concept],
            journeyId: 'journey_1'
        });
        const archived = archiveKnowledge(knowledge);
        expect(dormant.status).toBe('dormant');
        expect(revived.status).toBe('active');
        expect(archived.status).toBe('archived');
        expect(restoreKnowledge(archived).status).toBe('active');
    });
    it('builds and retrieves a knowledge graph by journey and concept', () => {
        const concept = createConcept({ name: 'Local-first memory', topics: ['memory'] });
        const knowledge = createKnowledgeFromInsight({
            insight: {
                id: 'insight_2',
                title: 'Local-first memory is practical',
                explanation: 'SQLite memory fits the project.',
                relatedConceptIds: [concept.id],
                relatedPatternIds: [],
                confidence: 0.9,
                growthValue: 90,
                createdAt: 'now',
                status: 'candidate'
            },
            concepts: [concept],
            journeyId: 'journey_1'
        });
        const graph = buildKnowledgeGraph([knowledge]);
        const results = retrieveKnowledge({
            knowledge: [knowledge],
            query: 'sqlite',
            activeJourneyId: 'journey_1',
            currentConceptIds: [concept.id]
        });
        expect(graph.nodes.some((node) => node.kind === 'knowledge')).toBe(true);
        expect(graph.edges.some((edge) => edge.type === 'derived_from')).toBe(true);
        expect(results[0]?.id).toBe(knowledge.id);
    });
});
describe('memory engine v2', () => {
    describe('add memory', () => {
        it('can add short-term memory', () => {
            const engine = new MemoryEngine();
            const memory = engine.addMemory({
                content: 'User explored cloud storage options today.',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                tags: ['cloud', 'storage'],
                entities: ['user'],
            });
            expect(memory.tier).toBe('short_term');
            expect(memory.content).toBe('User explored cloud storage options today.');
            expect(memory.tags).toContain('cloud');
            expect(memory.entities).toContain('user');
            expect(engine.getShortTermBuffer()).toHaveLength(1);
        });
        it('can add episodic memory', () => {
            const engine = new MemoryEngine();
            const memory = engine.addMemory({
                content: 'Ann shared a discovery about AI desktop companions.',
                tier: 'episodic',
                type: 'discovery',
                source: 'autonomous_exploration',
                importance: 80,
            });
            expect(memory.tier).toBe('episodic');
            expect(memory.importance).toBe(80);
        });
        it('can add semantic memory', () => {
            const engine = new MemoryEngine();
            const memory = engine.addMemory({
                content: 'Our Companion is a desktop AI companion.',
                tier: 'semantic',
                type: 'topic',
                source: 'system',
                confidence: 0.95,
            });
            expect(memory.tier).toBe('semantic');
            expect(memory.confidence).toBe(0.95);
        });
    });
    describe('retrieve memory', () => {
        it('retrieves by tag', () => {
            const engine = new MemoryEngine();
            engine.addMemory({
                content: 'User likes PixiJS',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                tags: ['pixijs', 'frontend'],
            });
            engine.addMemory({
                content: 'User likes React',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                tags: ['react', 'frontend'],
            });
            const results = engine.retrieveMemory({ tags: ['pixijs'] });
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].memory.tags).toContain('pixijs');
        });
        it('retrieves by type', () => {
            const engine = new MemoryEngine();
            engine.addMemory({
                content: 'Decision: Use SQLite',
                tier: 'short_term',
                type: 'decision',
                source: 'conversation',
            });
            engine.addMemory({
                content: 'Topic: Frontend frameworks',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
            });
            const results = engine.retrieveMemory({ types: ['decision'] });
            expect(results.length).toBe(1);
            expect(results[0].memory.type).toBe('decision');
        });
        it('ranks important memory higher', () => {
            const engine = new MemoryEngine();
            engine.addMemory({
                content: 'Low importance topic',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                importance: 20,
            });
            engine.addMemory({
                content: 'High importance decision',
                tier: 'short_term',
                type: 'decision',
                source: 'conversation',
                importance: 90,
            });
            const results = engine.retrieveMemory({ text: 'important' });
            expect(results.length).toBe(2);
            expect(results[0].memory.importance).toBe(90);
        });
        it('includes relevance reason', () => {
            const engine = new MemoryEngine();
            engine.addMemory({
                content: 'User explored PixiJS tutorials',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                tags: ['pixijs'],
                importance: 80,
            });
            const results = engine.retrieveMemory({ text: 'PixiJS' });
            expect(results.length).toBe(1);
            expect(results[0].reason).toBeTruthy();
        });
    });
    describe('consolidation', () => {
        it('consolidates short-term memory into long-term memory', () => {
            const engine = new MemoryEngine();
            engine.addMemory({
                content: 'Important decision about architecture',
                tier: 'short_term',
                type: 'decision',
                source: 'conversation',
                importance: 75,
            });
            const result = engine.consolidateMemory();
            expect(result.consolidated).toBe(1);
            expect(result.merged).toBe(0);
            expect(result.discarded).toBe(0);
            expect(engine.getShortTermBuffer()).toHaveLength(0);
            expect(engine.getLongTermMemory()).toHaveLength(1);
        });
        it('avoids saving trivial memory', () => {
            const engine = new MemoryEngine();
            engine.addMemory({
                content: 'Minor topic',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                importance: 10,
            });
            const result = engine.consolidateMemory();
            expect(result.discarded).toBe(1);
            expect(engine.getLongTermMemory()).toHaveLength(0);
        });
    });
    describe('reinforcement', () => {
        it('increases reinforcement count', () => {
            const engine = new MemoryEngine();
            const memory = engine.addMemory({
                content: 'Important concept',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
            });
            const reinforced = engine.reinforceMemory(memory.id, 'User mentioned it again');
            expect(reinforced).toBeTruthy();
            expect(reinforced.reinforcementCount).toBe(1);
        });
        it('updates last accessed timestamp', () => {
            const engine = new MemoryEngine();
            const memory = engine.addMemory({
                content: 'Important concept',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
            });
            const originalAccess = memory.lastAccessedAt;
            const reinforced = engine.reinforceMemory(memory.id, 'User mentioned it again');
            expect(new Date(reinforced.lastAccessedAt).getTime()).toBeGreaterThanOrEqual(new Date(originalAccess).getTime());
        });
        it('improves importance or confidence safely', () => {
            const engine = new MemoryEngine();
            const memory = engine.addMemory({
                content: 'Important concept',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                importance: 50,
                confidence: 0.7,
            });
            const reinforced = engine.reinforceMemory(memory.id, 'User mentioned it again');
            expect(reinforced.importance).toBeGreaterThan(50);
            expect(reinforced.confidence).toBeGreaterThan(0.7);
        });
    });
    describe('decay', () => {
        it('reduces priority for stale low-importance memories', () => {
            const memory = createShortTermMemory({
                content: 'Old topic',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                importance: 30,
            });
            const oldMemory = {
                ...memory,
                lastAccessedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                decayScore: 1.0,
            };
            const { updatedMemories, result } = applyDecay([oldMemory]);
            expect(updatedMemories[0].decayScore).toBeLessThan(1.0);
        });
        it('does not decay high-importance memories aggressively', () => {
            const memory = createShortTermMemory({
                content: 'Important decision',
                tier: 'short_term',
                type: 'decision',
                source: 'conversation',
                importance: 85,
            });
            const oldMemory = {
                ...memory,
                lastAccessedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                decayScore: 1.0,
            };
            const { updatedMemories } = applyDecay([oldMemory]);
            const highImportanceDecay = updatedMemories[0].decayScore;
            const lowMemory = createShortTermMemory({
                content: 'Low importance',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                importance: 20,
            });
            const oldLowMemory = {
                ...lowMemory,
                lastAccessedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                decayScore: 1.0,
            };
            const { updatedMemories: lowUpdated } = applyDecay([oldLowMemory]);
            expect(highImportanceDecay).toBeGreaterThan(lowUpdated[0].decayScore);
        });
    });
    describe('graph', () => {
        it('creates memory graph', () => {
            const engine = new MemoryEngine();
            engine.addMemory({
                content: 'User explores PixiJS',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                tags: ['pixijs'],
                entities: ['user'],
            });
            engine.addMemory({
                content: 'Ann discovered PixiJS tutorials',
                tier: 'short_term',
                type: 'discovery',
                source: 'autonomous',
                tags: ['pixijs', 'tutorials'],
                entities: ['Ann'],
            });
            const graph = engine.getMemoryGraph();
            expect(graph.nodes).toHaveLength(2);
            expect(graph.edges.length).toBeGreaterThanOrEqual(1);
        });
        it('links related memories', () => {
            const engine = new MemoryEngine();
            engine.addMemory({
                content: 'Topic about PixiJS',
                tier: 'short_term',
                type: 'topic',
                source: 'conversation',
                tags: ['pixijs', 'frontend'],
            });
            engine.addMemory({
                content: 'Discovery about PixiJS',
                tier: 'short_term',
                type: 'discovery',
                source: 'autonomous',
                tags: ['pixijs', 'learning'],
            });
            const graph = engine.getMemoryGraph();
            const edge = graph.edges.find((e) => e.type === 'related_to');
            expect(edge).toBeTruthy();
        });
    });
});
