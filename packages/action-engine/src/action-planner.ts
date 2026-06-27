import type { ActionIntent, ActionPlanV2, ActionStep } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export function createActionPlan(intent: ActionIntent): ActionPlanV2 {
  const steps: ActionStep[] = [
    {
      id: createId('step'),
      toolName: intent.type,
      args: intent.payload as Record<string, unknown> ?? {},
      requiredScopes: [],
    },
  ];

  return {
    id: createId('plan'),
    intentId: intent.id,
    steps,
    requiredPermissions: [],
    riskLevel: intent.riskLevel,
    confirmationRequired: intent.requiresConfirmation,
    status: intent.requiresConfirmation ? 'pending_confirmation' : 'draft',
  };
}

export function approvePlan(plan: ActionPlanV2): ActionPlanV2 {
  return {
    ...plan,
    status: 'approved',
  };
}

export function cancelPlan(plan: ActionPlanV2): ActionPlanV2 {
  return {
    ...plan,
    status: 'cancelled',
  };
}
