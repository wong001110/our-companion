import { describe, expect, it } from 'vitest';
import {
  createJourneyFromConcepts,
  createMilestoneFromInsight,
  createCompanionJourney,
  createJourneyMilestoneV2,
  completeJourneyMilestone,
  addMemoryToJourney,
  addInsightToJourney,
  completeJourney,
  pauseJourney,
  resumeJourney,
  getJourneyProgress,
} from './index';

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

describe('journey engine v2', () => {
  it('creates companion journey', () => {
    const journey = createCompanionJourney({
      title: 'Explore PixiJS',
      description: 'Learn PixiJS for game development',
      origin: 'user',
    });

    expect(journey.title).toBe('Explore PixiJS');
    expect(journey.status).toBe('active');
    expect(journey.origin).toBe('user');
    expect(journey.milestones).toHaveLength(0);
  });

  it('creates journey milestone', () => {
    const milestone = createJourneyMilestoneV2({
      title: 'First sprite created',
      description: 'Created first animated sprite',
      status: 'completed',
    });

    expect(milestone.title).toBe('First sprite created');
    expect(milestone.status).toBe('completed');
  });

  it('completes milestone', () => {
    const milestone = createJourneyMilestoneV2({
      title: 'Learn basic rendering',
    });

    const completed = completeJourneyMilestone(milestone);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeTruthy();
  });

  it('adds memory to journey', () => {
    const journey = createCompanionJourney({
      title: 'Explore PixiJS',
      origin: 'user',
    });

    const updated = addMemoryToJourney(journey, 'mem_1');
    expect(updated.relatedMemories).toContain('mem_1');
  });

  it('prevents duplicate memory links', () => {
    const journey = createCompanionJourney({
      title: 'Explore PixiJS',
      origin: 'user',
    });

    const updated = addMemoryToJourney(journey, 'mem_1');
    const updated2 = addMemoryToJourney(updated, 'mem_1');
    expect(updated2.relatedMemories).toHaveLength(1);
  });

  it('completes journey', () => {
    const journey = createCompanionJourney({
      title: 'Explore PixiJS',
      origin: 'user',
    });

    const completed = completeJourney(journey);
    expect(completed.status).toBe('completed');
  });

  it('pauses and resumes journey', () => {
    const journey = createCompanionJourney({
      title: 'Explore PixiJS',
      origin: 'user',
    });

    const paused = pauseJourney(journey);
    expect(paused.status).toBe('paused');

    const resumed = resumeJourney(paused);
    expect(resumed.status).toBe('active');
  });

  it('calculates journey progress', () => {
    const journey = createCompanionJourney({
      title: 'Explore PixiJS',
      origin: 'user',
    });

    journey.milestones = [
      createJourneyMilestoneV2({ title: 'Milestone 1', status: 'completed' }),
      createJourneyMilestoneV2({ title: 'Milestone 2', status: 'pending' }),
      createJourneyMilestoneV2({ title: 'Milestone 3', status: 'completed' }),
    ];

    const progress = getJourneyProgress(journey);
    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(2);
    expect(progress.percentage).toBe(67);
  });
});
