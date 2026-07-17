import { describe, expect, it } from 'vitest';
import { diaryFromReflection, generateDailyDiary, generateGrowthReflection } from './index';

describe('diary engine', () => {
  it('generates a daily diary from production context', () => {
    const diary = generateDailyDiary({
      characterId: 'ann',
      milestones: [],
      savedDiscoveries: [],
      completedTasks: [],
      memoryChanges: [{ id: 'mem_1', type: 'topic', title: 'Memory', importance: 0.8, createdAt: 'now', updatedAt: 'now' }],
    });
    expect(diary.characterId).toBe('ann');
    expect(diary.referencedMemoryIds).toEqual(['mem_1']);
  });

  it('generates growth-focused reflections and diary entries', () => {
    const reflection = generateGrowthReflection({
      knowledge: [
        {
          id: 'knowledge_1',
          title: 'Local-first memory matters',
          summary: 'Memory should stay local first.',
          conceptIds: ['concept_1'],
          insightIds: ['insight_1'],
          journeyIds: ['journey_1'],
          experienceIds: [],
          references: [],
          confidence: 0.8,
          strength: 4,
          status: 'active',
          createdAt: 'now',
          updatedAt: 'now'
        }
      ],
      milestones: [
        {
          id: 'milestone_1',
          journeyId: 'journey_1',
          title: 'Insight saved',
          type: 'reflection',
          occurredAt: 'now',
          createdAt: 'now'
        }
      ]
    });
    const diary = diaryFromReflection(reflection, 'test-companion');

    expect(reflection.changedUnderstanding).toContain('Local-first memory matters');
    expect(reflection.whyItMattered).toContain('persistent understanding');
    expect(diary.content).toContain('Local-first memory matters');
  });
});
