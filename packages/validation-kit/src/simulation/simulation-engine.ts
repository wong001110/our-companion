import { nowIso } from '@our-companion/shared';
import type {
  SimulationCategory,
  SimulationConfig,
  SimulationResult,
  TimeAdvance,
  RelationshipOverride,
  ContextOverride,
  RuntimeOverride,
} from './types';
import { advanceTime, getSimulatedTime, resetTime } from './time-simulator';

export interface SimulationEngineDeps {
  emitEvent(type: string, payload?: Record<string, unknown>): void;
  updateRelationship?(override: RelationshipOverride): void;
  updateContext?(override: ContextOverride): void;
  updateRuntime?(override: RuntimeOverride): void;
}

export class SimulationEngine {
  private readonly deps: SimulationEngineDeps;
  private history: SimulationResult[] = [];
  private contextOverride: ContextOverride | null = null;
  private runtimeOverride: RuntimeOverride | null = null;

  constructor(deps: SimulationEngineDeps) {
    this.deps = deps;
  }

  getHistory(): SimulationResult[] {
    return [...this.history];
  }

  getContextOverride(): ContextOverride | null {
    return this.contextOverride ? { ...this.contextOverride } : null;
  }

  getRuntimeOverride(): RuntimeOverride | null {
    return this.runtimeOverride ? { ...this.runtimeOverride } : null;
  }

  execute(config: SimulationConfig): SimulationResult {
    const result = this.processConfig(config);
    this.history.push(result);
    this.deps.emitEvent('SimulationExecuted', {
      category: config.category,
      success: result.success,
      description: result.description,
    });
    return result;
  }

  private processConfig(config: SimulationConfig): SimulationResult {
    const timestamp = nowIso();
    switch (config.category) {
      case 'time':
        return this.simulateTime(config.params as unknown as TimeAdvance, timestamp);
      case 'relationship':
        return this.simulateRelationship(config.params as unknown as RelationshipOverride, timestamp);
      case 'context':
        return this.simulateContext(config.params as unknown as ContextOverride, timestamp);
      case 'runtime':
        return this.simulateRuntime(config.params as unknown as RuntimeOverride, timestamp);
      case 'journey':
        return this.simulateJourney(config.params, timestamp);
      case 'discovery':
        return this.simulateDiscovery(config.params, timestamp);
      case 'memory':
        return this.simulateMemory(config.params, timestamp);
      case 'notebook':
        return this.simulateNotebook(config.params, timestamp);
      default:
        return { success: false, category: config.category, description: 'Unknown category', affectedSystems: [], timestamp };
    }
  }

  private simulateTime(advance: TimeAdvance, timestamp: string): SimulationResult {
    const before = getSimulatedTime();
    advanceTime(advance);
    const after = getSimulatedTime();
    return {
      success: true,
      category: 'time',
      description: `Time advanced from ${before} to ${after}`,
      affectedSystems: ['journey', 'reflection', 'discovery', 'relationship', 'notebook', 'notifications'],
      timestamp,
    };
  }

  private simulateRelationship(override: RelationshipOverride, timestamp: string): SimulationResult {
    this.deps.updateRelationship?.(override);
    return {
      success: true,
      category: 'relationship',
      description: `Relationship updated: trust=${override.trustScore ?? 'unchanged'}, stage=${override.stage ?? 'unchanged'}`,
      affectedSystems: ['behavior', 'initiative', 'conversation', 'notebook'],
      timestamp,
    };
  }

  private simulateContext(override: ContextOverride, timestamp: string): SimulationResult {
    this.contextOverride = override;
    this.deps.updateContext?.(override);
    return {
      success: true,
      category: 'context',
      description: `Context overridden to ${override.category} (confidence: ${override.confidence ?? 0.9})`,
      affectedSystems: ['behavior', 'attention', 'initiative', 'notification'],
      timestamp,
    };
  }

  private simulateRuntime(override: RuntimeOverride, timestamp: string): SimulationResult {
    this.runtimeOverride = override;
    this.deps.updateRuntime?.(override);
    return {
      success: true,
      category: 'runtime',
      description: `Runtime state forced to ${override.state}`,
      affectedSystems: ['presence', 'animation', 'behavior'],
      timestamp,
    };
  }

  private simulateJourney(params: Record<string, unknown>, timestamp: string): SimulationResult {
    const action = (params.action as string) ?? 'create';
    return {
      success: true,
      category: 'journey',
      description: `Journey action: ${action}`,
      affectedSystems: ['journey', 'notebook', 'reflection', 'cards'],
      timestamp,
    };
  }

  private simulateDiscovery(params: Record<string, unknown>, timestamp: string): SimulationResult {
    const action = (params.action as string) ?? 'complete';
    return {
      success: true,
      category: 'discovery',
      description: `Discovery action: ${action}`,
      affectedSystems: ['discovery', 'cards', 'notification', 'notebook'],
      timestamp,
    };
  }

  private simulateMemory(params: Record<string, unknown>, timestamp: string): SimulationResult {
    const action = (params.action as string) ?? 'add';
    return {
      success: true,
      category: 'memory',
      description: `Memory action: ${action}`,
      affectedSystems: ['memory', 'pattern', 'insight', 'notebook'],
      timestamp,
    };
  }

  private simulateNotebook(params: Record<string, unknown>, timestamp: string): SimulationResult {
    const action = (params.action as string) ?? 'generate_daily';
    return {
      success: true,
      category: 'notebook',
      description: `Notebook action: ${action}`,
      affectedSystems: ['notebook', 'cards', 'reflection'],
      timestamp,
    };
  }

  clearHistory(): void {
    this.history = [];
  }

  resetAll(): void {
    resetTime();
    this.contextOverride = null;
    this.runtimeOverride = null;
    this.history = [];
  }
}
