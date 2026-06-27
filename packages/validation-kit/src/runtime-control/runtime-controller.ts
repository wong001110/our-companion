import { createId, nowIso } from '@our-companion/shared';
import type { RuntimeMode, Breakpoint, RuntimeControlState } from './types';

export interface RuntimeControllerDeps {
  emitEvent(type: string, payload?: Record<string, unknown>): void;
}

export class RuntimeController {
  private state: RuntimeControlState = {
    mode: 'normal',
    speed: 1,
    tickCount: 0,
    breakpoints: [],
    queues: [],
    lastTickAt: nowIso(),
  };
  private readonly deps: RuntimeControllerDeps;
  private pausedResolve: (() => void) | null = null;

  constructor(deps: RuntimeControllerDeps) {
    this.deps = deps;
  }

  getState(): RuntimeControlState {
    return { ...this.state, breakpoints: this.state.breakpoints.map((b) => ({ ...b })) };
  }

  getMode(): RuntimeMode {
    return this.state.mode;
  }

  getSpeed(): number {
    return this.state.speed;
  }

  pause(): void {
    this.state = { ...this.state, mode: 'paused' };
    this.deps.emitEvent('RuntimePaused', { tickCount: this.state.tickCount });
  }

  resume(): void {
    this.state = { ...this.state, mode: 'normal' };
    this.pausedResolve?.();
    this.pausedResolve = null;
    this.deps.emitEvent('RuntimeResumed', { tickCount: this.state.tickCount });
  }

  step(): void {
    if (this.state.mode !== 'paused') {
      this.pause();
    }
    this.state = { ...this.state, mode: 'step' };
    this.deps.emitEvent('RuntimeStep', { tickCount: this.state.tickCount });
  }

  setSpeed(speed: number): void {
    this.state = { ...this.state, speed: Math.max(0.1, Math.min(100, speed)) };
    this.deps.emitEvent('RuntimeSpeedChanged', { speed: this.state.speed });
  }

  slowMotion(): void {
    this.setSpeed(0.25);
    this.state = { ...this.state, mode: 'slow_motion' };
  }

  fastForward(multiplier = 10): void {
    this.setSpeed(multiplier);
    this.state = { ...this.state, mode: 'fast_forward' };
  }

  onTick(): void {
    this.state = {
      ...this.state,
      tickCount: this.state.tickCount + 1,
      lastTickAt: nowIso(),
    };

    for (const bp of this.state.breakpoints) {
      if (bp.enabled) {
        bp.hitCount++;
      }
    }
  }

  addBreakpoint(eventType: string): Breakpoint {
    const bp: Breakpoint = {
      id: createId('bp'),
      eventType,
      enabled: true,
      hitCount: 0,
      createdAt: nowIso(),
    };
    this.state = {
      ...this.state,
      breakpoints: [...this.state.breakpoints, bp],
    };
    return bp;
  }

  removeBreakpoint(id: string): void {
    this.state = {
      ...this.state,
      breakpoints: this.state.breakpoints.filter((bp) => bp.id !== id),
    };
  }

  toggleBreakpoint(id: string): void {
    const bp = this.state.breakpoints.find((b) => b.id === id);
    if (bp) bp.enabled = !bp.enabled;
  }

  checkBreakpoint(eventType: string): boolean {
    return this.state.breakpoints.some((bp) => bp.enabled && bp.eventType === eventType);
  }

  waitForResume(): Promise<void> {
    if (this.state.mode !== 'paused') return Promise.resolve();
    return new Promise((resolve) => {
      this.pausedResolve = resolve;
    });
  }

  reset(): void {
    this.state = {
      mode: 'normal',
      speed: 1,
      tickCount: 0,
      breakpoints: [],
      queues: [],
      lastTickAt: nowIso(),
    };
    this.pausedResolve?.();
    this.pausedResolve = null;
  }
}
