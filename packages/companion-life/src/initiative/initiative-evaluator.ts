import { createId, nowIso } from '@our-companion/shared';
import type { ContextCategory } from '../context/types';
import type { AttentionManager } from '../attention/attention-manager';
import type {
  InitiativeCategory,
  InitiativeRequest,
  InitiativeEvaluation,
} from './types';
import { INITIATIVE_PRIORITY } from './types';
import { InitiativeCooldownManager } from './cooldown-rules';

export interface InitiativeEvaluatorInput {
  context: ContextCategory;
  userActive: boolean;
  conversationActive: boolean;
  hasNewDiscovery: boolean;
  hasPendingJourney: boolean;
  hasReflectionReady: boolean;
  timeSinceLastGreeting?: number;
  relationshipStage?: string;
}

export class InitiativeEvaluator {
  private readonly cooldowns = new InitiativeCooldownManager();

  evaluate(
    request: InitiativeRequest,
    input: InitiativeEvaluatorInput,
    attention?: AttentionManager
  ): InitiativeEvaluation {
    if (this.cooldowns.isOnCooldown(request.category)) {
      return {
        approved: false,
        category: request.category,
        reason: `Cooldown active for ${request.category}`,
        delayMs: this.cooldowns.getRemainingMs(request.category),
        cooldownKey: request.category,
      };
    }

    if (this.isContextBlocking(request.category, input.context)) {
      return {
        approved: false,
        category: request.category,
        reason: `Context ${input.context} blocks ${request.category}`,
        cooldownKey: request.category,
      };
    }

    if (input.conversationActive && request.category !== 'emotional_checkin') {
      return {
        approved: false,
        category: request.category,
        reason: 'Conversation is active, deferring initiative',
        delayMs: 30_000,
        cooldownKey: request.category,
      };
    }

    if (attention && !attention.canAcceptNewFocus('discovery') && request.category === 'discovery_sharing') {
      return {
        approved: false,
        category: request.category,
        reason: 'Higher priority attention active',
        delayMs: 60_000,
        cooldownKey: request.category,
      };
    }

    if (!input.userActive && request.category === 'greeting') {
      return {
        approved: false,
        category: request.category,
        reason: 'User not active, greeting deferred',
        delayMs: 300_000,
        cooldownKey: request.category,
      };
    }

    this.cooldowns.recordExecution(request.category);
    return {
      approved: true,
      category: request.category,
      reason: `Approved: ${request.category} at ${nowIso()}`,
      cooldownKey: request.category,
    };
  }

  getCooldowns(): InitiativeCooldownManager {
    return this.cooldowns;
  }

  private isContextBlocking(category: InitiativeCategory, context: ContextCategory): boolean {
    const blockMap: Partial<Record<ContextCategory, InitiativeCategory[]>> = {
      meeting: ['discovery_sharing', 'journey_reminder', 'reflection_sharing', 'curiosity'],
      gaming: ['discovery_sharing', 'journey_reminder', 'curiosity'],
      sleeping: ['discovery_sharing', 'journey_reminder', 'reflection_sharing', 'curiosity', 'emotional_checkin'],
    };
    return blockMap[context]?.includes(category) ?? false;
  }
}

export function createInitiativeRequest(
  category: InitiativeCategory,
  source: string,
  payload?: unknown
): InitiativeRequest {
  return {
    id: createId('init'),
    category,
    source,
    payload,
    requestedAt: nowIso(),
  };
}
