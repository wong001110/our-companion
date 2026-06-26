import type { BaseEvent, SourceItem, SourceProvider } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import type { EventBus } from '@our-companion/event-bus';
import { createEvent, globalEventBus } from '@our-companion/event-bus';

export type PluginExtensionPoint =
  | 'source_provider'
  | 'llm_provider'
  | 'embedding_provider'
  | 'command_executor'
  | 'character_package'
  | 'widget'
  | 'action';

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
  emit(event: Omit<BaseEvent, 'id' | 'timestamp' | 'source'> & { source?: string }): void;
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

const supportedSdkMajor = 1;

export function validatePluginManifest(manifest: PluginManifest): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!manifest.id.trim()) errors.push('Plugin id is required.');
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) errors.push('Plugin version must be semantic.');
  if (!/^\d+\.\d+\.\d+/.test(manifest.sdkVersion)) errors.push('SDK version must be semantic.');
  const major = Number(manifest.sdkVersion.split('.')[0]);
  if (major !== supportedSdkMajor) errors.push(`Unsupported SDK major version: ${manifest.sdkVersion}.`);
  if (manifest.extensionPoints.length === 0) errors.push('At least one extension point is required.');
  if (manifest.permissions.includes('network:explicit')) warnings.push('Plugin requests explicit network permission.');
  if (manifest.permissions.includes('filesystem:explicit')) warnings.push('Plugin requests explicit filesystem permission.');
  return { valid: errors.length === 0, errors, warnings };
}

function createContext(manifest: PluginManifest, eventBus: EventBus): PluginContext {
  return {
    manifest,
    eventBus,
    emit(event) {
      if (!manifest.permissions.includes('events:emit')) {
        throw new Error(`Plugin ${manifest.id} does not have events:emit permission.`);
      }
      eventBus.emit(
        createEvent({
          type: event.type,
          source: event.source ?? manifest.id,
          payload: event.payload,
          correlationId: event.correlationId,
          causationId: event.causationId
        })
      );
    }
  };
}

export class PluginHost {
  private readonly plugins = new Map<string, LoadedPlugin>();

  constructor(private readonly eventBus: EventBus = globalEventBus) {}

  discover(manifests: PluginManifest[]): PluginManifest[] {
    return manifests.filter((manifest) => validatePluginManifest(manifest).valid);
  }

  async load(manifest: PluginManifest, module: PluginModule): Promise<LoadedPlugin> {
    const validation = validatePluginManifest(manifest);
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }
    const loaded: LoadedPlugin = { manifest, module, state: 'loaded' };
    this.plugins.set(manifest.id, loaded);
    await module.onLoad?.(createContext(manifest, this.eventBus));
    return loaded;
  }

  async activate(id: string): Promise<LoadedPlugin> {
    const plugin = this.requirePlugin(id);
    await plugin.module.onActivate?.(createContext(plugin.manifest, this.eventBus));
    plugin.state = 'active';
    this.eventBus.emit(createEvent({ type: 'PluginActivated', source: 'plugin-host', payload: { pluginId: id } }));
    return plugin;
  }

  async suspend(id: string): Promise<LoadedPlugin> {
    const plugin = this.requirePlugin(id);
    await plugin.module.onSuspend?.(createContext(plugin.manifest, this.eventBus));
    plugin.state = 'suspended';
    return plugin;
  }

  async unload(id: string): Promise<void> {
    const plugin = this.requirePlugin(id);
    await plugin.module.onUnload?.(createContext(plugin.manifest, this.eventBus));
    plugin.state = 'unloaded';
    this.plugins.delete(id);
  }

  list(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  private requirePlugin(id: string): LoadedPlugin {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin not loaded: ${id}`);
    return plugin;
  }
}

export function createRssDiscoveryPlugin(input: {
  id?: string;
  name?: string;
  fetchItems: () => Promise<SourceItem[]>;
}): { manifest: PluginManifest; module: PluginModule } {
  const manifest: PluginManifest = {
    id: input.id ?? 'sample-rss-discovery',
    name: input.name ?? 'Sample RSS Discovery Provider',
    version: '1.0.0',
    sdkVersion: '1.0.0',
    extensionPoints: ['source_provider'],
    permissions: ['events:emit']
  };
  const module: PluginModule = {
    sourceProvider: {
      name: manifest.id,
      async fetch() {
        return input.fetchItems();
      }
    },
    async onActivate(context) {
      context.emit({
        type: 'SignalCaptured',
        payload: {
          pluginId: manifest.id,
          activatedAt: nowIso()
        }
      });
    }
  };
  return { manifest, module };
}

export function createPluginManifest(input: Omit<PluginManifest, 'id' | 'version' | 'sdkVersion'> & {
  id?: string;
  version?: string;
  sdkVersion?: string;
}): PluginManifest {
  return {
    id: input.id ?? createId('plugin'),
    name: input.name,
    version: input.version ?? '1.0.0',
    sdkVersion: input.sdkVersion ?? '1.0.0',
    extensionPoints: input.extensionPoints,
    permissions: input.permissions,
    entry: input.entry
  };
}
