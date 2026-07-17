import type {
  SimulationConfig,
  SimulationResult,
  SimulationStateChange,
  SimulationStateDelta,
} from './types';
import type {
  Clock,
  ProductionRuntimeExecution,
  ProductionRuntimeGateway,
} from '../production-runtime';

export interface SimulationEngineDeps {
  gateway: ProductionRuntimeGateway;
  emitEvent(type: string, payload?: Record<string, unknown>): void;
  clock?: Pick<Clock, 'nowIso'>;
}

export class SimulationEngine {
  private readonly deps: SimulationEngineDeps;
  private history: SimulationResult[] = [];

  constructor(deps: SimulationEngineDeps) {
    this.deps = deps;
  }

  getHistory(): SimulationResult[] {
    return this.history.map(clone);
  }

  async execute(config: SimulationConfig): Promise<SimulationResult> {
    const before = clone(await this.deps.gateway.getState());
    let execution: ProductionRuntimeExecution;
    try {
      execution = await this.deps.gateway.execute({
        category: config.category,
        params: clone(config.params),
      });
    } catch (error) {
      execution = {
        operation: config.category,
        status: 'failed',
        description: `${config.category} production flow failed`,
        traceIds: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const after = execution.state
      ? clone(execution.state)
      : clone(await this.deps.gateway.getState());
    const result = toSimulationResult(config, execution, before, after, this.timestamp());
    this.history.push(result);
    this.deps.emitEvent('SimulationExecuted', {
      category: config.category,
      operation: result.operation,
      status: result.status,
      success: result.success,
      correlationId: result.correlationId,
      traceIds: result.traceIds,
    });
    return clone(result);
  }

  clearHistory(): void {
    this.history = [];
  }

  resetAll(): void {
    this.history = [];
  }

  private timestamp(): string {
    return this.deps.clock?.nowIso() ?? new Date().toISOString();
  }
}

function toSimulationResult(
  config: SimulationConfig,
  execution: ProductionRuntimeExecution,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fallbackTimestamp: string,
): SimulationResult {
  return {
    success: execution.status !== 'failed',
    category: config.category,
    operation: execution.operation,
    status: execution.status,
    description: execution.description ?? `${execution.operation} ${execution.status}`,
    correlationId: execution.correlationId,
    traceIds: [...execution.traceIds],
    inputRefs: [...(execution.inputRefs ?? [])],
    outputRefs: [...(execution.outputRefs ?? [])],
    stateDelta: createStateDelta(before, after),
    error: execution.error,
    timestamp: execution.completedAt ?? fallbackTimestamp,
  };
}

export function createStateDelta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): SimulationStateDelta {
  const changes: Record<string, SimulationStateChange> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (!isEquivalent(before[key], after[key])) {
      changes[key] = {
        before: clone(before[key]),
        after: clone(after[key]),
      };
    }
  }
  return { before: clone(before), after: clone(after), changes };
}

function isEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  if (value === undefined) return value;
  return structuredClone(value);
}
