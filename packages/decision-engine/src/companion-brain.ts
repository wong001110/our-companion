import type {
  CompanionDecisionInput,
  CompanionDecisionContext,
  CompanionDecisionCandidate,
  CompanionDecisionResult,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { buildDecisionContext } from './decision-context-builder';
import { generateCandidates } from './decision-candidate';
import { scoreCandidate } from './decision-scoring';
import { shouldInterrupt } from './interruption-policy';
import type { CompanionBrainProviders } from './types';
import { MIN_SCORE_FOR_ACTION } from './types';

export class CompanionBrain {
  private providers: CompanionBrainProviders;

  constructor(providers: CompanionBrainProviders = {}) {
    this.providers = providers;
  }

  buildContext(input: CompanionDecisionInput): CompanionDecisionContext {
    const user = input.userContext ?? {
      mode: 'idle' as const,
      localTime: nowIso(),
      recentActions: [],
      fatigueScore: 0,
    };

    return {
      user,
      conversation: input.conversationContext ?? { recentMessages: [], messageCount: 0 },
      memory: input.memoryContext ?? { relevantMemories: [], memoryCount: 0, topMemoryImportance: 0 },
      pattern: input.patternContext ?? { activePatterns: [], patternCount: 0, topPatternConfidence: 0 },
      insight: input.insightContext ?? { recentInsights: [], insightCount: 0, topInsightImportance: 0 },
      curiosity: input.curiosityContext ?? { curiosityTargets: [], targetCount: 0, topCuriosityScore: 0 },
      character: input.characterContext ?? { mood: 'neutral', energy: 70 },
      timestamp: input.timestamp ?? nowIso(),
    };
  }

  evaluateCandidates(context: CompanionDecisionContext): CompanionDecisionCandidate[] {
    const candidates = generateCandidates(context);
    return candidates.map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, context),
    }));
  }

  decide(input: CompanionDecisionInput): CompanionDecisionResult {
    const context = this.buildContext(input);
    const candidates = this.evaluateCandidates(context);

    const scored = candidates
      .sort((a, b) => b.score - a.score);

    const selected = scored[0];
    const rejected = scored.slice(1);

    const canInterrupt = shouldInterrupt(selected, context);

    const reasoningSummary = this.buildReasoningSummary(selected, context, canInterrupt);

    return {
      id: createId('decision'),
      selectedCandidate: selected,
      rejectedCandidates: rejected,
      reasoningSummary,
      confidence: selected.confidence,
      shouldInterruptUser: canInterrupt,
      recommendedNextEngine: this.recommendNextEngine(selected.type),
      recommendedAction: this.recommendAction(selected.type),
      createdAt: nowIso(),
    };
  }

  private buildReasoningSummary(
    candidate: CompanionDecisionCandidate,
    context: CompanionDecisionContext,
    canInterrupt: boolean
  ): string {
    const parts: string[] = [];

    parts.push(`Selected ${candidate.type} because: ${candidate.reason}.`);

    if (!canInterrupt) {
      parts.push('Interruption was blocked by safety policy.');
    }

    if (context.user.mode !== 'idle') {
      parts.push(`User is currently ${context.user.mode}.`);
    }

    if (context.insight.insightCount > 0) {
      parts.push(`${context.insight.insightCount} insights available.`);
    }

    return parts.join(' ');
  }

  private recommendNextEngine(type: string): string | undefined {
    const engineMap: Record<string, string> = {
      respond: 'speech-engine',
      ask_question: 'speech-engine',
      share_discovery: 'discovery-engine',
      start_discovery: 'discovery-engine',
      continue_journey: 'journey-engine',
      suggest_action: 'action-engine',
      update_memory: 'memory-engine',
      perform_character_reaction: 'character-engine',
    };
    return engineMap[type];
  }

  private recommendAction(type: string): string | undefined {
    const actionMap: Record<string, string> = {
      respond: 'send_reply',
      ask_question: 'ask_user',
      share_discovery: 'announce_discovery',
      start_discovery: 'begin_exploration',
      continue_journey: 'resume_journey',
      suggest_action: 'propose_action',
      update_memory: 'consolidate_memory',
      perform_character_reaction: 'update_character_state',
    };
    return actionMap[type];
  }
}
