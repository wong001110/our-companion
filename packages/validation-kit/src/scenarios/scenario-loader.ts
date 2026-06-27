import { createId, nowIso } from '@our-companion/shared';
import type { Scenario } from './types';
import { builtInScenarios } from './built-in-scenarios';

export interface ScenarioLoaderDeps {
  resetAll(): void;
  applyScenario(scenario: Scenario): void;
}

export class ScenarioLoader {
  private readonly deps: ScenarioLoaderDeps;
  private customScenarios: Scenario[] = [];
  private loadedScenarioId: string | null = null;

  constructor(deps: ScenarioLoaderDeps) {
    this.deps = deps;
  }

  list(): Scenario[] {
    return [...builtInScenarios, ...this.customScenarios];
  }

  getBuiltIn(): Scenario[] {
    return [...builtInScenarios];
  }

  getCustom(): Scenario[] {
    return [...this.customScenarios];
  }

  getById(id: string): Scenario | undefined {
    return this.list().find((s) => s.id === id);
  }

  load(id: string): boolean {
    const scenario = this.getById(id);
    if (!scenario) return false;
    this.deps.resetAll();
    this.deps.applyScenario(scenario);
    this.loadedScenarioId = id;
    return true;
  }

  saveCustom(scenario: Omit<Scenario, 'id' | 'createdAt'>): Scenario {
    const custom: Scenario = {
      ...scenario,
      id: createId('scenario'),
      createdAt: nowIso(),
    };
    this.customScenarios.push(custom);
    return custom;
  }

  deleteCustom(id: string): boolean {
    const before = this.customScenarios.length;
    this.customScenarios = this.customScenarios.filter((s) => s.id !== id);
    return this.customScenarios.length < before;
  }

  getLoadedId(): string | null {
    return this.loadedScenarioId;
  }

  exportScenario(id: string): Scenario | undefined {
    return this.getById(id);
  }

  importScenario(data: Scenario): Scenario {
    const imported: Scenario = {
      ...data,
      id: createId('scenario'),
      createdAt: nowIso(),
    };
    this.customScenarios.push(imported);
    return imported;
  }
}
