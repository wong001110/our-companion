export type SpeechEvent = 'ambient' | 'walk_start' | 'walk_end' | 'discovery' | 'task' | 'ask';

const speechLines: Record<SpeechEvent, string[]> = {
  ambient: [
    'I am keeping an eye on the little details.',
    'Quiet focus mode sounds nice right now.',
    'I found a cozy corner to think in.',
    'Tiny notes, tidy thoughts.'
  ],
  walk_start: ['Stretching my legs for a bit.', 'Small patrol around the desk.', 'I will wander softly.'],
  walk_end: ['Back to my spot.', 'Settled again.', 'That was a nice little walk.'],
  discovery: ['I found something you might like.', 'This looks worth a peek.'],
  task: ['I am on it.', 'Let me focus on that.'],
  ask: ['I have a thought.', 'Let me answer that simply.']
};

export function getWalkDelayRange(movementScore: number): { minMs: number; maxMs: number } {
  const score = clampScore(movementScore);
  const minMs = interpolate(60000, 9000, score / 100);
  const maxMs = interpolate(110000, 18000, score / 100);
  return {
    minMs: Math.round(minMs),
    maxMs: Math.round(Math.max(maxMs, minMs + 5000))
  };
}

export function getWalkDelay(movementScore: number, random = Math.random): number {
  const range = getWalkDelayRange(movementScore);
  return range.minMs + clamp01(random()) * (range.maxMs - range.minMs);
}

export function selectSpeechLine(event: SpeechEvent, random = Math.random): string {
  const lines = speechLines[event];
  const index = Math.min(lines.length - 1, Math.floor(clamp01(random()) * lines.length));
  return lines[index];
}

export function getSpeechDuration(message: string): number {
  return Math.min(6000, Math.max(3000, 1800 + message.length * 60));
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
