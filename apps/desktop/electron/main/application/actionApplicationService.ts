import type { AppContext } from './appContext';
import type { ActionPlan, ActionPermissionState, PerformanceScript } from '@our-companion/shared';
import { createId } from '@our-companion/shared';
import { directPerformance, planAction, runActionPlan, type ActionOrchestratorDeps } from '@our-companion/action-engine';
import { executeActionStep } from '@our-companion/tool-engine';
import { validateActionPlan, DeepSeekClient, normalizeDeepSeekModel, normalizeDeepSeekEndpoint, getConfiguredModel, deepSeekDefaultEndpoint } from '@our-companion/ai-engine';
import { createElectronToolAdapters } from '../platform/electronCommandAdapter';
import type { AiApplicationService } from './aiApplicationService';

export class ActionApplicationService {
  private onPerformanceListeners: Array<(script: PerformanceScript) => void> = [];

  constructor(
    private readonly ctx: AppContext,
    private readonly aiService: AiApplicationService
  ) {}

  plan = async (text: string) => {
    const aiSettings = this.aiService.getSettings();
    const hasAi = aiSettings.apiKeyConfigured;
    let llmDeps = undefined;
    if (hasAi) {
      const client = this.createDeepSeekClient();
      llmDeps = {
        completeJson: async <T>(messages: Array<{ role: 'system' | 'user'; content: string }>) => {
          const result = await client.chat(messages.map((m) => ({ ...m, role: m.role as 'system' | 'user' | 'assistant' })));
          return result as T;
        },
        validateActionPlan: (raw: string) => validateActionPlan(raw),
      };
    }
    return planAction(text, llmDeps);
  };

  executePlan = async (plan: ActionPlan) => {
    const correlationId = createId('corr');
    const adapters = createElectronToolAdapters();
    const orchDeps: ActionOrchestratorDeps = {
      executeStep: (toolName: string, args: Record<string, unknown>) => executeActionStep(toolName, args, adapters),
      emitEvent: (type: string, payload?: Record<string, unknown>, cid?: string) => {
        this.ctx.eventBus.emit({ id: createId('evt'), type, source: 'action', timestamp: new Date().toISOString(), payload, correlationId: cid ?? correlationId });
      },
      getPermissions: () => this.ctx.db.getActionPermissions(),
      directPerformance: (actionId: string, outcome: 'success' | 'failure') => directPerformance(actionId, outcome),
      broadcastPerformance: (script: PerformanceScript) => {
        for (const listener of this.onPerformanceListeners) listener(script);
      },
    };
    return runActionPlan(plan, orchDeps, correlationId);
  };

  getPermissions = async (): Promise<ActionPermissionState> => this.ctx.db.getActionPermissions();
  updatePermissions = async (state: ActionPermissionState): Promise<ActionPermissionState> => this.ctx.db.setActionPermissions(state);

  onPerformance = (listener: (script: PerformanceScript) => void) => {
    this.onPerformanceListeners.push(listener);
    return () => {
      const idx = this.onPerformanceListeners.indexOf(listener);
      if (idx >= 0) this.onPerformanceListeners.splice(idx, 1);
    };
  };

  private createDeepSeekClient() {
    const aiSettings = this.aiService.getSettings();
    return new DeepSeekClient({
      apiKey: undefined,
      model: normalizeDeepSeekModel(aiSettings.model),
      endpoint: normalizeDeepSeekEndpoint(aiSettings.endpoint)
    });
  }
}
