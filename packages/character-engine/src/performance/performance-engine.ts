import type {
  PerformanceScriptV2,
  PerformanceCue,
  PerformanceExecution,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export class PerformanceEngine {
  private scripts: Map<string, PerformanceScriptV2> = new Map();
  private executions: Map<string, PerformanceExecution> = new Map();

  loadScript(script: PerformanceScriptV2): void {
    this.scripts.set(script.id, script);
  }

  playScript(scriptId: string): PerformanceExecution | undefined {
    const script = this.scripts.get(scriptId);
    if (!script) return undefined;

    const execution: PerformanceExecution = {
      id: createId('perf_exec'),
      scriptId,
      startedAt: nowIso(),
      status: 'playing',
      currentCueIndex: 0,
    };

    this.executions.set(execution.id, execution);
    return execution;
  }

  completeExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    this.executions.set(executionId, {
      ...execution,
      status: 'completed',
      completedAt: nowIso(),
    });
  }

  cancelExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    this.executions.set(executionId, {
      ...execution,
      status: 'cancelled',
      completedAt: nowIso(),
    });
  }

  getActiveExecution(): PerformanceExecution | undefined {
    for (const execution of this.executions.values()) {
      if (execution.status === 'playing') {
        return execution;
      }
    }
    return undefined;
  }

  getScript(scriptId: string): PerformanceScriptV2 | undefined {
    return this.scripts.get(scriptId);
  }
}

export const defaultPerformanceScripts: PerformanceScriptV2[] = [
  {
    id: 'idle',
    name: 'Idle',
    behaviourType: 'idle',
    animationSequence: [
      { id: 'cue_1', type: 'animation', startMs: 0, durationMs: 2000, payload: 'idle_laptop' },
    ],
    durationMs: 2000,
    interruptible: true,
    tags: ['idle'],
  },
  {
    id: 'thinking',
    name: 'Thinking',
    behaviourType: 'think',
    emotion: 'curious',
    animationSequence: [
      { id: 'cue_1', type: 'animation', startMs: 0, durationMs: 1500, payload: 'think' },
    ],
    durationMs: 1500,
    interruptible: true,
    tags: ['thinking'],
  },
  {
    id: 'speaking',
    name: 'Speaking',
    behaviourType: 'speak',
    animationSequence: [
      { id: 'cue_1', type: 'animation', startMs: 0, durationMs: 2000, payload: 'talk' },
    ],
    durationMs: 2000,
    interruptible: true,
    tags: ['speaking'],
  },
  {
    id: 'share_discovery',
    name: 'Share Discovery',
    behaviourType: 'share_discovery',
    emotion: 'excited',
    animationSequence: [
      { id: 'cue_1', type: 'animation', startMs: 0, durationMs: 1000, payload: 'discovery' },
    ],
    durationMs: 1000,
    interruptible: true,
    tags: ['discovery'],
  },
  {
    id: 'sleeping',
    name: 'Sleeping',
    behaviourType: 'sleep',
    animationSequence: [
      { id: 'cue_1', type: 'animation', startMs: 0, durationMs: 3000, payload: 'idle_tired' },
    ],
    durationMs: 3000,
    interruptible: false,
    tags: ['sleep'],
  },
];
