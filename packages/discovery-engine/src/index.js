import { createId, nowIso } from '@our-companion/shared';
function matchScore(tags, values, fallback) {
    if (values.length === 0 || tags.length === 0)
        return fallback;
    const normalizedTags = tags.map((tag) => tag.toLowerCase());
    const matches = values.filter((value) => normalizedTags.includes(value.toLowerCase())).length;
    return Math.min(100, Math.round((matches / Math.max(values.length, 1)) * 100));
}
export function scoreDiscovery(item, context) {
    const userInterestScore = matchScore(item.tags, context.userInterests, 45);
    const userHistoryScore = matchScore(item.tags, context.recentMemoryTags, 35);
    const characterExpertiseScore = matchScore(item.tags, context.activeCharacter.expertise, 55);
    const noveltyScore = item.url && context.seenUrls?.has(item.url) ? 10 : 70;
    const usefulnessScore = item.summary || item.url ? 65 : 35;
    const finalScore = Math.round(0.35 * userInterestScore +
        0.25 * userHistoryScore +
        0.2 * characterExpertiseScore +
        0.1 * noveltyScore +
        0.1 * usefulnessScore);
    return {
        userInterestScore,
        userHistoryScore,
        characterExpertiseScore,
        noveltyScore,
        usefulnessScore,
        finalScore
    };
}
export function deduplicateDiscoveries(items) {
    const seen = new Set();
    return items.filter((item) => {
        const key = item.url || `${item.source}:${item.externalId || item.title}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
export function toDiscovery(item, scores) {
    return {
        ...item,
        ...scores,
        id: createId('disc'),
        status: 'candidate',
        createdAt: nowIso()
    };
}
export function applyDailyCap(discoveries, alreadySharedToday, cap = 10) {
    const remaining = Math.max(0, cap - alreadySharedToday);
    return discoveries
        .sort((left, right) => right.finalScore - left.finalScore)
        .slice(0, remaining)
        .map((discovery) => ({
        ...discovery,
        status: 'shared',
        sharedAt: nowIso()
    }));
}
function fallbackItems(source) {
    const common = {
        source,
        publishedAt: nowIso()
    };
    const bySource = {
        github: {
            ...common,
            id: 'github-pixijs-desktop-pet',
            title: 'Building expressive desktop companions with PixiJS',
            summary: 'A small renderer pattern for animated companion characters.',
            url: 'https://github.com/pixijs/pixijs',
            tags: ['frontend', 'pixijs', 'web', 'ux']
        },
        hackernews: {
            ...common,
            id: 'hn-local-first-memory',
            title: 'Local-first app patterns for personal memory tools',
            summary: 'Discussion about SQLite-backed personal software.',
            url: 'https://news.ycombinator.com/',
            tags: ['sqlite', 'local-first', 'memory']
        },
        reddit: {
            ...common,
            id: 'reddit-cozy-dev-room',
            title: 'Cozy developer room inspiration boards',
            summary: 'Workspace ideas with warm lighting and note-taking systems.',
            url: 'https://www.reddit.com/r/battlestations/',
            tags: ['ux', 'workspace', 'cozy']
        },
        youtube: {
            ...common,
            id: 'youtube-pixijs-tutorial',
            title: 'PixiJS animation basics for character sprites',
            summary: 'A tutorial-style resource for sprite animation loops.',
            url: 'https://www.youtube.com/results?search_query=PixiJS+sprite+animation',
            tags: ['pixijs', 'frontend', 'animation']
        }
    };
    return [bySource[source]];
}
export function createFallbackConnector(source) {
    return {
        source,
        async fetch() {
            return fallbackItems(source);
        },
        normalize(item) {
            return {
                source,
                externalId: String(item.id ?? item.title),
                title: String(item.title),
                summary: item.summary ? String(item.summary) : undefined,
                url: item.url ? String(item.url) : undefined,
                tags: Array.isArray(item.tags) ? item.tags.map(String) : [source],
                publishedAt: item.publishedAt ? String(item.publishedAt) : undefined,
                raw: item
            };
        }
    };
}
export async function runDiscoveryPipeline(connectors, context, alreadySharedToday) {
    const rawByConnector = await Promise.all(connectors.map(async (connector) => {
        const raw = await connector.fetch({ limit: 10 });
        return raw.map((item) => connector.normalize(item));
    }));
    const normalized = deduplicateDiscoveries(rawByConnector.flat());
    const ranked = normalized.map((item) => toDiscovery(item, scoreDiscovery(item, context)));
    return applyDailyCap(ranked, alreadySharedToday);
}
