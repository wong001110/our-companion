import type {
  CompanionDecisionCandidate,
  CompanionDecisionContext,
  MemoryContextSnapshot,
  PatternContextSnapshot,
  InsightContextSnapshot,
  CuriosityContextSnapshot,
  CharacterContextSnapshot,
} from '@our-companion/shared';

export const MIN_SCORE_FOR_ACTION = 0.4;
export const MAX_CANDIDATES = 10;
export const DEFAULT_CONFIDENCE = 0.5;

export interface MemoryContextProvider {
  getMemoryContext(): Promise<MemoryContextSnapshot>;
}

export interface PatternContextProvider {
  getPatternContext(): Promise<PatternContextSnapshot>;
}

export interface InsightContextProvider {
  getInsightContext(): Promise<InsightContextSnapshot>;
}

export interface CuriosityContextProvider {
  getCuriosityContext(): Promise<CuriosityContextSnapshot>;
}

export interface CharacterContextProvider {
  getCharacterContext(): Promise<CharacterContextSnapshot>;
}

export interface CompanionBrainProviders {
  memory?: MemoryContextProvider;
  pattern?: PatternContextProvider;
  insight?: InsightContextProvider;
  curiosity?: CuriosityContextProvider;
  character?: CharacterContextProvider;
}
