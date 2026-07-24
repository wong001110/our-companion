import type { GroundedReplySegment, MemoryNode, ReplySegmentProvenance } from '@our-companion/shared';
import { decideMemoryDisclosure, minimalBoundaryConstraint } from './MemoryDisclosurePolicy';

/** Conservative initial values; `qa:e5-grounding` records real-model calibration evidence. */
export const MIN_GROUNDING_SUPPORT_SIMILARITY = 0.74;
export const UNDECLARED_MEMORY_SIMILARITY_THRESHOLD = 0.86;
export const UNDECLARED_MEMORY_CURRENT_TURN_MARGIN = 0.12;
export const MAX_GROUNDING_MEMORY_CHARACTERS = 2_000;

export interface GroundingRuntimeStatus {
  available: boolean;
  modelId: 'Xenova/multilingual-e5-small';
  reason?: 'model_not_installed' | 'model_load_failed' | 'dimension_mismatch';
}

export interface GroundingEmbeddingProvider {
  embedQuery(text: string): Promise<Float32Array>;
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  getStatus?: () => { state: string; modelId: string; error?: string };
}

export type GroundingValidationReason =
  | 'MEMORY_ID_NOT_SELECTED' | 'MEMORY_NOT_FOUND' | 'MEMORY_SCOPE_MISMATCH'
  | 'MEMORY_INACTIVE' | 'MEMORY_MARKED_WRONG' | 'MEMORY_NOT_DISCLOSABLE'
  | 'MEMORY_TYPE_MISMATCH' | 'MEMORY_SEMANTIC_SUPPORT_TOO_LOW'
  | 'UNDECLARED_MEMORY_USAGE' | 'GROUNDING_EMBEDDING_UNAVAILABLE';

export interface GroundingValidationInput {
  segments: GroundedReplySegment[];
  selectedMemories: MemoryNode[];
  selectedMemoryIds: string[];
  userId: string;
  companionId: string;
  currentUserMessage: string;
}

export interface GroundingSegmentValidation {
  segmentId: string;
  provenance: ReplySegmentProvenance;
  supportingMemoryId?: string;
  valid: boolean;
  reason?: GroundingValidationReason;
  similarity?: number;
}

export interface GroundingValidationResult {
  passed: boolean;
  embeddingAvailable: boolean;
  segments: GroundingSegmentValidation[];
}

const CONVERSATIONAL_MEMORY_TYPES = new Set([
  'user_fact', 'user_preference', 'user_boundary', 'goal', 'shared_experience', 'relationship_memory',
]);

/** Language-independent structured provenance validation and conservative audit. */
export class GroundingValidator {
  constructor(private readonly embeddings: GroundingEmbeddingProvider) {}

  getRuntimeStatus(): GroundingRuntimeStatus {
    const status = this.embeddings.getStatus?.();
    if (!status || status.state === 'ready') return { available: true, modelId: 'Xenova/multilingual-e5-small' };
    const error = status.error ?? '';
    return {
      available: false,
      modelId: 'Xenova/multilingual-e5-small',
      reason: /DIMENSION/i.test(error) ? 'dimension_mismatch' : status.state === 'not-installed' ? 'model_not_installed' : 'model_load_failed',
    };
  }

  async validate(input: GroundingValidationInput): Promise<GroundingValidationResult> {
    const selected = new Set(input.selectedMemoryIds);
    const memories = new Map(input.selectedMemories.map((memory) => [memory.id, memory]));
    const results: GroundingSegmentValidation[] = [];
    const memorySegments: Array<{ segment: GroundedReplySegment; memory: MemoryNode }> = [];

    for (const segment of input.segments) {
      if (segment.provenance !== 'memory') continue;
      const failure = this.validateMemorySegment(segment, selected, memories, input);
      if (failure) results.push({ segmentId: segment.segmentId, provenance: segment.provenance, supportingMemoryId: segment.supportingMemoryId, valid: false, reason: failure });
      else memorySegments.push({ segment, memory: memories.get(segment.supportingMemoryId!)! });
    }

    if (memorySegments.length) {
      try {
        const segmentVectors = await Promise.all(memorySegments.map(({ segment }) => this.embeddings.embedQuery(segment.text)));
        const memoryVectors = await this.embeddings.embedDocuments(memorySegments.map(({ memory }) => buildSafeGroundingRepresentation(memory, input.currentUserMessage)));
        memorySegments.forEach(({ segment }, index) => {
          const similarity = cosineSimilarity(segmentVectors[index], memoryVectors[index]);
          results.push({ segmentId: segment.segmentId, provenance: 'memory', supportingMemoryId: segment.supportingMemoryId, valid: similarity >= MIN_GROUNDING_SUPPORT_SIMILARITY, reason: similarity >= MIN_GROUNDING_SUPPORT_SIMILARITY ? undefined : 'MEMORY_SEMANTIC_SUPPORT_TOO_LOW', similarity });
        });
      } catch {
        memorySegments.forEach(({ segment }) => results.push({ segmentId: segment.segmentId, provenance: 'memory', supportingMemoryId: segment.supportingMemoryId, valid: false, reason: 'GROUNDING_EMBEDDING_UNAVAILABLE' }));
      }
    }

    const auditMemories = input.selectedMemories.filter((memory) => CONVERSATIONAL_MEMORY_TYPES.has(memory.memoryType ?? '')
      && decideMemoryDisclosure({ memory, target: 'main_prompt', currentUserMessage: input.currentUserMessage }).allowed);
    const nonMemory = input.segments.filter((segment) => segment.provenance !== 'memory');
    if (nonMemory.length && auditMemories.length) {
      try {
        const [currentVector, memoryVectors] = await Promise.all([
          this.embeddings.embedQuery(input.currentUserMessage),
          this.embeddings.embedDocuments(auditMemories.map((memory) => buildSafeGroundingRepresentation(memory, input.currentUserMessage))),
        ]);
        for (const segment of nonMemory) {
          const vector = await this.embeddings.embedQuery(segment.text);
          const currentSimilarity = cosineSimilarity(vector, currentVector);
          const similarity = Math.max(...memoryVectors.map((memory) => cosineSimilarity(vector, memory)));
          const undeclared = similarity >= UNDECLARED_MEMORY_SIMILARITY_THRESHOLD && similarity - currentSimilarity >= UNDECLARED_MEMORY_CURRENT_TURN_MARGIN;
          results.push({ segmentId: segment.segmentId, provenance: segment.provenance, valid: !undeclared, reason: undeclared ? 'UNDECLARED_MEMORY_USAGE' : undefined, similarity });
        }
      } catch {
        // Non-memory conversation must stay available when E5 is unavailable.
        nonMemory.forEach((segment) => results.push({ segmentId: segment.segmentId, provenance: segment.provenance, valid: true }));
      }
    } else nonMemory.forEach((segment) => results.push({ segmentId: segment.segmentId, provenance: segment.provenance, valid: true }));

    const runtime = this.getRuntimeStatus();
    const embeddingUnavailable = results.some((result) => result.reason === 'GROUNDING_EMBEDDING_UNAVAILABLE');
    return { passed: results.every((result) => result.valid), embeddingAvailable: !embeddingUnavailable && runtime.available, segments: results };
  }

  private validateMemorySegment(segment: GroundedReplySegment, selected: Set<string>, memories: Map<string, MemoryNode>, input: GroundingValidationInput): GroundingValidationReason | undefined {
    const id = segment.supportingMemoryId!;
    if (!selected.has(id)) return 'MEMORY_ID_NOT_SELECTED';
    const memory = memories.get(id);
    if (!memory) return 'MEMORY_NOT_FOUND';
    if (memory.userId !== input.userId || (memory.companionId && memory.companionId !== input.companionId)) return 'MEMORY_SCOPE_MISMATCH';
    if (memory.status !== undefined && memory.status !== 'active') return 'MEMORY_INACTIVE';
    if (memory.isMarkedWrong) return 'MEMORY_MARKED_WRONG';
    if (!decideMemoryDisclosure({ memory, target: 'main_prompt', currentUserMessage: input.currentUserMessage }).allowed) return 'MEMORY_NOT_DISCLOSABLE';
    if (!CONVERSATIONAL_MEMORY_TYPES.has(memory.memoryType ?? '')) return 'MEMORY_TYPE_MISMATCH';
    return undefined;
  }
}

export function buildSafeGroundingRepresentation(memory: MemoryNode, currentUserMessage?: string): string {
  const disclosure = decideMemoryDisclosure({ memory, target: 'main_prompt', currentUserMessage });
  if (!disclosure.allowed) return '';
  if (memory.memoryType === 'user_boundary') return minimalBoundaryConstraint(memory);
  return [memory.title, memory.summary, memory.content].filter(Boolean).join('\n').slice(0, MAX_GROUNDING_MEMORY_CHARACTERS);
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (!left || !right || left.length === 0 || left.length !== right.length) throw new Error('GROUNDING_EMBEDDING_DIMENSION_MISMATCH');
  let dot = 0; let leftMagnitude = 0; let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index] * right[index]; leftMagnitude += left[index] ** 2; rightMagnitude += right[index] ** 2; }
  if (!leftMagnitude || !rightMagnitude) throw new Error('GROUNDING_EMBEDDING_DIMENSION_MISMATCH');
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}
