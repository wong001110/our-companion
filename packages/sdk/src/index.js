import { createId, nowIso } from '@our-companion/shared';
import { createEvent, globalEventBus } from '@our-companion/event-bus';
const supportedSdkMajor = 1;
export function validatePluginManifest(manifest) {
    const errors = [];
    const warnings = [];
    if (!manifest.id.trim())
        errors.push('Plugin id is required.');
    if (!/^\d+\.\d+\.\d+/.test(manifest.version))
        errors.push('Plugin version must be semantic.');
    if (!/^\d+\.\d+\.\d+/.test(manifest.sdkVersion))
        errors.push('SDK version must be semantic.');
    const major = Number(manifest.sdkVersion.split('.')[0]);
    if (major !== supportedSdkMajor)
        errors.push(`Unsupported SDK major version: ${manifest.sdkVersion}.`);
    if (manifest.extensionPoints.length === 0)
        errors.push('At least one extension point is required.');
    if (manifest.permissions.includes('network:explicit'))
        warnings.push('Plugin requests explicit network permission.');
    if (manifest.permissions.includes('filesystem:explicit'))
        warnings.push('Plugin requests explicit filesystem permission.');
    return { valid: errors.length === 0, errors, warnings };
}
function createContext(manifest, eventBus) {
    return {
        manifest,
        eventBus,
        emit(event) {
            if (!manifest.permissions.includes('events:emit')) {
                throw new Error(`Plugin ${manifest.id} does not have events:emit permission.`);
            }
            eventBus.emit(createEvent({
                type: event.type,
                source: event.source ?? manifest.id,
                payload: event.payload,
                correlationId: event.correlationId,
                causationId: event.causationId
            }));
        }
    };
}
export class PluginHost {
    eventBus;
    plugins = new Map();
    constructor(eventBus = globalEventBus) {
        this.eventBus = eventBus;
    }
    discover(manifests) {
        return manifests.filter((manifest) => validatePluginManifest(manifest).valid);
    }
    async load(manifest, module) {
        const validation = validatePluginManifest(manifest);
        if (!validation.valid) {
            throw new Error(validation.errors.join(' '));
        }
        const loaded = { manifest, module, state: 'loaded' };
        this.plugins.set(manifest.id, loaded);
        await module.onLoad?.(createContext(manifest, this.eventBus));
        return loaded;
    }
    async activate(id) {
        const plugin = this.requirePlugin(id);
        await plugin.module.onActivate?.(createContext(plugin.manifest, this.eventBus));
        plugin.state = 'active';
        this.eventBus.emit(createEvent({ type: 'PluginActivated', source: 'plugin-host', payload: { pluginId: id } }));
        return plugin;
    }
    async suspend(id) {
        const plugin = this.requirePlugin(id);
        await plugin.module.onSuspend?.(createContext(plugin.manifest, this.eventBus));
        plugin.state = 'suspended';
        return plugin;
    }
    async unload(id) {
        const plugin = this.requirePlugin(id);
        await plugin.module.onUnload?.(createContext(plugin.manifest, this.eventBus));
        plugin.state = 'unloaded';
        this.plugins.delete(id);
    }
    list() {
        return [...this.plugins.values()];
    }
    requirePlugin(id) {
        const plugin = this.plugins.get(id);
        if (!plugin)
            throw new Error(`Plugin not loaded: ${id}`);
        return plugin;
    }
}
export function createRssDiscoveryPlugin(input) {
    const manifest = {
        id: input.id ?? 'sample-rss-discovery',
        name: input.name ?? 'Sample RSS Discovery Provider',
        version: '1.0.0',
        sdkVersion: '1.0.0',
        extensionPoints: ['source_provider'],
        permissions: ['events:emit']
    };
    const module = {
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
export function createPluginManifest(input) {
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
