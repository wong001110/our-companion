import type { ToolExecuteInput, ToolExecutionResult, ToolName, ToolPreview } from '@our-companion/shared';

const blockedPatterns = [
  /payment/i,
  /purchase/i,
  /buy\s+/i,
  /checkout/i,
  /delete/i,
  /remove\s+file/i,
  /send\s+(message|email)/i,
  /login/i,
  /password/i,
  /credential/i,
  /submit\s+form/i
];

function getStringArg(input: ToolExecuteInput, key: string): string | undefined {
  const value = input.args[key];
  return typeof value === 'string' ? value : undefined;
}

export function isBlockedToolIntent(input: ToolExecuteInput): string | undefined {
  const haystack = `${input.toolName} ${JSON.stringify(input.args)}`;
  if (blockedPatterns.some((pattern) => pattern.test(haystack))) {
    return 'This action is blocked in v1 because it may involve payment, login, credentials, form submission, sending messages, or deleting data.';
  }

  if (input.toolName === 'open_url') {
    const url = getStringArg(input, 'url');
    if (!url || !/^https?:\/\//i.test(url)) return 'open_url requires an http or https URL.';
  }

  if (input.toolName === 'open_app' && !getStringArg(input, 'appName')) {
    return 'open_app requires an appName.';
  }

  if (input.toolName === 'search_web' && !getStringArg(input, 'query')) {
    return 'search_web requires a query.';
  }

  if (input.toolName === 'browser_navigation') {
    const action = getStringArg(input, 'action');
    const allowed = ['open_tab', 'go_back', 'go_forward', 'reload'];
    if (!action || !allowed.includes(action)) return 'browser_navigation requires a supported action.';
  }

  return undefined;
}

export function requiresConfirmation(input: ToolExecuteInput): boolean {
  if (input.requireConfirmation) return true;
  if (input.toolName !== 'browser_navigation') return false;
  return getStringArg(input, 'action') === 'open_tab';
}

export function previewTool(input: ToolExecuteInput): ToolPreview {
  const blockedReason = isBlockedToolIntent(input);
  if (blockedReason) {
    return {
      allowed: false,
      requiresConfirmation: false,
      userFacingSummary: 'I cannot do that safely in this version.',
      blockedReason
    };
  }

  const summaries: Record<ToolName, string> = {
    open_url: `Open ${getStringArg(input, 'url')}.`,
    open_app: `Open ${getStringArg(input, 'appName')}.`,
    search_web: `Search ${getStringArg(input, 'target') ?? 'the web'} for "${getStringArg(input, 'query')}".`,
    browser_navigation: `Run browser navigation: ${getStringArg(input, 'action')}.`
  };

  return {
    allowed: true,
    requiresConfirmation: requiresConfirmation(input),
    userFacingSummary: summaries[input.toolName]
  };
}

export interface ToolAdapters {
  openUrl(url: string): Promise<unknown>;
  openApp(appName: string): Promise<unknown>;
  searchWeb(query: string, target?: string): Promise<unknown>;
  browserNavigation(action: string, url?: string): Promise<unknown>;
}

/**
 * Creates a CommandExecutor wrapping previewTool / executeTool behind the
 * shared interface so the action orchestrator can call it generically.
 */
export function createToolExecutor(adapters: ToolAdapters): {
  preview(toolName: string, args: Record<string, unknown>): Promise<ToolPreview>;
  execute(toolName: string, args: Record<string, unknown>): Promise<{ status: string; errorMessage?: string; blockedReason?: string }>;
} {
  return {
    async preview(toolName, args) {
      const input: ToolExecuteInput = { toolName: toolName as ToolName, args };
      return previewTool(input);
    },
    async execute(toolName, args) {
      const input: ToolExecuteInput = { toolName: toolName as ToolName, args };
      return executeTool(input, adapters);
    },
  };
}

/**
 * Executes a single ActionStep (from action-engine) using the given adapters.
 * Maps the generic step shape to ToolExecuteInput.
 */
export async function executeActionStep(
  toolName: string,
  args: Record<string, unknown>,
  adapters: ToolAdapters,
): Promise<{ status: string; errorMessage?: string; blockedReason?: string }> {
  const input: ToolExecuteInput = { toolName: toolName as ToolName, args };
  return executeTool(input, adapters);
}

export async function executeTool(input: ToolExecuteInput, adapters: ToolAdapters): Promise<ToolExecutionResult> {
  const preview = previewTool(input);
  if (!preview.allowed) return { ...preview, status: 'blocked' };
  if (preview.requiresConfirmation && !input.requireConfirmation) return { ...preview, status: 'preview_required' };

  try {
    let result: unknown;
    if (input.toolName === 'open_url') result = await adapters.openUrl(getStringArg(input, 'url') ?? '');
    if (input.toolName === 'open_app') result = await adapters.openApp(getStringArg(input, 'appName') ?? '');
    if (input.toolName === 'search_web') {
      result = await adapters.searchWeb(getStringArg(input, 'query') ?? '', getStringArg(input, 'target'));
    }
    if (input.toolName === 'browser_navigation') {
      result = await adapters.browserNavigation(getStringArg(input, 'action') ?? '', getStringArg(input, 'url'));
    }
    return { ...preview, status: 'executed', result };
  } catch (error) {
    return {
      ...preview,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}
