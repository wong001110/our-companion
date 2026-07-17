import { describe, expect, it } from 'vitest';
import { createJourney, createJourneyMilestone } from './index';

describe('journey engine', () => {
  it('creates the persisted journey shape', () => {
    const journey = createJourney({ title: 'Explore PixiJS', description: 'Learn rendering' });
    expect(journey).toMatchObject({ title: 'Explore PixiJS', status: 'active' });
    expect(journey.startedAt).toBeTruthy();
  });

  it('creates persisted milestones directly', () => {
    const milestone = createJourneyMilestone({ journeyId: 'journey_1', title: 'Saved', type: 'discovery_saved' });
    expect(milestone.journeyId).toBe('journey_1');
  });
});
