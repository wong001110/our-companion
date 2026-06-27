import { describe, expect, it } from 'vitest';
import {
  generateCognitiveInsight,
  generateInsights,
  scoreInsight,
  selectPrimaryInsight,
  InsightEngine,
  calculateInsightConfidence,
  calculateInsightImportance,
  calculateInsightNovelty,
} from './index';
import type { PatternV2, MemoryRecord } from '@our-companion/shared';

const emotion = {
  neutral: 70,
  curious: 65,
  happy: 20,
  excited: 0,
  shy: 45,
  confused: 0,
  focused: 50,
  tired: 10,
  proud: 0,
  concerned: 0
};

describe('insight engine', () => {
  it('scores insight selection', () => {
    const score = scoreInsight({
      confidence: 0.8,
      novelty: 0.7,
      emotionalRelevance: 0.9,
      practicalRelevance: 0.6,
      relationshipFit: 0.7
    });
    expect(score.finalScore).toBeGreaterThan(0.7);
  });

  it('generates and selects a primary insight', () => {
    const insights = generateInsights({
      userId: 'default',
      companionId: 'ann',
      characterState: { characterId: 'ann', coreState: 'idle', intent: 'waiting', emotion },
      memoryNodes: [],
      patterns: [],
      interestGraph: { userId: 'default', nodes: [], edges: [], updatedAt: 'now' },
      curiosityTarget: {
        id: 'curiosity_1',
        userId: 'default',
        companionId: 'ann',
        topic: 'Ambient AI',
        description: 'Explore ambient AI',
        source: 'character_trigger',
        explorationType: 'adjacent',
        priority: 0.8,
        confidence: 0.7,
        reason: 'It fits the companion direction.',
        expectedValue: 'May help the interface feel present.',
        createdAt: 'now'
      },
      discoveryCandidates: [
        {
          id: 'candidate_1',
          userId: 'default',
          companionId: 'ann',
          title: 'Calm technology notes',
          summary: 'A practical signal.',
          sourceType: 'article',
          agentType: 'research',
          relatedCuriosityTargetId: 'curiosity_1',
          relevanceScore: 0.8,
          noveltyScore: 0.7,
          evidenceScore: 0.7,
          usefulnessScore: 0.75,
          collectedAt: 'now'
        }
      ]
    });

    expect(selectPrimaryInsight(insights)?.narration).toContain('I found something');
  });

  it('generates a cognitive insight candidate from concepts and patterns', () => {
    const insight = generateCognitiveInsight({
      concepts: [{ id: 'concept_1', name: 'Local-first memory', summary: 'Personal memory architecture.' }],
      patterns: [
        {
          id: 'pattern_1',
          userId: 'default',
          type: 'cross_source_trend',
          title: 'Memory appears across sources',
          summary: 'Several sources mention memory.',
          relatedConceptIds: ['concept_1'],
          confidence: 0.8,
          strength: 0.9,
          freshness: 0.8,
          evidence: [],
          createdAt: 'now',
          updatedAt: 'now'
        }
      ],
      discoveryCandidates: []
    });

    expect(insight?.status).toBe('candidate');
    expect(insight?.relatedConceptIds).toContain('concept_1');
  });
});

describe('insight engine v2', () => {
  const createPattern = (overrides: Partial<PatternV2> = {}): PatternV2 => ({
    id: 'pattern_1',
    userId: 'user_1',
    category: 'interest',
    type: 'interest_cluster',
    title: 'Interest in PixiJS',
    summary: 'User shows interest in PixiJS',
    confidence: 0.8,
    strength: 0.75,
    supportingMemoryIds: ['mem_1', 'mem_2'],
    firstDetectedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    reinforcementCount: 2,
    evidence: [],
    ...overrides,
  });

  const createMemory = (overrides: Partial<MemoryRecord> = {}): MemoryRecord => ({
    id: 'mem_1',
    tier: 'long_term',
    type: 'topic',
    content: 'User explores PixiJS tutorials',
    source: 'conversation',
    tags: ['pixijs'],
    entities: ['user'],
    importance: 70,
    confidence: 0.8,
    reinforcementCount: 2,
    lastAccessedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    decayScore: 1.0,
    ...overrides,
  });

  describe('scoring', () => {
    it('calculates confidence from patterns', () => {
      const patterns = [createPattern({ confidence: 0.8 }), createPattern({ id: 'pattern_2', confidence: 0.6 })];
      const confidence = calculateInsightConfidence(patterns);
      expect(confidence).toBeGreaterThan(0.5);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('calculates importance from patterns and memories', () => {
      const patterns = [createPattern({ strength: 0.8 })];
      const memories = [createMemory({ importance: 80 })];
      const importance = calculateInsightImportance(patterns, memories);
      expect(importance).toBeGreaterThan(0.3);
    });

    it('calculates novelty from patterns', () => {
      const patterns = [createPattern({ reinforcementCount: 0 })];
      const novelty = calculateInsightNovelty(patterns);
      expect(novelty).toBeGreaterThan(0.5);
    });
  });

  describe('insight generation', () => {
    it('generates insights from multiple patterns', () => {
      const engine = new InsightEngine();
      const patterns = [
        createPattern({ category: 'interest', id: 'p1' }),
        createPattern({ category: 'learning', id: 'p2', type: 'repeated_topic' }),
      ];
      const memories = [createMemory()];

      const result = engine.generateInsights({ userId: 'user_1', patterns, memories });
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.metadata.patternsAnalyzed).toBe(2);
    });

    it('prevents duplicate insights', () => {
      const engine = new InsightEngine();
      const patterns = [createPattern({ category: 'interest', id: 'p1' })];
      const memories = [createMemory()];

      engine.generateInsights({ userId: 'user_1', patterns, memories });
      const result = engine.generateInsights({ userId: 'user_1', patterns, memories });

      expect(result.metadata.duplicatesPrevented).toBeGreaterThan(0);
    });

    it('retrieves insights by category', () => {
      const engine = new InsightEngine();
      const patterns = [
        createPattern({ category: 'interest', id: 'p1' }),
        createPattern({ category: 'learning', id: 'p2', type: 'repeated_topic' }),
      ];
      const memories = [createMemory()];

      engine.generateInsights({ userId: 'user_1', patterns, memories });

      const interestInsights = engine.getInsights({ categories: ['interest'] });
      expect(interestInsights.every((i) => i.category === 'interest')).toBe(true);
    });

    it('archives insights', () => {
      const engine = new InsightEngine();
      const patterns = [createPattern({ category: 'interest', id: 'p1' })];
      const memories = [createMemory()];

      const result = engine.generateInsights({ userId: 'user_1', patterns, memories });
      const insightId = result.insights[0].id;

      engine.archiveInsight(insightId);
      const archived = engine.getInsightById(insightId);
      expect(archived?.status).toBe('archived');
    });

    it('filters archived insights from default query', () => {
      const engine = new InsightEngine();
      const patterns = [createPattern({ category: 'interest', id: 'p1' })];
      const memories = [createMemory()];

      const result = engine.generateInsights({ userId: 'user_1', patterns, memories });
      engine.archiveInsight(result.insights[0].id);

      const activeInsights = engine.getInsights({ status: 'active' });
      expect(activeInsights.every((i) => i.status === 'active')).toBe(true);
    });
  });
});
