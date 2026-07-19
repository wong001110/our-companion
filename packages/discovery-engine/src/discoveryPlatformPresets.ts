export const DISCOVERY_PLATFORM_BOOTSTRAP_VERSION = 1;

export type DiscoveryPlatformId =
  | 'generic-web'
  | 'reddit'
  | 'youtube'
  | 'github'
  | 'bilibili';

export type ManagedDiscoveryPlatformId = Exclude<DiscoveryPlatformId, 'generic-web'>;

export interface DiscoveryPlatformPreset {
  id: DiscoveryPlatformId;
  label: string;
  queryTemplate: string;
}

export const DEFAULT_DISCOVERY_PLATFORM_PRESETS = [
  {
    id: 'generic-web',
    label: 'Open Web',
    queryTemplate: '{{topics}}',
  },
  {
    id: 'reddit',
    label: 'Reddit',
    queryTemplate: 'site:reddit.com {{topics}}',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    queryTemplate: 'site:youtube.com {{topics}}',
  },
  {
    id: 'github',
    label: 'GitHub',
    queryTemplate: 'site:github.com {{topics}}',
  },
  {
    id: 'bilibili',
    label: 'Bilibili',
    queryTemplate: 'site:bilibili.com {{topics}}',
  },
] as const satisfies readonly DiscoveryPlatformPreset[];

export const MANAGED_DISCOVERY_PLATFORM_PRESETS = DEFAULT_DISCOVERY_PLATFORM_PRESETS.filter(
  (preset): preset is typeof DEFAULT_DISCOVERY_PLATFORM_PRESETS[number] & { id: ManagedDiscoveryPlatformId } =>
    preset.id !== 'generic-web',
);

export const MANAGED_DISCOVERY_PLATFORM_IDS = MANAGED_DISCOVERY_PLATFORM_PRESETS.map((preset) => preset.id);

export function getDiscoveryPlatformPreset(platformId: DiscoveryPlatformId): DiscoveryPlatformPreset {
  const preset = DEFAULT_DISCOVERY_PLATFORM_PRESETS.find((entry) => entry.id === platformId);
  if (!preset) throw new Error(`Unknown discovery platform: ${platformId}`);
  return preset;
}

export function renderDiscoveryPlatformQuery(template: string, topics: string): string {
  const rendered = template.replaceAll('{{topics}}', topics).trim().replace(/\s+/g, ' ');
  return rendered.slice(0, 500);
}
