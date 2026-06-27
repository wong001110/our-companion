import type { ResetType } from './types';

export interface ResetManagerDeps {
  resetRuntime(): void;
  resetModule(moduleName: string): void;
  resetAll(): void;
  emitEvent(type: string, payload?: Record<string, unknown>): void;
}

export class ResetManager {
  private readonly deps: ResetManagerDeps;

  constructor(deps: ResetManagerDeps) {
    this.deps = deps;
  }

  reset(type: ResetType, moduleName?: string): { success: boolean; description: string } {
    switch (type) {
      case 'runtime':
        this.deps.resetRuntime();
        this.deps.emitEvent('RuntimeReset', { type: 'runtime' });
        return { success: true, description: 'Runtime reset to initial state' };

      case 'module':
        if (!moduleName) return { success: false, description: 'Module name required for module reset' };
        this.deps.resetModule(moduleName);
        this.deps.emitEvent('ModuleReset', { type: 'module', module: moduleName });
        return { success: true, description: `Module "${moduleName}" reset` };

      case 'validation':
        this.deps.resetAll();
        this.deps.emitEvent('ValidationReset', { type: 'validation' });
        return { success: true, description: 'Validation environment reset' };

      case 'full':
        this.deps.resetAll();
        this.deps.emitEvent('FullReset', { type: 'full' });
        return { success: true, description: 'Full development reset — clean installation state' };

      default:
        return { success: false, description: `Unknown reset type: ${type}` };
    }
  }
}
