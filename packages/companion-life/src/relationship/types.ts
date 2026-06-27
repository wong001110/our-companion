export type RelationshipStage =
  | 'first_meet'
  | 'getting_familiar'
  | 'trusted_companion'
  | 'long_term_companion'
  | 'lifelong_companion';

export interface RelationshipState {
  stage: RelationshipStage;
  trustScore: number;
  sharedExperienceCount: number;
  conversationCount: number;
  journeyCount: number;
  discoveryDiscussionCount: number;
  timeTogetherDays: number;
  lastInteractionAt: string;
  firstMeetAt: string;
}

export interface RelationshipSignal {
  type: string;
  impact: number;
  timestamp: string;
}

export const STAGE_ORDER: RelationshipStage[] = [
  'first_meet',
  'getting_familiar',
  'trusted_companion',
  'long_term_companion',
  'lifelong_companion',
];

export const STAGE_THRESHOLDS: Record<RelationshipStage, { trust: number; experiences: number; days: number }> = {
  first_meet: { trust: 0, experiences: 0, days: 0 },
  getting_familiar: { trust: 20, experiences: 5, days: 3 },
  trusted_companion: { trust: 50, experiences: 20, days: 14 },
  long_term_companion: { trust: 75, experiences: 50, days: 60 },
  lifelong_companion: { trust: 90, experiences: 100, days: 180 },
};
