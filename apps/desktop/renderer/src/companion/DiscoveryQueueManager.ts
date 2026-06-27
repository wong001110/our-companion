import type { DiscoveryAnnouncePayload } from '@our-companion/shared';

export type CandidateStatus = 'queued' | 'presenting' | 'dismissed' | 'saved';

export interface DiscoveryCandidate {
  id: string;
  payload: DiscoveryAnnouncePayload;
  status: CandidateStatus;
  enqueuedAt: string;
  presentedAt?: string;
}

export type CandidateListener = () => void;

export class DiscoveryQueueManager {
  private candidates: DiscoveryCandidate[] = [];
  private listeners: CandidateListener[] = [];

  enqueue(payload: DiscoveryAnnouncePayload): boolean {
    const existing = this.candidates.find(
      (c) => c.status === 'queued' || c.status === 'presenting'
    );
    if (existing && existing.id === payload.discoveryId) return false;

    const alreadyQueued = this.candidates.some(
      (c) => c.id === payload.discoveryId && (c.status === 'queued' || c.status === 'presenting')
    );
    if (alreadyQueued) return false;

    this.candidates.push({
      id: payload.discoveryId,
      payload,
      status: 'queued',
      enqueuedAt: new Date().toISOString()
    });
    this.notify();
    return true;
  }

  getCurrent(): DiscoveryCandidate | undefined {
    return this.candidates.find((c) => c.status === 'presenting');
  }

  getNext(): DiscoveryCandidate | undefined {
    return this.candidates.find((c) => c.status === 'queued');
  }

  presentNext(): DiscoveryCandidate | undefined {
    const current = this.getCurrent();
    if (current) return current;

    const next = this.getNext();
    if (!next) return undefined;

    next.status = 'presenting';
    next.presentedAt = new Date().toISOString();
    this.notify();
    return next;
  }

  dismissCurrent(): void {
    const current = this.getCurrent();
    if (current) {
      current.status = 'dismissed';
      this.notify();
    }
  }

  saveCurrent(): void {
    const current = this.getCurrent();
    if (current) {
      current.status = 'saved';
      this.notify();
    }
  }

  advanceAfterPresentation(): DiscoveryCandidate | undefined {
    const current = this.getCurrent();
    if (current) {
      current.status = 'dismissed';
    }
    return this.presentNext();
  }

  reset(): void {
    this.candidates = [];
    this.notify();
  }

  getAll(): DiscoveryCandidate[] {
    return [...this.candidates];
  }

  getCandidatesByStatus(status: CandidateStatus): DiscoveryCandidate[] {
    return this.candidates.filter((c) => c.status === status);
  }

  getStats(): { queued: number; presenting: number; dismissed: number; saved: number } {
    return {
      queued: this.candidates.filter((c) => c.status === 'queued').length,
      presenting: this.candidates.filter((c) => c.status === 'presenting').length,
      dismissed: this.candidates.filter((c) => c.status === 'dismissed').length,
      saved: this.candidates.filter((c) => c.status === 'saved').length
    };
  }

  subscribe(listener: CandidateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
