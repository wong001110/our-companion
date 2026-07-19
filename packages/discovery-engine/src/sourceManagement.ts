import {
  normalizeActionUrl,
  type AddDiscoveryBaseInput,
  type UserDiscoverySourceType,
} from '@our-companion/shared';

const TRACKING_PARAMETERS = new Set(['ref', 'ref_src', 'fbclid', 'gclid']);

export type { AddDiscoveryBaseInput, UserDiscoverySourceType } from '@our-companion/shared';

export interface NormalizedDiscoveryBaseInput {
  connectorId: 'generic-web' | 'rss';
  scope: UserDiscoverySourceType;
  locator: string;
  label?: string;
  initialState: 'trial' | 'active';
}

export class DiscoverySourceValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DiscoverySourceValidationError';
  }
}

function normalizeLabel(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const label = value.trim().replace(/\s+/g, ' ');
  if (!label) return undefined;
  if (label.length > 120) throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_LABEL_TOO_LONG');
  return label;
}

function parsePublicUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_URL_INVALID');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_URL_PROTOCOL_INVALID');
  }
  if (parsed.username || parsed.password) {
    throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_URL_CREDENTIALS_FORBIDDEN');
  }
  parsed.hash = '';
  const publicUrl = normalizeActionUrl(parsed.toString());
  if (!publicUrl) throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_URL_NOT_PUBLIC');
  return new URL(publicUrl);
}

function normalizePageOrFeed(value: string): string {
  const parsed = parsePublicUrl(value);
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_DOMAIN_REQUIRED');
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_DOMAIN_INVALID');
  }
  const root = parsePublicUrl(`https://${parsed.hostname.toLowerCase()}`);
  return root.hostname;
}

export function normalizeDiscoveryBaseInput(input: AddDiscoveryBaseInput): NormalizedDiscoveryBaseInput {
  const label = normalizeLabel(input.label);
  const initialState = input.initialState ?? 'trial';
  if (initialState !== 'trial' && initialState !== 'active') {
    throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_INITIAL_STATE_INVALID');
  }

  if (input.sourceType === 'query') {
    const locator = input.locator.trim().replace(/\s+/g, ' ');
    if (locator.length < 3 || locator.length > 500) {
      throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_QUERY_LENGTH_INVALID');
    }
    return { connectorId: 'generic-web', scope: 'query', locator, label, initialState };
  }

  if (input.sourceType === 'domain') {
    return {
      connectorId: 'generic-web',
      scope: 'domain',
      locator: normalizeDomain(input.locator),
      label,
      initialState,
    };
  }

  if (input.sourceType === 'page') {
    return {
      connectorId: 'generic-web',
      scope: 'page',
      locator: normalizePageOrFeed(input.locator),
      label,
      initialState,
    };
  }

  if (input.sourceType === 'feed') {
    return {
      connectorId: 'rss',
      scope: 'feed',
      locator: normalizePageOrFeed(input.locator),
      label,
      initialState,
    };
  }

  throw new DiscoverySourceValidationError('DISCOVERY_SOURCE_TYPE_INVALID');
}
