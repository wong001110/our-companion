import type { ToolAdapters } from '@our-companion/tool-engine';
export declare function searchUrl(query: string, target?: string): string;
export declare function openKnownApp(appName: string): Promise<{
    appName: string;
    started: boolean;
}>;
export declare function createElectronToolAdapters(): ToolAdapters;
