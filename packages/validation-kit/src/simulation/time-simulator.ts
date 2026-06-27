import { nowIso } from '@our-companion/shared';
import type { TimeAdvance } from './types';

let simulatedTime: string | null = null;

export function getSimulatedTime(): string {
  return simulatedTime ?? nowIso();
}

export function setSimulatedTime(time: string): void {
  simulatedTime = time;
}

export function advanceTime(advance: TimeAdvance): string {
  const base = simulatedTime ? new Date(simulatedTime) : new Date();
  if (advance.customDate) {
    simulatedTime = new Date(advance.customDate).toISOString();
  } else {
    const ms =
      (advance.minutes ?? 0) * 60_000 +
      (advance.hours ?? 0) * 3_600_000 +
      (advance.days ?? 0) * 86_400_000;
    simulatedTime = new Date(base.getTime() + ms).toISOString();
  }
  return simulatedTime;
}

export function resetTime(): void {
  simulatedTime = null;
}

export function setTime(dateString: string): void {
  simulatedTime = new Date(dateString).toISOString();
}

export function getTimeDescription(advance: TimeAdvance): string {
  if (advance.customDate) return `Set to ${advance.customDate}`;
  const parts: string[] = [];
  if (advance.days) parts.push(`${advance.days} day${advance.days > 1 ? 's' : ''}`);
  if (advance.hours) parts.push(`${advance.hours} hour${advance.hours > 1 ? 's' : ''}`);
  if (advance.minutes) parts.push(`${advance.minutes} minute${advance.minutes > 1 ? 's' : ''}`);
  return `Advanced +${parts.join(' ')}`;
}
