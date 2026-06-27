import type { SpeechSession } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export class ListenManager {
  private currentSession: SpeechSession | null = null;

  startListening(): SpeechSession {
    this.currentSession = {
      id: createId('speech_session'),
      status: 'listening',
      startedAt: nowIso(),
      lastActivityAt: nowIso(),
    };
    return this.currentSession;
  }

  stopListening(): void {
    if (this.currentSession) {
      this.currentSession.status = 'idle';
      this.currentSession.lastActivityAt = nowIso();
    }
  }

  markTranscribing(): void {
    if (this.currentSession) {
      this.currentSession.status = 'transcribing';
      this.currentSession.lastActivityAt = nowIso();
    }
  }

  markSpeaking(): void {
    if (this.currentSession) {
      this.currentSession.status = 'speaking';
      this.currentSession.lastActivityAt = nowIso();
    }
  }

  getCurrentSession(): SpeechSession | null {
    return this.currentSession;
  }

  isActive(): boolean {
    return this.currentSession?.status === 'listening' || this.currentSession?.status === 'transcribing';
  }
}
