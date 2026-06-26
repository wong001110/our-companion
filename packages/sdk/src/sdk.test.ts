import { describe, expect, it, vi } from 'vitest';
import { InProcessEventBus } from '@our-companion/event-bus';
import { createPluginManifest, createRssDiscoveryPlugin, PluginHost, validatePluginManifest } from './index';

describe('developer sdk', () => {
  it('validates manifests and version compatibility', () => {
    const valid = createPluginManifest({
      name: 'RSS',
      extensionPoints: ['source_provider'],
      permissions: ['events:emit']
    });
    const invalid = { ...valid, sdkVersion: '2.0.0' };

    expect(validatePluginManifest(valid).valid).toBe(true);
    expect(validatePluginManifest(invalid).valid).toBe(false);
  });

  it('loads, activates, suspends, and unloads plugins', async () => {
    const eventBus = new InProcessEventBus();
    const host = new PluginHost(eventBus);
    const lifecycle = {
      onLoad: vi.fn(),
      onActivate: vi.fn(),
      onSuspend: vi.fn(),
      onUnload: vi.fn()
    };
    const manifest = createPluginManifest({
      name: 'Lifecycle',
      extensionPoints: ['action'],
      permissions: []
    });

    await host.load(manifest, lifecycle);
    await host.activate(manifest.id);
    await host.suspend(manifest.id);
    await host.unload(manifest.id);

    expect(lifecycle.onLoad).toHaveBeenCalled();
    expect(lifecycle.onActivate).toHaveBeenCalled();
    expect(host.list()).toHaveLength(0);
  });

  it('sample RSS provider emits typed events and fetches source items', async () => {
    const eventBus = new InProcessEventBus();
    const handler = vi.fn();
    eventBus.subscribe('SignalCaptured', handler);
    const host = new PluginHost(eventBus);
    const plugin = createRssDiscoveryPlugin({
      fetchItems: async () => [{ title: 'RSS item', summary: 'A feed item.' }]
    });

    const loaded = await host.load(plugin.manifest, plugin.module);
    await host.activate(loaded.manifest.id);
    const items = await loaded.module.sourceProvider?.fetch({});

    expect(handler).toHaveBeenCalled();
    expect(items?.[0]?.title).toBe('RSS item');
  });
});
