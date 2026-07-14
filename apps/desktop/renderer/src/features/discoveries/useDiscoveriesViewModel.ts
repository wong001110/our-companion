import { useMemo, useState } from 'react';
import type { Discovery } from '@our-companion/shared';
import { t, type Lang } from '../../i18n';

export type DiscoveryFilter = 'all' | 'ai' | 'design' | 'life' | 'other';

/** Owns local filtering and recoverable Discovery mutations outside the page view. */
export function useDiscoveriesViewModel({ discoveries, lang, onRefresh }: { discoveries: Discovery[]; lang: Lang; onRefresh: () => Promise<void> }) {
  const [selectedFilter, setSelectedFilter] = useState<DiscoveryFilter>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const filters = useMemo(() => [
    { key: 'all' as const, label: t(lang, 'discovery_filter_all') },
    { key: 'ai' as const, label: t(lang, 'discovery_filter_ai') },
    { key: 'design' as const, label: t(lang, 'discovery_filter_design') },
    { key: 'life' as const, label: t(lang, 'discovery_filter_life') },
    { key: 'other' as const, label: t(lang, 'discovery_filter_other') },
  ], [lang]);
  const visibleDiscoveries = useMemo(() => selectedFilter === 'all'
    ? discoveries
    : discoveries.filter((discovery) => discovery.tags.some((tag) => tag.toLowerCase().includes(selectedFilter)) || discovery.source.toLowerCase().includes(selectedFilter)), [discoveries, selectedFilter]);

  const action = async <T,>(operation: () => Promise<T>) => {
    setBusy(true);
    setError(undefined);
    try {
      await operation();
      await onRefresh();
    } catch {
      setError(t(lang, 'discovery_action_failed'));
    } finally {
      setBusy(false);
    }
  };

  return {
    addToJourney: (discoveryId: string) => action(() => window.ourCompanion.discovery.addToJourney({ discoveryId })),
    busy,
    error,
    filters,
    markNotInterested: (discoveryId: string) => action(() => window.ourCompanion.discovery.markNotInterested(discoveryId)),
    refreshDiscovery: () => action(() => window.ourCompanion.discovery.refresh()),
    selectedFilter,
    setSelectedFilter,
    visibleDiscoveries,
  };
}
