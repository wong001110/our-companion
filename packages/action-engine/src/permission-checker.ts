import type { ActionPlanV2, ActionPermissionState } from '@our-companion/shared';

const HIGH_RISK_TOOLS = new Set(['delete', 'remove', 'send', 'publish', 'deploy']);
const MEDIUM_RISK_TOOLS = new Set(['open_app', 'install', 'update']);

export function assessRiskLevel(toolName: string): 'low' | 'medium' | 'high' {
  if (HIGH_RISK_TOOLS.has(toolName)) return 'high';
  if (MEDIUM_RISK_TOOLS.has(toolName)) return 'medium';
  return 'low';
}

export function checkPermissions(
  plan: ActionPlanV2,
  permissions: ActionPermissionState
): { allowed: boolean; missingPermissions: string[] } {
  const missingPermissions: string[] = [];

  for (const scope of plan.requiredPermissions) {
    const decision = permissions[scope as keyof ActionPermissionState];
    if (decision === 'denied') {
      return { allowed: false, missingPermissions: [scope] };
    }
    if (decision === 'ask') {
      missingPermissions.push(scope);
    }
  }

  return {
    allowed: missingPermissions.length === 0,
    missingPermissions,
  };
}

export function requiresConfirmation(plan: ActionPlanV2): boolean {
  if (plan.confirmationRequired) return true;
  if (plan.riskLevel === 'high') return true;
  return false;
}
