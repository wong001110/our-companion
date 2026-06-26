import { describe, expect, it } from 'vitest';
import { assessCuriosity, calculateCuriosityMomentum, createCuriosityBudget, generateCuriosityTargets, scoreCuriosity, scoreCuriosityInvestment, spendCuriosityBudget } from './index';
describe('curiosity engine', () => {
    it('scores curiosity from weighted inputs', () => {
        const score = scoreCuriosity({
            memoryRelevance: 1,
            patternStrength: 1,
            novelty: 0.5,
            relationshipFit: 0.5,
            characterFit: 0.5,
            surprise: 0
        });
        expect(score.finalScore).toBeGreaterThanOrEqual(0.7);
    });
    it('generates targets from memory when available', () => {
        const targets = generateCuriosityTargets({
            userId: 'default',
            characterState: {
                characterId: 'ann',
                coreState: 'idle',
                intent: 'waiting',
                emotion: {
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
                }
            },
            memoryNodes: [
                {
                    id: 'mem_1',
                    type: 'topic',
                    title: 'Desktop companion architecture',
                    summary: 'Ann should explore around desktop companion systems.',
                    importanceScore: 80,
                    createdAt: 'now',
                    updatedAt: 'now'
                }
            ],
            journeySummaries: [],
            patterns: [],
            interestGraph: { userId: 'default', nodes: [], edges: [], updatedAt: 'now' }
        });
        expect(targets[0]?.topic).toContain('Desktop');
    });
    it('assesses high-growth concepts and matches curiosity gaps', () => {
        const assessment = assessCuriosity({
            targetId: 'concept_1',
            targetType: 'concept',
            growthValue: 92,
            novelty: 0.8,
            gaps: [
                {
                    id: 'gap_1',
                    description: 'Evaluation for AI companions',
                    priority: 0.9,
                    status: 'open',
                    createdAt: 'now'
                }
            ]
        });
        expect(assessment.growthValue).toBeGreaterThan(85);
        expect(assessment.gapMatch?.gapId).toBe('gap_1');
    });
    it('reduces momentum after repeated ignored topics and spends budget', () => {
        const momentum = calculateCuriosityMomentum({ savedCount: 0, ignoredCount: 3 });
        const budget = spendCuriosityBudget(createCuriosityBudget('2026-06-26'), 12);
        const investment = scoreCuriosityInvestment({
            targetId: 'concept_1',
            longTermValue: 0.9,
            projectRelevance: 0.8,
            knowledgeGap: 0.7,
            userMomentum: momentum,
            novelty: 0.6,
            diminishingReturns: 0.2
        });
        expect(momentum).toBeLessThan(0.2);
        expect(budget.remaining).toBe(88);
        expect(investment.score).toBeGreaterThan(0.4);
    });
});
