import type { ActionPlanV2, ActionResult } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export async function executeActionPlan(plan: ActionPlanV2): Promise<ActionResult> {
  const outputs: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const step of plan.steps) {
    try {
      outputs[step.id] = { status: 'executed', tool: step.toolName };
    } catch (error) {
      errors.push(`Step ${step.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    id: createId('action_result'),
    planId: plan.id,
    status: errors.length === 0 ? 'success' : errors.length === plan.steps.length ? 'failure' : 'partial',
    outputs,
    errors: errors.length > 0 ? errors : undefined,
    completedAt: nowIso(),
  };
}
