import { describe, expect, it } from 'vitest';
import { buildInterestGraph, archiveKnowledge, conceptKey, createConcept, createKnowledgeFromInsight, createMemoryEdge, createMemoryNode, buildKnowledgeGraph, decayConcept, graphFromMemory, matchConcept, restoreKnowledge, retrieveKnowledge, reviveConcept, updateMemoryNode } from './index';
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
