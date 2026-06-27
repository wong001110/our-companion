import type { AppContext } from './appContext';
import type { CreateJourneyInput, AddJourneyMilestoneInput } from '@our-companion/shared';
import { createJourney, createJourneyMilestone } from '@our-companion/journey-engine';

export class JourneyApplicationService {
  constructor(private readonly ctx: AppContext) {}

  create = async (input: CreateJourneyInput) => this.ctx.db.insertJourney(createJourney(input));
  getActive = async () => this.ctx.db.listActiveJourneys();
  getTimeline = async (input: { journeyId?: string } = {}) => this.ctx.db.listMilestones(input.journeyId);
  addMilestone = async (input: AddJourneyMilestoneInput) => this.ctx.db.insertMilestone(createJourneyMilestone(input));
}
