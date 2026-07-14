export interface PresentationCandidate {
  id: string;
  title: string;
  oneLineHook: string;
  whyYouMightCare: string;
  shareMessage: string;
  sourceName?: string;
  sourceUrl?: string;
  confidence?: number;
  tags?: string[];
}

export type CandidateStatus = 'queued' | 'presenting' | 'dismissed' | 'saved';

export interface QueuedCandidate {
  candidate: PresentationCandidate;
  status: CandidateStatus;
  enqueuedAt: string;
  presentedAt?: string;
}

export function titleFallback(candidate: PresentationCandidate, fallback: string): string {
  return candidate.title || fallback;
}

export function bodyFallback(candidate: PresentationCandidate, fallback: string): string {
  return candidate.whyYouMightCare || fallback;
}

export function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.searchParams.sort();
    return parsed.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}
