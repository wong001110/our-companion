import type { Concept, ConceptMatchInput, ConceptMatchResult, CreateMemoryEdgeInput, CreateMemoryNodeInput, Discovery, DiscoveryFeedback, InterestGraph, Insight, Knowledge, KnowledgeGraph, MemoryEdge, MemoryGraph, MemoryNode, Pattern, UpdateMemoryNodeInput } from '@our-companion/shared';
export declare function createMemoryNode(input: CreateMemoryNodeInput): MemoryNode;
export declare function updateMemoryNode(existing: MemoryNode, input: UpdateMemoryNodeInput): MemoryNode;
export declare function createMemoryEdge(input: CreateMemoryEdgeInput): MemoryEdge;
export declare function searchMemory(nodes: MemoryNode[], query: string): MemoryNode[];
export declare function graphFromMemory(nodes: MemoryNode[], edges: MemoryEdge[], query?: string): MemoryGraph;
export interface BuildInterestGraphInput {
    userId: string;
    memoryNodes: MemoryNode[];
    patterns: Pattern[];
    discoveries: Discovery[];
    feedback: DiscoveryFeedback[];
}
export declare function conceptKey(value: string): string;
export declare function createConcept(input: ConceptMatchInput): Concept;
export declare function matchConcept(input: ConceptMatchInput, existing: Concept[]): ConceptMatchResult;
export declare function createKnowledgeFromInsight(input: {
    title?: string;
    insight: Insight;
    concepts?: Concept[];
    journeyId?: string;
}): Knowledge;
export declare function buildKnowledgeGraph(knowledge: Knowledge[]): KnowledgeGraph;
export declare function archiveKnowledge(knowledge: Knowledge, reason?: string): Knowledge;
export declare function restoreKnowledge(knowledge: Knowledge): Knowledge;
export declare function reviveConcept(concept: Concept, reason: string): Concept;
export declare function decayConcept(concept: Concept, inactiveDays: number): Concept;
export declare function retrieveKnowledge(input: {
    knowledge: Knowledge[];
    query: string;
    activeJourneyId?: string;
    currentConceptIds?: string[];
    limit?: number;
}): Knowledge[];
export declare function buildInterestGraph(input: BuildInterestGraphInput): InterestGraph;
