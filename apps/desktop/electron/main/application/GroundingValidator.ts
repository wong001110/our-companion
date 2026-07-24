import type { GroundedReplySegment, MemoryNode, ReplySegmentProvenance } from '@our-companion/shared';
import { decideMemoryDisclosure, renderMemoryPromptConstraint, renderSafeMemoryText } from './MemoryDisclosurePolicy';

/** Calibrated against the committed local E5 QA corpus; see docs/qa/e5-grounding-report.md. */
export const MIN_GROUNDING_SUPPORT_SIMILARITY = 0.87;
export const UNDECLARED_MEMORY_SIMILARITY_THRESHOLD = 0.89;
export const UNDECLARED_MEMORY_CURRENT_TURN_MARGIN = 0.12;

export interface GroundingRuntimeStatus {
  available: boolean;
  modelId: 'Xenova/multilingual-e5-small';
  reason?: 'model_not_installed' | 'model_load_failed' | 'dimension_mismatch';
}

export interface GroundingEmbeddingProvider {
  initialize?: () => Promise<void>;
  markUnavailable?: () => void;
  /** Production E5 is fixed at 384 dimensions; test providers may omit this. */
  dimensions?: number;
  embedQuery(text: string): Promise<Float32Array>;
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  getStatus?: () => { state: string; modelId: string; error?: string };
}

export type GroundingValidationReason =
  | 'MEMORY_ID_NOT_SELECTED' | 'MEMORY_NOT_FOUND' | 'MEMORY_SCOPE_MISMATCH'
  | 'MEMORY_INACTIVE' | 'MEMORY_MARKED_WRONG' | 'MEMORY_NOT_DISCLOSABLE'
  | 'MEMORY_TYPE_MISMATCH' | 'MEMORY_NOT_RENDERABLE' | 'MEMORY_SEMANTIC_SUPPORT_TOO_LOW'
  | 'UNDECLARED_MEMORY_USAGE' | 'GROUNDING_EMBEDDING_UNAVAILABLE' | 'DUPLICATE_MEMORY_REFERENCE'
  | 'RENDERED_REPLY_TOO_LONG';

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
  private runtimeFailed = false;

  constructor(private readonly embeddings: GroundingEmbeddingProvider) {}

  getRuntimeStatus(): GroundingRuntimeStatus {
    const status = this.embeddings.getStatus?.();
    if (this.embeddings.dimensions !== undefined && this.embeddings.dimensions !== 384) {
      return { available: false, modelId: 'Xenova/multilingual-e5-small', reason: 'dimension_mismatch' };
    }
    if (!status || status.state === 'ready') return { available: true, modelId: 'Xenova/multilingual-e5-small' };
    const error = status.error ?? '';
    return {
      available: false,
      modelId: 'Xenova/multilingual-e5-small',
      reason: /DIMENSION/i.test(error) ? 'dimension_mismatch' : status.state === 'not-installed' ? 'model_not_installed' : 'model_load_failed',
    };
  }

  /** Loads only an already-installed local model; remote access stays disabled by the provider. */
  async ensureAvailable(): Promise<GroundingRuntimeStatus> {
    try {
      await this.embeddings.initialize?.();
      const runtime = this.getRuntimeStatus();
      if (!runtime.available) return runtime;

      // Prove the loaded local runtime can produce the production vector shape
      // before any durable Memory is rendered into the generation prompt.
      const [queryProbe, documentProbes] = await Promise.all([
        this.embeddings.embedQuery('grounding availability probe'),
        this.embeddings.embedDocuments(['grounding availability probe']),
      ]);
      const isProductionVector = (vector: Float32Array | undefined) => vector?.length === 384 && Array.from(vector).every(Number.isFinite);
      if (!isProductionVector(queryProbe) || documentProbes.length !== 1 || !isProductionVector(documentProbes[0])) {
        return { available: false, modelId: 'Xenova/multilingual-e5-small', reason: 'dimension_mismatch' };
      }
      this.runtimeFailed = false;
      return runtime;
    } catch {
      // Convert loader/cache/runtime failures into a safe, prompt-gating status.
      const runtime = this.getRuntimeStatus();
      this.markRuntimeUnavailable();
      return runtime.available
        ? { available: false, modelId: 'Xenova/multilingual-e5-small', reason: 'model_load_failed' }
        : runtime;
    }
  }

  async validate(input: GroundingValidationInput): Promise<GroundingValidationResult> {
    const selected = new Set(input.selectedMemoryIds);
    const memories = new Map(input.selectedMemories.map((memory) => [memory.id, memory]));
    const results: GroundingSegmentValidation[] = [];
    const memorySegments: Array<{ segment: Extract<GroundedReplySegment, { provenance: 'memory' }>; memory: MemoryNode }> = [];
    const memoryReferenceCounts = new Map<string, number>();
    for (const segment of input.segments) {
      if (segment.provenance === 'memory') memoryReferenceCounts.set(segment.supportingMemoryId, (memoryReferenceCounts.get(segment.supportingMemoryId) ?? 0) + 1);
    }

    for (const segment of input.segments) {
      if (segment.provenance !== 'memory') continue;
      if ((memoryReferenceCounts.get(segment.supportingMemoryId) ?? 0) > 1) {
        results.push({ segmentId: segment.segmentId, provenance: segment.provenance, supportingMemoryId: segment.supportingMemoryId, valid: false, reason: 'DUPLICATE_MEMORY_REFERENCE' });
        continue;
      }
      const failure = this.validateMemorySegment(segment, selected, memories, input);
      if (failure) results.push({ segmentId: segment.segmentId, provenance: segment.provenance, supportingMemoryId: segment.supportingMemoryId, valid: false, reason: failure });
      else memorySegments.push({ segment, memory: memories.get(segment.supportingMemoryId!)! });
    }

    // Explicit Memory references render the deterministic representation below.
    // E5 is deliberately not an entailment gate for that application-owned fact.
    memorySegments.forEach(({ segment }) => results.push({ segmentId: segment.segmentId, provenance: 'memory', supportingMemoryId: segment.supportingMemoryId, valid: true }));

    const auditMemories = input.selectedMemories.filter((memory) => CONVERSATIONAL_MEMORY_TYPES.has(memory.memoryType ?? '')
      && renderSafeMemoryText(memory, input.currentUserMessage) !== undefined);
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
        this.markRuntimeUnavailable();
        // If durable Memory was exposed to this model attempt, an audit failure
        // cannot make an undeclared Memory claim trustworthy. With no exposed
        // Memory, ordinary current-turn conversation remains available.
        const failClosed = input.selectedMemoryIds.length > 0;
        nonMemory.forEach((segment) => results.push({ segmentId: segment.segmentId, provenance: segment.provenance, valid: !failClosed, reason: failClosed ? 'GROUNDING_EMBEDDING_UNAVAILABLE' : undefined }));
      }
    } else nonMemory.forEach((segment) => results.push({ segmentId: segment.segmentId, provenance: segment.provenance, valid: true }));

    const runtime = this.runtimeFailed ? { available: false } : this.getRuntimeStatus();
    const embeddingUnavailable = results.some((result) => result.reason === 'GROUNDING_EMBEDDING_UNAVAILABLE');
    return { passed: results.every((result) => result.valid), embeddingAvailable: !embeddingUnavailable && runtime.available, segments: results };
  }

  private validateMemorySegment(segment: Extract<GroundedReplySegment, { provenance: 'memory' }>, selected: Set<string>, memories: Map<string, MemoryNode>, input: GroundingValidationInput): GroundingValidationReason | undefined {
    const id = segment.supportingMemoryId!;
    if (!selected.has(id)) return 'MEMORY_ID_NOT_SELECTED';
    const memory = memories.get(id);
    if (!memory) return 'MEMORY_NOT_FOUND';
    if (memory.userId !== input.userId || (memory.companionId && memory.companionId !== input.companionId)) return 'MEMORY_SCOPE_MISMATCH';
    if (memory.status !== undefined && memory.status !== 'active') return 'MEMORY_INACTIVE';
    if (memory.isMarkedWrong) return 'MEMORY_MARKED_WRONG';
    if (!decideMemoryDisclosure({ memory, target: 'main_prompt', currentUserMessage: input.currentUserMessage }).allowed) return 'MEMORY_NOT_DISCLOSABLE';
    if (!CONVERSATIONAL_MEMORY_TYPES.has(memory.memoryType ?? '')) return 'MEMORY_TYPE_MISMATCH';
    if (!renderSafeMemoryText(memory, input.currentUserMessage)) return 'MEMORY_NOT_RENDERABLE';
    return undefined;
  }

  private markRuntimeUnavailable(): void {
    this.runtimeFailed = true;
    this.embeddings.markUnavailable?.();
  }
}

export function buildSafeGroundingRepresentation(memory: MemoryNode, currentUserMessage?: string): string {
  return (memory.memoryType === 'user_boundary'
    ? renderMemoryPromptConstraint(memory, currentUserMessage)
    : renderSafeMemoryText(memory, currentUserMessage)) ?? '';
}

export { renderSafeMemoryText } from './MemoryDisclosurePolicy';

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (!left || !right || left.length === 0 || left.length !== right.length) throw new Error('GROUNDING_EMBEDDING_DIMENSION_MISMATCH');
  let dot = 0; let leftMagnitude = 0; let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index] * right[index]; leftMagnitude += left[index] ** 2; rightMagnitude += right[index] ** 2; }
  if (!leftMagnitude || !rightMagnitude) throw new Error('GROUNDING_EMBEDDING_DIMENSION_MISMATCH');
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}
