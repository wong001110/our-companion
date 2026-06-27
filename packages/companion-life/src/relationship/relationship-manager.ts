import { nowIso } from '@our-companion/shared';
import type {
  RelationshipStage,
  RelationshipState,
  RelationshipSignal,
} from './types';
import { STAGE_ORDER, STAGE_THRESHOLDS } from './types';
import { calculateTrustChange, relationshipStrength, familiarityLevel } from './trust-calculator';

export class RelationshipManager {
  private state: RelationshipState;

  constructor(firstMeetAt?: string) {
    const now = nowIso();
    this.state = {
      stage: 'first_meet',
      trustScore: 5,
      sharedExperienceCount: 0,
      conversationCount: 0,
      journeyCount: 0,
      discoveryDiscussionCount: 0,
      timeTogetherDays: 0,
      lastInteractionAt: now,
      firstMeetAt: firstMeetAt ?? now,
    };
  }

  getState(): RelationshipState {
    return { ...this.state };
  }

  getStage(): RelationshipStage {
    return this.state.stage;
  }

  getTrustScore(): number {
    return this.state.trustScore;
  }

  getFamiliarity(): number {
    return familiarityLevel(this.state);
  }

  getStrength(): number {
    return relationshipStrength(this.state);
  }

  recordInteraction(): void {
    this.state = {
      ...this.state,
      lastInteractionAt: nowIso(),
      conversationCount: this.state.conversationCount + 1,
    };
    this.updateTimeTogether();
    this.evaluateStage();
  }

  recordSharedExperience(): void {
    this.state = {
      ...this.state,
      sharedExperienceCount: this.state.sharedExperienceCount + 1,
      lastInteractionAt: nowIso(),
    };
    this.evaluateStage();
  }

  recordJourneyCreated(): void {
    this.state = {
      ...this.state,
      journeyCount: this.state.journeyCount + 1,
    };
  }

  recordDiscoveryDiscussion(): void {
    this.state = {
      ...this.state,
      discoveryDiscussionCount: this.state.discoveryDiscussionCount + 1,
    };
  }

  applySignal(signal: RelationshipSignal): void {
    const trustChange = calculateTrustChange(this.state.trustScore, signal);
    this.state = {
      ...this.state,
      trustScore: Math.min(100, Math.max(0, this.state.trustScore + trustChange)),
      lastInteractionAt: nowIso(),
    };
    this.evaluateStage();
  }

  getBehaviorCharacteristics(): {
    formal: boolean;
    initiativeFrequency: string;
    memoryReferences: string;
    conversationStyle: string;
  } {
    const characteristics: Record<RelationshipStage, {
      formal: boolean;
      initiativeFrequency: string;
      memoryReferences: string;
      conversationStyle: string;
    }> = {
      first_meet: {
        formal: true,
        initiativeFrequency: 'minimal',
        memoryReferences: 'none',
        conversationStyle: 'reserved',
      },
      getting_familiar: {
        formal: false,
        initiativeFrequency: 'occasional',
        memoryReferences: 'recent',
        conversationStyle: 'friendly',
      },
      trusted_companion: {
        formal: false,
        initiativeFrequency: 'moderate',
        memoryReferences: 'long_term',
        conversationStyle: 'warm',
      },
      long_term_companion: {
        formal: false,
        initiativeFrequency: 'moderate',
        memoryReferences: 'rich',
        conversationStyle: 'intimate',
      },
      lifelong_companion: {
        formal: false,
        initiativeFrequency: 'moderate',
        memoryReferences: 'comprehensive',
        conversationStyle: 'deep',
      },
    };
    return characteristics[this.state.stage];
  }

  private evaluateStage(): void {
    const current = this.state.stage;
    const currentIdx = STAGE_ORDER.indexOf(current);

    for (let i = STAGE_ORDER.length - 1; i > currentIdx; i--) {
      const stage = STAGE_ORDER[i];
      const thresholds = STAGE_THRESHOLDS[stage];
      if (
        this.state.trustScore >= thresholds.trust &&
        this.state.sharedExperienceCount >= thresholds.experiences &&
        this.state.timeTogetherDays >= thresholds.days
      ) {
        this.state = { ...this.state, stage };
        return;
      }
    }
  }

  private updateTimeTogether(): void {
    const first = new Date(this.state.firstMeetAt);
    const now = new Date();
    const days = Math.floor((now.getTime() - first.getTime()) / (24 * 60 * 60 * 1000));
    this.state = { ...this.state, timeTogetherDays: days };
  }
}
