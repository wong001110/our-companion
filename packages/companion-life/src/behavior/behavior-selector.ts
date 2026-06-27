import { createId, nowIso } from '@our-companion/shared';
import type { ContextCategory } from '../context/types';
import type {
  BehaviorCategory,
  BehaviorRequest,
  BehaviorSelection,
} from './types';
import { BEHAVIOR_PRIORITY, CONTEXT_BEHAVIOR_MAP } from './types';
import { CooldownManager } from './cooldown-manager';

export interface BehaviorSelectorInput {
  context: ContextCategory;
  userActive: boolean;
  hasPendingDiscovery: boolean;
  hasReflectionDue: boolean;
  hasJourneyUpdate: boolean;
  conversationActive: boolean;
  recentInteractions: number;
}

export class BehaviorSelector {
  private readonly cooldowns = new CooldownManager();

  select(input: BehaviorSelectorInput): BehaviorSelection {
    const candidates = this.getCandidates(input);

    const available = candidates.filter(
      (cat) => !this.cooldowns.isOnCooldown(cat)
    );

    if (available.length === 0) {
      return {
        category: 'observe',
        reason: 'All behaviors on cooldown, defaulting to observe',
        confidence: 0.5,
        cooldownKey: 'observe',
      };
    }

    const sorted = available.sort(
      (a, b) => BEHAVIOR_PRIORITY[b] - BEHAVIOR_PRIORITY[a]
    );

    const selected = sorted[0];
    return {
      category: selected,
      reason: this.reasonForSelection(selected, input),
      confidence: this.confidenceForSelection(selected, input),
      cooldownKey: selected,
    };
  }

  markExecuted(category: BehaviorCategory, cooldownMs?: number): void {
    this.cooldowns.setCooldown(category, cooldownMs);
  }

  getCooldowns(): ReturnType<CooldownManager['getAll']> {
    return this.cooldowns.getAll();
  }

  private getCandidates(input: BehaviorSelectorInput): BehaviorCategory[] {
    const contextBehaviors = CONTEXT_BEHAVIOR_MAP[input.context] ?? ['observe'];
    const candidates = new Set<BehaviorCategory>(contextBehaviors);

    if (input.conversationActive) {
      candidates.add('interact');
    }

    if (input.hasPendingDiscovery) {
      candidates.add('recommend');
    }

    if (input.hasReflectionDue) {
      candidates.add('reflect');
    }

    if (input.hasJourneyUpdate) {
      candidates.add('recommend');
    }

    if (!input.userActive) {
      candidates.add('organize');
      candidates.add('explore');
      candidates.add('rest');
    }

    if (input.userActive && input.recentInteractions > 5) {
      candidates.delete('recommend');
      candidates.add('wait');
    }

    return Array.from(candidates);
  }

  private reasonForSelection(category: BehaviorCategory, input: BehaviorSelectorInput): string {
    const reasons: Record<BehaviorCategory, string> = {
      observe: `Context is ${input.context}, observing environment`,
      wait: 'User has had many recent interactions, waiting',
      interact: 'User is engaged in conversation',
      recommend: 'Pending discovery or journey update available',
      reflect: 'Reflection is due based on recent activity',
      organize: 'User inactive, organizing notebook and memory',
      explore: 'User inactive, running background exploration',
      rest: `Context is ${input.context}, reducing activity`,
    };
    return reasons[category];
  }

  private confidenceForSelection(category: BehaviorCategory, input: BehaviorSelectorInput): number {
    if (category === 'interact' && input.conversationActive) return 0.9;
    if (category === 'recommend' && input.hasPendingDiscovery) return 0.8;
    if (category === 'reflect' && input.hasReflectionDue) return 0.75;
    if (category === 'rest' && input.context === 'sleeping') return 0.95;
    if (category === 'observe') return 0.7;
    return 0.6;
  }
}

export function createBehaviorRequest(
  category: BehaviorCategory,
  source: string,
  reason: string,
  priority?: number,
  payload?: unknown
): BehaviorRequest {
  return {
    id: createId('behaviour'),
    category,
    source,
    priority: priority ?? BEHAVIOR_PRIORITY[category],
    reason,
    payload,
    requestedAt: nowIso(),
  };
}
