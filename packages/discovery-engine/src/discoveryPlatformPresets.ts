export const DISCOVERY_PLATFORM_BOOTSTRAP_VERSION = 2;

export type DiscoveryPlatformId =
  | 'generic-web'
  | 'reddit'
  | 'youtube'
  | 'github'
  | 'bilibili';

export type DiscoveryPlatformContentKind = 'web' | 'discussion' | 'video' | 'code';

export interface DiscoveryPlatformPreset {
  id: DiscoveryPlatformId;
  label: string;
  allowedDomains: string[];
  contentKinds: DiscoveryPlatformContentKind[];
  languageHints?: string[];
}

export const DEFAULT_DISCOVERY_PLATFORM_PRESETS = [
  {
    id: 'generic-web',
    label: 'Open Web',
    allowedDomains: [],
    contentKinds: ['web'],
  },
  {
    id: 'reddit',
    label: 'Reddit',
    allowedDomains: ['reddit.com'],
    contentKinds: ['discussion'],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    allowedDomains: ['youtube.com', 'youtu.be'],
    contentKinds: ['video'],
  },
  {
    id: 'github',
    label: 'GitHub',
    allowedDomains: ['github.com'],
    contentKinds: ['code'],
  },
  {
    id: 'bilibili',
    label: 'Bilibili',
    allowedDomains: ['bilibili.com'],
    contentKinds: ['video'],
    languageHints: ['zh-CN'],
  },
] as const satisfies readonly DiscoveryPlatformPreset[];

export const DISCOVERY_PLATFORM_IDS = DEFAULT_DISCOVERY_PLATFORM_PRESETS.map((preset) => preset.id);

/** @deprecated Use DISCOVERY_PLATFORM_IDS — kept for migration helpers. */
export type ManagedDiscoveryPlatformId = Exclude<DiscoveryPlatformId, 'generic-web'>;

/** @deprecated Prefer DEFAULT_DISCOVERY_PLATFORM_PRESETS. */
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

export function isDiscoveryPlatformId(value: string): value is DiscoveryPlatformId {
  return DISCOVERY_PLATFORM_IDS.includes(value as DiscoveryPlatformId);
}

/**
 * Apply deterministic domain fencing to a semantic query.
 * The AI supplies only the semantic query; domains are owned by application code.
 */
export function fenceDiscoveryPlatformQuery(platformId: DiscoveryPlatformId, semanticQuery: string): string {
  const query = semanticQuery.trim().replace(/\s+/g, ' ').slice(0, 420);
  if (!query) return '';
  const preset = getDiscoveryPlatformPreset(platformId);
  if (preset.allowedDomains.length === 0) return query.slice(0, 500);
  if (preset.allowedDomains.length === 1) {
    return `site:${preset.allowedDomains[0]} ${query}`.slice(0, 500);
  }
  const siteClause = preset.allowedDomains.map((domain) => `site:${domain}`).join(' OR ');
  return `(${siteClause}) ${query}`.slice(0, 500);
}
