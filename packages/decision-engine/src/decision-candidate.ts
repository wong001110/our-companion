import type {
  CompanionDecisionCandidate,
  CompanionDecisionContext,
} from '@our-companion/shared';
import { createId } from '@our-companion/shared';

function createCandidate(
  type: CompanionDecisionCandidate['type'],
  score: number,
  reason: string,
  options: Partial<Pick<CompanionDecisionCandidate, 'requiredInputs' | 'risks' | 'expectedUserValue' | 'interruptionCost' | 'confidence'>> = {}
): CompanionDecisionCandidate {
  return {
    id: createId('candidate'),
    type,
    score,
    reason,
    requiredInputs: options.requiredInputs ?? [],
    risks: options.risks ?? [],
    expectedUserValue: options.expectedUserValue ?? 0.5,
    interruptionCost: options.interruptionCost ?? 0,
    confidence: options.confidence ?? 0.5,
  };
}

export function generateCandidates(context: CompanionDecisionContext): CompanionDecisionCandidate[] {
  const candidates: CompanionDecisionCandidate[] = [];

  candidates.push(createCandidate(
    'stay_quiet',
    0.3,
    'Default safe behavior when no strong signal exists.',
    { interruptionCost: 0, expectedUserValue: 0.1, confidence: 0.9 }
  ));

  if (context.conversation.messageCount > 0 || context.user.mode === 'chatting') {
    candidates.push(createCandidate(
      'respond',
      0.6,
      'User is actively engaged in conversation.',
      { requiredInputs: ['conversationContext'], interruptionCost: 0.2, expectedUserValue: 0.7, confidence: 0.7 }
    ));
  }

  if (context.conversation.messageCount > 0 && context.insight.insightCount > 0) {
    candidates.push(createCandidate(
      'ask_question',
      0.55,
      'User is engaged and insights are available to inform questions.',
      { requiredInputs: ['conversationContext', 'insightContext'], interruptionCost: 0.3, expectedUserValue: 0.6, confidence: 0.6 }
    ));
  }

  if (context.insight.insightCount > 0 && context.insight.topInsightImportance > 0.6) {
    candidates.push(createCandidate(
      'share_discovery',
      0.65,
      'High-importance insight is available to share.',
      { requiredInputs: ['insightContext'], interruptionCost: 0.4, expectedUserValue: 0.75, confidence: 0.65 }
    ));
  }

  if (context.curiosity.targetCount > 0 && context.curiosity.topCuriosityScore > 0.7) {
    candidates.push(createCandidate(
      'start_discovery',
      0.6,
      'Strong curiosity target exists for exploration.',
      { requiredInputs: ['curiosityContext'], interruptionCost: 0.1, expectedUserValue: 0.65, confidence: 0.6 }
    ));
  }

  if (context.memory.memoryCount > 0 && context.memory.topMemoryImportance > 0.7) {
    candidates.push(createCandidate(
      'continue_journey',
      0.55,
      'Important memories suggest continuing an existing journey.',
      { requiredInputs: ['memoryContext'], interruptionCost: 0.2, expectedUserValue: 0.6, confidence: 0.55 }
    ));
  }

  if (context.insight.insightCount > 0) {
    candidates.push(createCandidate(
      'suggest_action',
      0.5,
      'Insight suggests a practical action.',
      { requiredInputs: ['insightContext'], interruptionCost: 0.35, expectedUserValue: 0.55, confidence: 0.5 }
    ));
  }

  if (context.memory.memoryCount > 3) {
    candidates.push(createCandidate(
      'update_memory',
      0.45,
      'Enough memories exist to potentially consolidate.',
      { requiredInputs: ['memoryContext'], interruptionCost: 0.05, expectedUserValue: 0.4, confidence: 0.5 }
    ));
  }

  if (context.character.energy > 50 && context.pattern.patternCount > 0) {
    candidates.push(createCandidate(
      'perform_character_reaction',
      0.5,
      'Character has energy and patterns exist to react to.',
      { requiredInputs: ['characterContext', 'patternContext'], interruptionCost: 0.15, expectedUserValue: 0.5, confidence: 0.5 }
    ));
  }

  return candidates;
}
