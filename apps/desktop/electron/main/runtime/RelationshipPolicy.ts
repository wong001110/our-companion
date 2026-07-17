import type { DatabaseService } from '@our-companion/database';
import type {
  FeedbackDomain,
  RelationshipSignal,
  UserCompanionRelationship
} from '@our-companion/shared';
export class RelationshipPolicy {
  private readonly now: () => number;

  constructor(private readonly db: DatabaseService, deps: { now?: () => number } = {}) {
    this.now = deps.now ?? (() => Date.now());
  }

  applySignal(
    userId: string,
    companionId: string,
    signal: RelationshipSignal
  ): UserCompanionRelationship {
    const rel = this.db.getRelationship(userId, companionId);
    const now = new Date(this.now()).toISOString();

    switch (signal) {
      case 'conversation_completed':
        rel.familiarity = Math.min(1, rel.familiarity + 0.005);
        break;
      case 'positive_feedback':
        rel.recentPositiveInteractions += 1;
        rel.comfort = Math.min(1, rel.comfort + 0.005);
        rel.trust = Math.min(1, rel.trust + 0.0025);
        break;
      case 'user_correction':
        rel.recentCorrections += 1;
        break;
      case 'user_rejected':
        rel.recentIgnoredInteractions += 1;
        break;
      case 'ignored':
        rel.recentIgnoredInteractions += 1;
        break;
      case 'user_reengaged':
        rel.familiarity = Math.min(1, rel.familiarity + 0.0025);
        break;
      case 'not_now':
      case 'not_interested':
      case 'user_ended_conversation':
        break;
    }

    if (signal !== 'not_now' && signal !== 'not_interested') {
      rel.lastMeaningfulInteractionAt = now;
    }
    rel.updatedAt = now;
    this.db.saveRelationship(rel);
    return rel;
  }

  feedbackDomainForValue(value: string): FeedbackDomain {
    if (value === 'not_interested' || value === 'saved') return 'topic';
    if (value === 'not_now' || value === 'later') return 'timing';
    return 'interaction';
  }

  relationshipSignalForFeedback(value: string): RelationshipSignal | null {
    if (value === 'saved') return 'positive_feedback';
    if (value === 'not_interested') return 'not_interested';
    if (value === 'not_now' || value === 'later') return 'not_now';
    return null;
  }
}
