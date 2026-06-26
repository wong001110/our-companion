import type { ToolExecuteInput, ToolExecutionResult, ToolPreview } from '@our-companion/shared';
export declare function isBlockedToolIntent(input: ToolExecuteInput): string | undefined;
export declare function requiresConfirmation(input: ToolExecuteInput): boolean;
export declare function previewTool(input: ToolExecuteInput): ToolPreview;
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
export declare function createToolExecutor(adapters: ToolAdapters): {
    preview(toolName: string, args: Record<string, unknown>): Promise<ToolPreview>;
    execute(toolName: string, args: Record<string, unknown>): Promise<{
        status: string;
        errorMessage?: string;
        blockedReason?: string;
    }>;
};
/**
 * Executes a single ActionStep (from action-engine) using the given adapters.
 * Maps the generic step shape to ToolExecuteInput.
 */
export declare function executeActionStep(toolName: string, args: Record<string, unknown>, adapters: ToolAdapters): Promise<{
    status: string;
    errorMessage?: string;
    blockedReason?: string;
}>;
export declare function executeTool(input: ToolExecuteInput, adapters: ToolAdapters): Promise<ToolExecutionResult>;
