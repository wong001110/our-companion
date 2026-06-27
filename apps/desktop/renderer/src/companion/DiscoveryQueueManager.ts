import type { PresentationCandidate, QueuedCandidate, CandidateStatus } from './PresentationCandidate';
import { normalizeUrl, normalizeTitle } from './PresentationCandidate';

export type CandidateListener = () => void;

export class DiscoveryQueueManager {
  private candidates: QueuedCandidate[] = [];
  private listeners: CandidateListener[] = [];

  enqueue(candidate: PresentationCandidate): boolean {
    const active = this.candidates.filter(
      (c) => c.status === 'queued' || c.status === 'presenting'
    );

    if (active.some((c) => c.candidate.id === candidate.id)) return false;

    const candidateUrl = normalizeUrl(candidate.sourceUrl);
    if (candidateUrl && active.some((c) => normalizeUrl(c.candidate.sourceUrl) === candidateUrl)) return false;

    const candidateTitle = normalizeTitle(candidate.title);
    if (candidateTitle && active.some((c) => normalizeTitle(c.candidate.title) === candidateTitle)) return false;

    this.candidates.push({
      candidate,
      status: 'queued',
      enqueuedAt: new Date().toISOString()
    });
    this.notify();
    return true;
  }

  getCurrent(): QueuedCandidate | undefined {
    return this.candidates.find((c) => c.status === 'presenting');
  }

  getNext(): QueuedCandidate | undefined {
    return this.candidates.find((c) => c.status === 'queued');
  }

  presentNext(): QueuedCandidate | undefined {
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

  advanceAfterPresentation(): QueuedCandidate | undefined {
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

  getAll(): QueuedCandidate[] {
    return [...this.candidates];
  }

  getCandidatesByStatus(status: CandidateStatus): QueuedCandidate[] {
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
