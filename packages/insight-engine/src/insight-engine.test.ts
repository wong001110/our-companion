import { describe, expect, it } from 'vitest';
import { generateInsights, scoreInsight, selectPrimaryInsight } from './index';

const emotion = {
  neutral: 70, curious: 65, happy: 20, excited: 0, shy: 45,
  confused: 0, focused: 50, tired: 10, proud: 0, concerned: 0,
};

describe('insight engine', () => {
  it('scores insight selection', () => {
    expect(scoreInsight({
      confidence: 0.8, novelty: 0.7, emotionalRelevance: 0.9,
      practicalRelevance: 0.6, relationshipFit: 0.7,
    }).finalScore).toBeGreaterThan(0.7);
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
        id: 'curiosity_1', userId: 'default', companionId: 'ann', topic: 'Ambient AI',
        description: 'Explore ambient AI', source: 'character_trigger', explorationType: 'adjacent',
        priority: 0.8, confidence: 0.7, reason: 'It fits.', expectedValue: 'Useful.', createdAt: 'now',
      },
      discoveryCandidates: [{
        id: 'candidate_1', userId: 'default', companionId: 'ann', title: 'Calm technology notes',
        summary: 'A practical signal.', sourceType: 'article', agentType: 'research',
        relatedCuriosityTargetId: 'curiosity_1', relevanceScore: 0.8, noveltyScore: 0.7,
        evidenceScore: 0.7, usefulnessScore: 0.75, collectedAt: 'now',
      }],
    });
    expect(selectPrimaryInsight(insights)?.explanation).toContain('points toward');
  });
});
