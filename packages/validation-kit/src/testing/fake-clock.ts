import type { Clock } from '../production-runtime';

interface ScheduledTask {
  id: number;
  dueAt: number;
  callback: () => void;
}

export class FakeClock implements Clock {
  private currentMs: number;
  private nextId = 1;
  private readonly tasks = new Map<number, ScheduledTask>();

  constructor(start: number | string | Date = 0) {
    this.currentMs = toMilliseconds(start);
  }

  now(): number {
    return this.currentMs;
  }

  nowIso(): string {
    return new Date(this.currentMs).toISOString();
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.tasks.set(id, {
      id,
      dueAt: this.currentMs + Math.max(0, delayMs),
      callback,
    });
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === 'number') this.tasks.delete(handle);
  }

  pendingTimerCount(): number {
    return this.tasks.size;
  }

  advanceBy(milliseconds: number): void {
    this.advanceTo(this.currentMs + Math.max(0, milliseconds));
  }

  advanceTo(target: number | string | Date): void {
    const targetMs = toMilliseconds(target);
    if (targetMs < this.currentMs) {
      throw new Error('FakeClock cannot move backwards.');
    }

    while (true) {
      const next = [...this.tasks.values()]
        .filter((task) => task.dueAt <= targetMs)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0];
      if (!next) break;
      this.tasks.delete(next.id);
      this.currentMs = next.dueAt;
      next.callback();
    }
    this.currentMs = targetMs;
  }

  runAll(maxTasks = 10_000): void {
    let executed = 0;
    while (this.tasks.size > 0) {
      if (executed++ >= maxTasks) {
        throw new Error(`FakeClock exceeded the ${maxTasks} task safety limit.`);
      }
      const next = [...this.tasks.values()]
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0]!;
      this.advanceTo(next.dueAt);
    }
  }
}

function toMilliseconds(value: number | string | Date): number {
  const result = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(result)) throw new Error('FakeClock requires a valid start time.');
  return result;
}
