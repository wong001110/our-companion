import type { DatabaseService } from '@our-companion/database';
import { createMemoryNode } from '@our-companion/memory-engine';
import type {
  CommittedMemoryEvidence,
  MemoryCandidate,
  MemoryRetention,
  TypedMemoryType
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

const SENSITIVE_PATTERNS = [
  /\b(sk-[a-zA-Z0-9]{10,})\b/i,
  /\b(api[_-]?key|apikey)\s*[:=]\s*\S+/i,
  /\b(password|passwd|pwd)\s*[:=]\s*\S+/i,
  /\b(bearer\s+[a-zA-Z0-9._-]+)/i,
  /\b(access[_-]?token)\s*[:=]\s*\S+/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
];

const REJECT_PHRASES = [
  /do not remember/i,
  /don't remember/i,
  /forget this/i,
  /^test\s*$/i,
  /^testing\s*$/i,
  /translate this/i,
  /just testing/i
];

export interface MemoryTurnInput {
  userId: string;
  companionId: string;
  userMessage: string;
  assistantReply: string;
  sessionId?: string;
}

export class MemoryPolicy {
  constructor(private readonly db: DatabaseService) {}

  processTurn(input: MemoryTurnInput): MemoryCandidate | null {
    const candidate = this.createCandidate(input);
    if (!candidate) return null;

    const afterSafety = this.safetyCheck(candidate);
    if (!afterSafety) return null;

    const classified = this.classify(afterSafety);
    const retained = this.retentionDecision(classified);
    if (retained.retention === 'discard') return null;

    if (retained.retention === 'requires_confirmation') {
      return retained;
    }

    this.commitMemory(retained, input);
    return retained;
  }

  createCandidate(input: MemoryTurnInput): MemoryCandidate | null {
    const text = input.userMessage.trim();
    if (!text) return null;

    return {
      id: createId('memcand'),
      userId: input.userId,
      companionId: input.companionId,
      sessionId: input.sessionId,
      proposedType: 'conversation_episode',
      sourceText: text,
      summary: text.slice(0, 200),
      confidence: 0.5,
      sensitivity: 'normal',
      retention: 'discard',
      reason: 'initial candidate',
      createdAt: nowIso()
    };
  }

  safetyCheck(candidate: MemoryCandidate): MemoryCandidate | null {
    const text = candidate.sourceText ?? '';
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(text)) {
        return null;
      }
    }
    for (const phrase of REJECT_PHRASES) {
      if (phrase.test(text)) return null;
    }
    if (this.isPureCodeBlock(text)) return null;
    if (this.isTranslationRequest(text)) return null;
    return candidate;
  }

  classify(candidate: MemoryCandidate): MemoryCandidate {
    const text = (candidate.sourceText ?? '').toLowerCase();

    if (/\b(i prefer|i like|my favorite|i love|prefer)\b/.test(text)) {
      return { ...candidate, proposedType: 'user_preference', confidence: 0.85, reason: 'explicit preference' };
    }
    if (/\b(don't|do not|never|please don't)\b/.test(text) && /\b(ask|talk|mention|bring up)\b/.test(text)) {
      return { ...candidate, proposedType: 'user_boundary', confidence: 0.9, sensitivity: 'personal', reason: 'explicit boundary' };
    }
    if (/\b(actually|that's wrong|not true|i meant)\b/.test(text)) {
      return { ...candidate, proposedType: 'user_fact', confidence: 0.8, reason: 'user correction' };
    }
    if (/\b(remember that|keep in mind|for future)\b/.test(text)) {
      return { ...candidate, proposedType: 'user_fact', confidence: 0.75, reason: 'explicit remember request' };
    }
    if (text.length < 12) {
      return { ...candidate, retention: 'discard', reason: 'too short for memory' };
    }

    return { ...candidate, proposedType: 'conversation_episode', confidence: 0.35, reason: 'general turn' };
  }

  retentionDecision(candidate: MemoryCandidate): MemoryCandidate {
    if (candidate.proposedType === 'user_preference' || candidate.proposedType === 'user_boundary') {
      return { ...candidate, retention: 'long_term' };
    }
    if (candidate.proposedType === 'user_fact' && candidate.reason === 'user correction') {
      return { ...candidate, retention: 'long_term' };
    }
    if (candidate.retention === 'discard') return candidate;
    if (candidate.proposedType === 'user_fact' && candidate.confidence >= 0.7) {
      return { ...candidate, retention: 'long_term' };
    }
    if (candidate.proposedType === 'user_fact') {
      return { ...candidate, retention: 'requires_confirmation' };
    }
    if (candidate.proposedType === 'conversation_episode' && candidate.confidence < 0.5) {
      return { ...candidate, retention: 'discard', reason: 'low confidence episode' };
    }
    if (candidate.proposedType === 'conversation_episode') {
      return { ...candidate, retention: 'temporary' };
    }

    return { ...candidate, retention: 'discard' };
  }

  commitMemory(candidate: MemoryCandidate, input: MemoryTurnInput): void {
    const evidence: CommittedMemoryEvidence = {
      userEvidence: input.userMessage.slice(0, 500),
      assistantInterpretation: input.assistantReply.slice(0, 300)
    };

    let supersedesId: string | undefined;
    if (candidate.reason === 'user correction') {
      const existing = this.db.listMemoryNodes(input.companionId);
      const match = existing.find((n) => n.memoryType === 'user_fact' && !n.isMarkedWrong);
      if (match) {
        supersedesId = match.id;
        this.db.updateMemoryNode({ ...match, isMarkedWrong: true, updatedAt: nowIso() });
      }
    }

    const memoryType: TypedMemoryType = candidate.proposedType;
    const scope = candidate.retention === 'temporary' ? 'session' : 'companion';
    const expiresAt =
      candidate.retention === 'temporary'
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : undefined;

    const node = createMemoryNode({
      type: 'topic',
      title: (candidate.sourceText ?? candidate.summary).slice(0, 80),
      summary: candidate.summary,
      source: 'conversation'
    });

    this.db.insertMemoryNode({
      ...node,
      importanceScore: candidate.confidence,
      companionId: input.companionId,
      userId: input.userId,
      memoryType,
      metadata: {
        ownerCompanionId: input.companionId,
        ownerUserId: input.userId,
        sourceType: candidate.reason === 'user correction' ? 'user_correction' : 'conversation',
        confidence: candidate.confidence,
        sensitivity: candidate.sensitivity,
        scope,
        createdAt: nowIso(),
        expiresAt,
        supersedesMemoryId: supersedesId,
        ...evidence
      }
    });
  }

  private isPureCodeBlock(text: string): boolean {
    const trimmed = text.trim();
    if (/^```[\s\S]*```$/.test(trimmed)) return true;
    if (/^(import |export |function |const |let |class )/.test(trimmed) && !/\b(i|my|me)\b/i.test(trimmed)) {
      return true;
    }
    return false;
  }

  private isTranslationRequest(text: string): boolean {
    return /\b(translate|translation)\b/i.test(text) && text.length < 80;
  }
}
