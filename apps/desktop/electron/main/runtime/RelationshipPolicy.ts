import type { DatabaseService } from '@our-companion/database';
import type {
  FeedbackDomain,
  RelationshipSignal,
  UserCompanionRelationship
} from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';

export class RelationshipPolicy {
  constructor(private readonly db: DatabaseService) {}

  applySignal(
    userId: string,
    companionId: string,
    signal: RelationshipSignal
  ): UserCompanionRelationship {
    const rel = this.db.getRelationship(userId, companionId);
    const now = nowIso();

    switch (signal) {
      case 'conversation_completed':
        rel.familiarity = Math.min(100, rel.familiarity + 0.5);
        break;
      case 'positive_feedback':
        rel.recentPositiveInteractions += 1;
        rel.comfort = Math.min(100, rel.comfort + 0.5);
        rel.trust = Math.min(100, rel.trust + 0.25);
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
        rel.familiarity = Math.min(100, rel.familiarity + 0.25);
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
