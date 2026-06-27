import type {
  CompanionDecisionInput,
  CompanionDecisionContext,
  UserContextSnapshot,
  ConversationContextSnapshot,
  MemoryContextSnapshot,
  PatternContextSnapshot,
  InsightContextSnapshot,
  CuriosityContextSnapshot,
  CharacterContextSnapshot,
} from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import type { CompanionBrainProviders } from './types';

function defaultUserContext(): UserContextSnapshot {
  return {
    mode: 'idle',
    localTime: nowIso(),
    recentActions: [],
    fatigueScore: 0,
  };
}

function defaultConversationContext(): ConversationContextSnapshot {
  return {
    recentMessages: [],
    messageCount: 0,
  };
}

function defaultMemoryContext(): MemoryContextSnapshot {
  return {
    relevantMemories: [],
    memoryCount: 0,
    topMemoryImportance: 0,
  };
}

function defaultPatternContext(): PatternContextSnapshot {
  return {
    activePatterns: [],
    patternCount: 0,
    topPatternConfidence: 0,
  };
}

function defaultInsightContext(): InsightContextSnapshot {
  return {
    recentInsights: [],
    insightCount: 0,
    topInsightImportance: 0,
  };
}

function defaultCuriosityContext(): CuriosityContextSnapshot {
  return {
    curiosityTargets: [],
    targetCount: 0,
    topCuriosityScore: 0,
  };
}

function defaultCharacterContext(): CharacterContextSnapshot {
  return {
    mood: 'neutral',
    energy: 70,
  };
}

export async function buildDecisionContext(
  input: CompanionDecisionInput,
  providers?: CompanionBrainProviders
): Promise<CompanionDecisionContext> {
  const user = input.userContext ?? defaultUserContext();
  const conversation = input.conversationContext ?? defaultConversationContext();

  let memory = input.memoryContext ?? defaultMemoryContext();
  let pattern = input.patternContext ?? defaultPatternContext();
  let insight = input.insightContext ?? defaultInsightContext();
  let curiosity = input.curiosityContext ?? defaultCuriosityContext();
  let character = input.characterContext ?? defaultCharacterContext();

  if (providers?.memory && !input.memoryContext) {
    memory = await providers.memory.getMemoryContext();
  }
  if (providers?.pattern && !input.patternContext) {
    pattern = await providers.pattern.getPatternContext();
  }
  if (providers?.insight && !input.insightContext) {
    insight = await providers.insight.getInsightContext();
  }
  if (providers?.curiosity && !input.curiosityContext) {
    curiosity = await providers.curiosity.getCuriosityContext();
  }
  if (providers?.character && !input.characterContext) {
    character = await providers.character.getCharacterContext();
  }

  return {
    user,
    conversation,
    memory,
    pattern,
    insight,
    curiosity,
    character,
    timestamp: input.timestamp ?? nowIso(),
  };
}
