export type InitiativeCategory =
  | 'greeting'
  | 'discovery_sharing'
  | 'journey_reminder'
  | 'reflection_sharing'
  | 'emotional_checkin'
  | 'curiosity';

export interface InitiativeRequest {
  id: string;
  category: InitiativeCategory;
  source: string;
  payload?: unknown;
  requestedAt: string;
}

export interface InitiativeEvaluation {
  approved: boolean;
  category: InitiativeCategory;
  reason: string;
  delayMs?: number;
  cooldownKey: string;
}

export interface InitiativeCooldown {
  category: InitiativeCategory;
  lastExecutedAt: string;
  expiresAt: string;
}

export const INITIATIVE_PRIORITY: Record<InitiativeCategory, number> = {
  greeting: 10,
  discovery_sharing: 30,
  journey_reminder: 40,
  reflection_sharing: 20,
  emotional_checkin: 15,
  curiosity: 5,
};

export const INITIATIVE_COOLDOWN_MS: Record<InitiativeCategory, number> = {
  greeting: 24 * 60 * 60 * 1000,
  discovery_sharing: 4 * 60 * 60 * 1000,
  journey_reminder: 12 * 60 * 60 * 1000,
  reflection_sharing: 24 * 60 * 60 * 1000,
  emotional_checkin: 6 * 60 * 60 * 1000,
  curiosity: 2 * 60 * 60 * 1000,
};
