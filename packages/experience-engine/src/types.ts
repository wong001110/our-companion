import type { Experience } from '@our-companion/shared';

export interface ExperienceEngineInternal {
  experiences: Experience[];
  eventHandlers: ExperienceEventHandler[];
}

export type ExperienceEventHandler = (event: ExperienceEvent) => void;

export type ExperienceEventType = 'experience.captured' | 'experience.queried';

export interface ExperienceEvent {
  type: ExperienceEventType;
  experienceId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export function createExperienceEngineInternal(): ExperienceEngineInternal {
  return { experiences: [], eventHandlers: [] };
}

export const DEFAULT_EXPERIENCE_LIMIT = 100;
