import type { DatabaseService } from '@our-companion/database';
import type {
  CompanionSessionPhase,
  ConversationPhase,
  ConversationSessionRecord,
  SessionCloseReason
} from '@our-companion/shared';

const LOCAL_USER_ID = 'local';

function sessionCacheKey(userId: string, companionId: string): string {
  return `${userId}:${companionId}`;
}

function mapSessionToConversationPhase(phase: CompanionSessionPhase): ConversationPhase {
  const map: Partial<Record<CompanionSessionPhase, ConversationPhase>> = {
    inactive: 'inactive',
    idle: 'inactive',
    opening: 'opening',
    listening: 'listening',
    thinking: 'thinking',
    talking: 'responding',
    responding: 'responding',
    waiting_for_user: 'waiting_for_user',
    paused: 'paused',
    closing: 'closing'
  };
  return map[phase] ?? 'inactive';
}

export class ConversationCoordinator {
  private readonly sessionCache = new Map<string, string>();
  private activeCompanionId: string | null = null;

  constructor(private readonly db: DatabaseService) {
    this.restoreFromDatabase();
  }

  restoreFromDatabase(userId = LOCAL_USER_ID): void {
    this.sessionCache.clear();
    for (const session of this.db.listActiveConversationSessions(userId)) {
      this.sessionCache.set(sessionCacheKey(session.userId, session.companionId), session.id);
    }
  }

  onCompanionSwitch(previousCompanionId: string | null, nextCompanionId: string, userId = LOCAL_USER_ID): void {
    if (previousCompanionId && previousCompanionId !== nextCompanionId) {
      const prevSessionId = this.getCachedSessionId(userId, previousCompanionId);
      if (prevSessionId) {
        this.closeSession(prevSessionId, 'companion_switched', userId, previousCompanionId);
      }
    }
    this.activeCompanionId = nextCompanionId;
    const existing = this.db.getActiveConversationSession(nextCompanionId, userId);
    if (existing) {
      this.sessionCache.set(sessionCacheKey(userId, nextCompanionId), existing.id);
    }
  }

  setActiveCompanion(companionId: string): void {
    if (this.activeCompanionId && this.activeCompanionId !== companionId) {
      this.onCompanionSwitch(this.activeCompanionId, companionId);
    } else {
      this.activeCompanionId = companionId;
    }
  }

  handleSessionPhase(companionId: string, phase: CompanionSessionPhase, userId = LOCAL_USER_ID): ConversationSessionRecord | null {
    const convPhase = mapSessionToConversationPhase(phase);
    const key = sessionCacheKey(userId, companionId);
    let sessionId = this.sessionCache.get(key);

    if ((convPhase === 'opening' || convPhase === 'listening') && !sessionId) {
      const session = this.db.createConversationSession(companionId, userId);
      sessionId = session.id;
      this.sessionCache.set(key, sessionId);
    }

    if (!sessionId) {
      const fromDb = this.db.getActiveConversationSession(companionId, userId);
      if (fromDb) {
        sessionId = fromDb.id;
        this.sessionCache.set(key, sessionId);
      }
    }

    if (!sessionId) return null;

    const updated = this.db.updateConversationSessionPhase(sessionId, convPhase);
    if (convPhase === 'inactive' || convPhase === 'closing') {
      this.sessionCache.delete(key);
    }
    return updated;
  }

  closeSession(
    sessionId: string,
    closeReason: SessionCloseReason,
    userId = LOCAL_USER_ID,
    companionId?: string,
    unfinishedTopic?: string
  ): ConversationSessionRecord {
    const closed = this.db.closeConversationSession(sessionId, closeReason, unfinishedTopic);
    const cid = companionId ?? closed.companionId;
    this.sessionCache.delete(sessionCacheKey(userId, cid));
    return closed;
  }

  getActiveSessionId(companionId: string, userId = LOCAL_USER_ID): string | null {
    const cached = this.sessionCache.get(sessionCacheKey(userId, companionId));
    if (cached) return cached;
    const fromDb = this.db.getActiveConversationSession(companionId, userId);
    if (fromDb) {
      this.sessionCache.set(sessionCacheKey(userId, companionId), fromDb.id);
      return fromDb.id;
    }
    return null;
  }

  private getCachedSessionId(userId: string, companionId: string): string | null {
    return this.sessionCache.get(sessionCacheKey(userId, companionId)) ?? null;
  }

  isConversationActive(companionId: string, userId = LOCAL_USER_ID): boolean {
    const sessionId = this.getActiveSessionId(companionId, userId);
    if (!sessionId) return false;
    const session = this.db.getActiveConversationSession(companionId, userId);
    return !!session && session.phase !== 'inactive' && session.phase !== 'closing';
  }
}
