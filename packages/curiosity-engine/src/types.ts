import type { CuriosityCandidate, CuriositySource, ExplorationType } from '@our-companion/shared';

export const MIN_CANDIDATE_PRIORITY = 0.3;
export const MAX_CANDIDATES_IN_QUEUE = 20;
export const CANDIDATE_EXPIRY_DAYS = 30;
export const DEDUP_SIMILARITY_THRESHOLD = 0.8;

export type CandidateGenerator = (
  input: Record<string, unknown>,
  userId: string
) => CuriosityCandidate[];

export interface CuriosityEngineInternal {
  queue: Map<string, CuriosityCandidate>;
  generators: CandidateGenerator[];
}
