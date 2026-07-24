import type { DatabaseService } from '@our-companion/database';
import { createMemoryNode } from '@our-companion/memory-engine';
import type {
  CompanionTurnMemoryCandidate,
  MemoryCandidate,
  MemoryNode,
  RememberedMemoryMutation,
  TypedMemoryType,
} from '@our-companion/shared';
import {
  createId,
  createSemanticFingerprint,
  detectSensitiveDescriptors,
  isCredentialDescriptor,
  MAX_CANONICAL_MEMORY_CHARACTERS,
  normalizeSemanticText,
} from '@our-companion/shared';
import { deriveUserBoundary } from '../application/MemoryDisclosurePolicy';

const REJECT_PHRASES = [
  /do not remember/i,
  /don't remember/i,
  /forget this/i,
  /不要记住/,
  /别记住/,
  /不要保存/,
  /忘掉这/,
  /^test(?:ing)?[.!]?$/i,
  /just testing/i,
  /测试内容/,
  /只是测试/,
  /\btranslate (?:this|the following)\b/i,
  /(?:翻译|译成|翻成).{0,12}(?:这|以下|英文|中文)/,
];

const TEMPORARY_PATTERNS = [
  /\b(?:for now|just this once|this time|today only|temporarily)\b/i,
  /(?:暂时|这一次|这次就|仅今天|今天先)/,
];

const AMBIGUOUS_CORRECTION_PATTERNS = [
  /^(?:actually|correction|to correct that|instead)[,:\s]/i,
  /^(?:其实|更正一下|纠正一下|不是这样)[，,:：\s]?/,
];

export interface MemoryTurnInput {
  userId: string;
  companionId: string;
  userMessage: string;
  assistantReply: string;
  sessionId?: string;
  candidates?: CompanionTurnMemoryCandidate[];
  includeDeterministicCandidates?: boolean;
}

export interface MemoryCaptureOutcome {
  candidate: CompanionTurnMemoryCandidate;
  outcome: 'created' | 'updated' | 'observed' | 'discarded';
  memoryId?: string;
  reason?: string;
  mutation?: RememberedMemoryMutation;
}

type UndoRecord = {
  companionId: string;
  memoryId: string;
  previous?: MemoryNode;
  created: boolean;
};

export class MemoryPolicy {
  private readonly now: () => number;
  private readonly undoRecords = new Map<string, UndoRecord>();

  constructor(private readonly db: DatabaseService, deps: { now?: () => number } = {}) {
    this.now = deps.now ?? (() => Date.now());
  }

  /** Compatibility entry point retained for existing runtime callers/tests. */
  processTurn(input: MemoryTurnInput): MemoryCandidate | null {
    const candidates = this.extractDeterministicCandidates(input);
    const first = candidates[0];
    if (!first) return null;
    const candidate = this.toLegacyCandidate(first, input);
    const outcomes = this.captureTurn({ ...input, candidates: [first] });
    return outcomes.some((outcome) => outcome.outcome !== 'discarded') ? candidate : null;
  }

  captureTurn(input: MemoryTurnInput): MemoryCaptureOutcome[] {
    const proposed = [
      ...(input.candidates ?? []),
      ...(input.includeDeterministicCandidates === false ? [] : this.extractDeterministicCandidates(input)),
    ];
    const unique = new Map<string, CompanionTurnMemoryCandidate>();
    for (const candidate of proposed) {
      const normalized = normalizeSemanticText(candidate.evidence);
      if (!normalized) continue;
      unique.set(`${candidate.type}:${normalized}`, candidate);
    }
    return [...unique.values()].map((candidate) => this.captureCandidate(candidate, input));
  }

  undo(undoToken: string, companionId: string): { undone: boolean; memoryId?: string } {
    const record = this.undoRecords.get(undoToken);
    if (!record || record.companionId !== companionId) return { undone: false };
    if (record.created) {
      const current = this.db.getMemoryNode(record.memoryId, companionId);
      if (current) this.db.deleteMemoryNode(record.memoryId);
    } else if (record.previous) {
      this.db.updateMemoryNode(record.previous);
    }
    this.undoRecords.delete(undoToken);
    return { undone: true, memoryId: record.memoryId };
  }

  createCandidate(input: MemoryTurnInput): MemoryCandidate | null {
    const first = this.extractDeterministicCandidates(input)[0];
    return first ? this.toLegacyCandidate(first, input) : null;
  }

  safetyCheck(candidate: MemoryCandidate): MemoryCandidate | null {
    return this.isSafe(candidate.sourceText ?? candidate.summary) ? candidate : null;
  }

  classify(candidate: MemoryCandidate): MemoryCandidate {
    return candidate;
  }

  retentionDecision(candidate: MemoryCandidate): MemoryCandidate {
    const retained = ['user_preference', 'user_boundary', 'user_fact', 'goal'].includes(candidate.proposedType);
    return { ...candidate, retention: retained ? 'long_term' : 'discard' };
  }

  private captureCandidate(
    candidate: CompanionTurnMemoryCandidate,
    input: MemoryTurnInput,
  ): MemoryCaptureOutcome {
    const evidence = candidate.evidence.trim();
    if (!['user_preference', 'user_fact', 'user_boundary', 'goal'].includes(candidate.type)
      || AMBIGUOUS_CORRECTION_PATTERNS.some((pattern) => pattern.test(input.userMessage.trim()))) {
      return { candidate, outcome: 'discarded', reason: 'unsupported_or_ambiguous_memory_candidate' };
    }
    if (Array.from(normalizeSemanticText(evidence)).length < 3
      || evidence.length > input.userMessage.length
      || !Number.isFinite(candidate.confidence)
      || candidate.confidence < 0
      || candidate.confidence > 1) {
      return { candidate, outcome: 'discarded', reason: 'invalid_candidate_evidence' };
    }
    if (!this.isSafe(`${candidate.summary}\n${evidence}`)) {
      return { candidate, outcome: 'discarded', reason: 'memory_safety_policy' };
    }
    if (!evidence || !input.userMessage.includes(evidence)) {
      return { candidate, outcome: 'discarded', reason: 'evidence_not_grounded_in_user_message' };
    }
    if (candidate.confidence < 0.7) {
      return { candidate, outcome: 'discarded', reason: 'confidence_below_threshold' };
    }
    const descriptors = detectSensitiveDescriptors(`${evidence}\n${candidate.summary}`, { source: 'memory_candidate' });
    if (descriptors.length > 0) {
      return {
        candidate,
        outcome: 'discarded',
        reason: descriptors.some((descriptor) => isCredentialDescriptor(descriptor.kind))
          ? 'credential_memory_forbidden'
          : 'sensitive_memory_candidate',
      };
    }
    if (evidence.length > MAX_CANONICAL_MEMORY_CHARACTERS) {
      return { candidate, outcome: 'discarded', reason: 'canonical_evidence_too_long' };
    }

    const timestamp = this.timestamp();
    const boundary = candidate.type === 'user_boundary' ? deriveUserBoundary(evidence) : undefined;
    if (candidate.type === 'user_boundary' && !boundary) {
      return { candidate, outcome: 'discarded', reason: 'invalid_boundary_metadata' };
    }
    const canonicalText = evidence;
    const normalizedCanonical = normalizeSemanticText(canonicalText);
    const fingerprint = createSemanticFingerprint('memory', [
      input.companionId,
      candidate.type,
      normalizedCanonical,
    ]);
    const node = createMemoryNode({
      type: candidate.type === 'goal' ? 'outcome' : 'topic',
      title: canonicalText.slice(0, 80),
      summary: canonicalText.slice(0, 500),
      content: canonicalText,
      source: 'conversation',
      companionId: input.companionId,
    });
    const captured: MemoryNode = {
      ...node,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastObservedAt: timestamp,
      companionId: input.companionId,
      userId: input.userId,
      memoryType: candidate.type,
      fingerprint,
      confidence: candidate.confidence,
      observationCount: 1,
      importance: candidate.type === 'user_boundary' || candidate.type === 'goal'
        ? Math.max(0.8, candidate.confidence)
        : candidate.confidence,
      metadata: {
        ownerCompanionId: input.companionId,
        ownerUserId: input.userId,
        sourceType: 'user_explicit',
        confidence: candidate.confidence,
        sensitivity: candidate.type === 'user_boundary' ? 'personal' : 'normal',
        scope: 'companion',
        createdAt: timestamp,
        userEvidence: canonicalText,
        canonicalText,
        canonicalSource: candidate.type === 'user_boundary' ? 'deterministic_boundary' : 'exact_user_evidence',
        unverifiedInterpretation: candidate.summary.slice(0, 500),
        assistantInterpretation: input.assistantReply.slice(0, 300),
        ...(boundary ? { userBoundary: boundary } : {}),
      },
    };
    const result = this.db.upsertCapturedMemory(captured);
    const undoToken = createId('memory_undo');
    this.undoRecords.set(undoToken, {
      companionId: input.companionId,
      memoryId: result.record.id,
      previous: result.previous,
      created: result.outcome === 'created',
    });
    while (this.undoRecords.size > 100) {
      const oldest = this.undoRecords.keys().next().value as string | undefined;
      if (!oldest) break;
      this.undoRecords.delete(oldest);
    }
    const mutation: RememberedMemoryMutation = {
      memoryId: result.record.id,
      summary: result.record.summary ?? result.record.title,
      mutation: result.outcome,
      undoToken,
    };
    return {
      candidate,
      outcome: result.outcome,
      memoryId: result.record.id,
      mutation,
    };
  }

  private extractDeterministicCandidates(input: MemoryTurnInput): CompanionTurnMemoryCandidate[] {
    const text = input.userMessage.trim();
    if (!this.isSafe(text)) return [];
    // A correction needs an explicit target before it can safely replace or add
    // durable Memory. The structured turn path may still propose a grounded
    // candidate when it can express that target unambiguously.
    if (AMBIGUOUS_CORRECTION_PATTERNS.some((pattern) => pattern.test(text))) return [];
    const structuredBoundary = deriveUserBoundary(text);
    const rules: Array<{
      type: CompanionTurnMemoryCandidate['type'];
      confidence: number;
      patterns: RegExp[];
    }> = [
      {
        type: 'user_preference',
        confidence: 0.85,
        patterns: [
          /\b(?:i prefer|i like|i love|my favorite(?: is)?)\s+(.+)/i,
          /(?:我(?:比较)?喜欢|我偏好)\s*(.+)/,
          /以后优先(?:推荐|考虑)?\s*(.+)/,
        ],
      },
      {
        type: 'user_boundary',
        confidence: 0.92,
        patterns: [
          /\b(?:do not|don't|never|please don't)\s+(?:mention|bring up|recommend|talk about)\s+(.+)/i,
          /(?:不要再提|不要提|别再提|不要推荐|我不喜欢)\s*(.+)/,
        ],
      },
      {
        type: 'goal',
        confidence: 0.88,
        patterns: [
          /\b(?:my goal is|my long[- ]term goal is|i am working long[- ]term on|i'm working long[- ]term on)\s+(.+)/i,
          /(?:我的(?:长期)?目标是|我正在长期做|我长期在做)\s*(.+)/,
        ],
      },
      {
        type: 'user_fact',
        confidence: 0.82,
        patterns: [
          /\b(?:remember that|remember|keep in mind|for future)\s+(.+)/i,
          /(?:记住|请记住|以后要记得)\s*(.+)/,
        ],
      },
    ];
    const results: CompanionTurnMemoryCandidate[] = structuredBoundary ? [{
      type: 'user_boundary', summary: structuredBoundary.target, evidence: text, confidence: 0.92,
    }] : [];
    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        const match = text.match(pattern);
        const summary = match?.[1]?.trim().replace(/[。.!]+$/, '');
        if (!summary || summary.length < 2) continue;
        results.push({
          type: rule.type,
          summary,
          evidence: match![0].trim(),
          confidence: rule.confidence,
        });
        break;
      }
    }
    return results;
  }

  private toLegacyCandidate(
    candidate: CompanionTurnMemoryCandidate,
    input: MemoryTurnInput,
  ): MemoryCandidate {
    return {
      id: createId('memcand'),
      userId: input.userId,
      companionId: input.companionId,
      sessionId: input.sessionId,
      proposedType: candidate.type as TypedMemoryType,
      sourceText: input.userMessage,
      summary: candidate.summary,
      confidence: candidate.confidence,
      sensitivity: candidate.type === 'user_boundary' ? 'personal' : 'normal',
      retention: 'long_term',
      reason: 'explicit stable user statement',
      createdAt: this.timestamp(),
    };
  }

  private isSafe(text: string): boolean {
    if (!text.trim()) return false;
    if (REJECT_PHRASES.some((pattern) => pattern.test(text))) return false;
    if (TEMPORARY_PATTERNS.some((pattern) => pattern.test(text))) return false;
    if (this.isPureCodeBlock(text)) return false;
    return true;
  }

  private isPureCodeBlock(text: string): boolean {
    const trimmed = text.trim();
    if (/^```[\s\S]*```$/.test(trimmed)) return true;
    return /^(import |export |function |const |let |class )/.test(trimmed)
      && !/\b(i|my|me)\b/i.test(trimmed);
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}
