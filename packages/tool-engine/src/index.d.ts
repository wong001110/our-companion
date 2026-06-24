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
export declare function executeTool(input: ToolExecuteInput, adapters: ToolAdapters): Promise<ToolExecutionResult>;
