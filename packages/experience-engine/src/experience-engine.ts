import type { Experience, ExperienceType } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import type { ExperienceEngineInternal, ExperienceEvent, ExperienceEventHandler } from './types';
import { createExperienceEngineInternal, DEFAULT_EXPERIENCE_LIMIT } from './types';

export interface CaptureExperienceInput {
  type: ExperienceType;
  description: string;
  source: string;
  signalIds?: string[];
  privacyLevel?: Experience['privacyLevel'];
  metadata?: Record<string, unknown>;
}

export interface ExperienceQuery {
  type?: ExperienceType;
  source?: string;
  limit?: number;
  since?: string;
}

export class ExperienceEngine {
  private internal: ExperienceEngineInternal;

  constructor(initialState?: Partial<ExperienceEngineInternal>) {
    this.internal = {
      ...createExperienceEngineInternal(),
      ...initialState,
    };
  }

  onEvent(handler: ExperienceEventHandler): () => void {
    this.internal.eventHandlers.push(handler);
    return () => {
      const idx = this.internal.eventHandlers.indexOf(handler);
      if (idx >= 0) this.internal.eventHandlers.splice(idx, 1);
    };
  }

  private emit(type: ExperienceEvent['type'], experienceId: string, metadata?: Record<string, unknown>): void {
    const event: ExperienceEvent = {
      type,
      experienceId,
      timestamp: nowIso(),
      metadata,
    };
    for (const handler of this.internal.eventHandlers) {
      handler(event);
    }
  }

  captureExperience(input: CaptureExperienceInput): Experience {
    const experience: Experience = {
      id: createId('exp'),
      type: input.type,
      description: input.description,
      occurredAt: nowIso(),
      privacyLevel: input.privacyLevel ?? 'private',
      signalIds: input.signalIds,
    };

    this.internal.experiences.unshift(experience);
    this.emit('experience.captured', experience.id, input.metadata);
    return experience;
  }

  listExperiences(query: ExperienceQuery = {}): Experience[] {
    let results = [...this.internal.experiences];

    if (query.type) {
      results = results.filter((e) => e.type === query.type);
    }
    if (query.source) {
      results = results.filter((e) => e.description.toLowerCase().includes(query.source!.toLowerCase()));
    }
    if (query.since) {
      const sinceTime = new Date(query.since).getTime();
      results = results.filter((e) => new Date(e.occurredAt).getTime() >= sinceTime);
    }

    const limit = query.limit ?? DEFAULT_EXPERIENCE_LIMIT;
    return results.slice(0, limit);
  }

  getExperienceById(id: string): Experience | undefined {
    return this.internal.experiences.find((e) => e.id === id);
  }

  getExperienceCount(): number {
    return this.internal.experiences.length;
  }

  getAllExperiences(): Experience[] {
    return [...this.internal.experiences];
  }
}
