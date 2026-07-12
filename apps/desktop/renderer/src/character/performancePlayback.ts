import type { CompanionAnimationName, PerformanceScriptV2 } from '@our-companion/shared';
import { isCompanionAnimationName } from './animationSelection';

interface PlaybackScheduler {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timeoutId: number): void;
}

export interface ActivePerformancePlayback {
  scriptId: string;
  cueIndex: number;
  animation?: CompanionAnimationName;
  timeoutIds: number[];
  cancel(): void;
}

function animationForCue(payload: unknown): CompanionAnimationName | undefined {
  const candidate = payload && typeof payload === 'object' && 'animationKey' in payload
    ? (payload as { animationKey: unknown }).animationKey
    : payload;
  return isCompanionAnimationName(candidate) ? candidate : undefined;
}

/** Starts one renderer-owned performance timeline and returns its cancellation handle. */
export function startPerformancePlayback(
  script: PerformanceScriptV2,
  setAnimation: (animation: CompanionAnimationName | undefined) => void,
  scheduler: PlaybackScheduler = window,
): ActivePerformancePlayback {
  const playback: ActivePerformancePlayback = {
    scriptId: script.id,
    cueIndex: -1,
    timeoutIds: [],
    cancel: () => {
      for (const timeoutId of playback.timeoutIds) scheduler.clearTimeout(timeoutId);
      playback.timeoutIds = [];
    },
  };
  let cancelled = false;
  const cancel = playback.cancel;
  playback.cancel = () => {
    cancelled = true;
    cancel();
  };

  let endAt = 0;
  script.animationSequence.forEach((cue, cueIndex) => {
    const animation = animationForCue(cue.payload);
    if (!animation) return;
    const startAt = Math.max(0, cue.startMs);
    endAt = Math.max(endAt, startAt + Math.max(0, cue.durationMs ?? 0));
    playback.timeoutIds.push(scheduler.setTimeout(() => {
      if (cancelled) return;
      playback.cueIndex = cueIndex;
      playback.animation = animation;
      setAnimation(animation);
    }, startAt));
  });
  const completionAt = Math.max(endAt, script.durationMs ?? 0);
  playback.timeoutIds.push(scheduler.setTimeout(() => {
    if (cancelled) return;
    playback.animation = undefined;
    setAnimation(undefined);
  }, completionAt));
  return playback;
}
