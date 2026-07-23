import type { GroundedClaim, GroundedClaimType, MemoryNode } from '@our-companion/shared';
import { decideMemoryDisclosure, minimalBoundaryConstraint } from './MemoryDisclosurePolicy';

/** Kept explicit so fixture calibration can change it without changing validation flow. */
export const MIN_GROUNDING_SUPPORT_SIMILARITY = 0.72;
export const MAX_GROUNDING_MEMORY_CHARACTERS = 2_000;

export interface GroundingEmbeddingProvider {
  embedQuery(text: string): Promise<Float32Array>;
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
}

export type GroundingValidationReason =
  | 'MEMORY_ID_NOT_SELECTED'
  | 'MEMORY_NOT_FOUND'
  | 'MEMORY_SCOPE_MISMATCH'
  | 'MEMORY_INACTIVE'
  | 'MEMORY_MARKED_WRONG'
  | 'MEMORY_NOT_DISCLOSABLE'
  | 'MEMORY_TYPE_MISMATCH'
  | 'MEMORY_SEMANTIC_SUPPORT_TOO_LOW';

export interface GroundingValidationInput {
  claims: GroundedClaim[];
  selectedMemories: MemoryNode[];
  selectedMemoryIds: string[];
  userId: string;
  companionId: string;
  currentUserMessage?: string;
}

export interface GroundingClaimValidation {
  claimId: string;
  valid: boolean;
  reason?: GroundingValidationReason;
  supportingMemoryIds: string[];
  semanticScores?: Record<string, number>;
}

export interface GroundingValidationResult {
  passed: boolean;
  claims: GroundingClaimValidation[];
}

/**
 * Validates explicit citations only. It deliberately does not infer Memory
 * claims from reply wording, so the protocol is language-independent.
 */
export class GroundingValidator {
  constructor(private readonly embeddings: GroundingEmbeddingProvider) {}

  async validate(input: GroundingValidationInput): Promise<GroundingValidationResult> {
    const selected = new Set(input.selectedMemoryIds);
    const memories = new Map(input.selectedMemories.map((memory) => [memory.id, memory]));
    const results: GroundingClaimValidation[] = [];
    for (const claim of input.claims) {
      let failure: GroundingValidationReason | undefined;
      const cited: MemoryNode[] = [];
      for (const id of claim.supportingMemoryIds) {
        if (!selected.has(id)) { failure ??= 'MEMORY_ID_NOT_SELECTED'; continue; }
        const memory = memories.get(id);
        if (!memory) { failure ??= 'MEMORY_NOT_FOUND'; continue; }
        if (memory.userId !== input.userId || (memory.companionId && memory.companionId !== input.companionId)) { failure ??= 'MEMORY_SCOPE_MISMATCH'; continue; }
        if (memory.status !== undefined && memory.status !== 'active') { failure ??= 'MEMORY_INACTIVE'; continue; }
        if (memory.isMarkedWrong) { failure ??= 'MEMORY_MARKED_WRONG'; continue; }
        const disclosure = decideMemoryDisclosure({ memory, target: 'main_prompt', currentUserMessage: input.currentUserMessage });
        if (!disclosure.allowed) { failure ??= 'MEMORY_NOT_DISCLOSABLE'; continue; }
        if (!isCompatibleType(claim.type, memory.memoryType)) { failure ??= 'MEMORY_TYPE_MISMATCH'; continue; }
        cited.push(memory);
      }
      if (failure) {
        results.push({ claimId: claim.claimId, valid: false, reason: failure, supportingMemoryIds: claim.supportingMemoryIds });
        continue;
      }
      const scores = await this.semanticScores(claim.text, cited, input.currentUserMessage);
      const supported = Object.values(scores).some((score) => score >= MIN_GROUNDING_SUPPORT_SIMILARITY);
      results.push({ claimId: claim.claimId, valid: supported, reason: supported ? undefined : 'MEMORY_SEMANTIC_SUPPORT_TOO_LOW', supportingMemoryIds: claim.supportingMemoryIds, semanticScores: scores });
    }
    return { passed: results.every((result) => result.valid), claims: results };
  }

  private async semanticScores(claim: string, memories: MemoryNode[], currentUserMessage?: string): Promise<Record<string, number>> {
    const claimVector = await this.embeddings.embedQuery(claim);
    const safeRecords = memories.map((memory) => buildSafeGroundingRepresentation(memory, currentUserMessage));
    const memoryVectors = await this.embeddings.embedDocuments(safeRecords);
    return Object.fromEntries(memories.map((memory, index) => [memory.id, cosineSimilarity(claimVector, memoryVectors[index] ?? new Float32Array())]));
  }
}

export function buildSafeGroundingRepresentation(memory: MemoryNode, currentUserMessage?: string): string {
  const disclosure = decideMemoryDisclosure({ memory, target: 'main_prompt', currentUserMessage });
  if (!disclosure.allowed) return '';
  if (memory.memoryType === 'user_boundary') return minimalBoundaryConstraint(memory);
  return [memory.title, memory.summary, memory.content].filter(Boolean).join('\n').slice(0, MAX_GROUNDING_MEMORY_CHARACTERS);
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0; let leftMagnitude = 0; let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]; leftMagnitude += left[index] ** 2; rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0;
}

function isCompatibleType(claimType: GroundedClaimType, memoryType?: string): boolean {
  return claimType === memoryType;
}
