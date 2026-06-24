export function getDiscoveryFetchDelayRange(discoveryScore: number): { minMs: number; maxMs: number } {
  const score = clampScore(discoveryScore);
  const minMs = interpolate(120 * 60 * 1000, 45 * 60 * 1000, score / 100);
  const maxMs = interpolate(180 * 60 * 1000, 90 * 60 * 1000, score / 100);
  return {
    minMs: Math.round(minMs),
    maxMs: Math.round(Math.max(maxMs, minMs + 5 * 60 * 1000))
  };
}

export function getDiscoveryFetchDelay(discoveryScore: number, random = Math.random): number {
  const range = getDiscoveryFetchDelayRange(discoveryScore);
  return range.minMs + clamp01(random()) * (range.maxMs - range.minMs);
}

export const DISCOVERY_STARTUP_DELAY_MS = 90_000;

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
