export type DiscoveryContextCategory =
  | 'pinned_or_saved'
  | 'recent_unsaved'
  | 'recent_presented'
  | 'feedback_or_ignored';

export interface DiscoveryContextSourceItem {
  id: string;
  category: DiscoveryContextCategory;
  summary: string;
  occurredAt: string;
  priority?: number;
  topics?: readonly string[];
}

export interface DiscoveryContextItem extends DiscoveryContextSourceItem {
  summary: string;
}

export interface BoundedDiscoveryContext {
  items: readonly DiscoveryContextItem[];
  count: number;
  countsByCategory: Readonly<Record<DiscoveryContextCategory, number>>;
}

const CATEGORIES: readonly DiscoveryContextCategory[] = [
  'pinned_or_saved',
  'recent_unsaved',
  'recent_presented',
  'feedback_or_ignored'
];

function newestFirst(left: DiscoveryContextSourceItem, right: DiscoveryContextSourceItem): number {
  return (right.priority ?? 0) - (left.priority ?? 0)
    || Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
    || left.id.localeCompare(right.id);
}

export function buildBoundedDiscoveryContext(input: {
  items: readonly DiscoveryContextSourceItem[];
  maximumItems?: number;
  maximumSummaryCharacters?: number;
}): BoundedDiscoveryContext {
  const maximumItems = Math.min(40, Math.max(1, Math.floor(input.maximumItems ?? 40)));
  const maximumSummaryCharacters = Math.max(80, Math.floor(input.maximumSummaryCharacters ?? 500));
  const quota = Math.max(1, Math.floor(maximumItems / CATEGORIES.length));
  const byCategory = new Map(CATEGORIES.map((category) => [
    category,
    input.items.filter((item) => item.category === category).sort(newestFirst)
  ]));
  const selected: DiscoveryContextSourceItem[] = [];
  const selectedIds = new Set<string>();

  for (const category of CATEGORIES) {
    for (const item of (byCategory.get(category) ?? []).slice(0, quota)) {
      if (!selectedIds.has(item.id)) {
        selected.push(item);
        selectedIds.add(item.id);
      }
    }
  }

  if (selected.length < maximumItems) {
    const remainder = input.items
      .filter((item) => !selectedIds.has(item.id))
      .sort(newestFirst)
      .slice(0, maximumItems - selected.length);
    selected.push(...remainder);
  }

  const items = selected.slice(0, maximumItems).map((item) => ({
    ...item,
    summary: item.summary.trim().slice(0, maximumSummaryCharacters)
  }));
  const countsByCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, items.filter((item) => item.category === category).length])
  ) as Record<DiscoveryContextCategory, number>;
  return { items, count: items.length, countsByCategory };
}
