import type { BaseEvent, SourceItem, SourceProvider } from '@our-companion/shared';
import type { EventBus } from '@our-companion/event-bus';
export type PluginExtensionPoint = 'source_provider' | 'llm_provider' | 'embedding_provider' | 'command_executor' | 'character_package' | 'widget' | 'action';
export type PluginPermission = 'events:read' | 'events:emit' | 'network:explicit' | 'filesystem:explicit' | 'commands:explicit';
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    sdkVersion: string;
    extensionPoints: PluginExtensionPoint[];
    permissions: PluginPermission[];
    entry?: string;
}
export interface PluginContext {
    manifest: PluginManifest;
    eventBus: EventBus;
    emit(event: Omit<BaseEvent, 'id' | 'timestamp' | 'source'> & {
        source?: string;
    }): void;
}
export interface PluginLifecycle {
    onLoad?(context: PluginContext): Promise<void> | void;
    onActivate?(context: PluginContext): Promise<void> | void;
    onSuspend?(context: PluginContext): Promise<void> | void;
    onUnload?(context: PluginContext): Promise<void> | void;
}
export interface PluginModule extends PluginLifecycle {
    sourceProvider?: SourceProvider;
}
export interface LoadedPlugin {
    manifest: PluginManifest;
    module: PluginModule;
    state: 'loaded' | 'active' | 'suspended' | 'unloaded';
}
export interface PluginValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export declare function validatePluginManifest(manifest: PluginManifest): PluginValidationResult;
export declare class PluginHost {
    private readonly eventBus;
    private readonly plugins;
    constructor(eventBus?: EventBus);
    discover(manifests: PluginManifest[]): PluginManifest[];
    load(manifest: PluginManifest, module: PluginModule): Promise<LoadedPlugin>;
    activate(id: string): Promise<LoadedPlugin>;
    suspend(id: string): Promise<LoadedPlugin>;
    unload(id: string): Promise<void>;
    list(): LoadedPlugin[];
    private requirePlugin;
}
export declare function createRssDiscoveryPlugin(input: {
    id?: string;
    name?: string;
    fetchItems: () => Promise<SourceItem[]>;
}): {
    manifest: PluginManifest;
    module: PluginModule;
};
export declare function createPluginManifest(input: Omit<PluginManifest, 'id' | 'version' | 'sdkVersion'> & {
    id?: string;
    version?: string;
    sdkVersion?: string;
}): PluginManifest;
