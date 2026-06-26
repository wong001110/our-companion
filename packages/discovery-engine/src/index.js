import { createId, nowIso } from '@our-companion/shared';
const TRACKING_PARAMS = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'ref',
    'ref_src',
    'fbclid',
    'gclid'
]);
function matchScore(tags, values, fallback) {
    if (values.length === 0 || tags.length === 0)
        return fallback;
    const normalizedTags = tags.map((tag) => tag.toLowerCase());
    const matches = values.filter((value) => normalizedTags.includes(value.toLowerCase())).length;
    return Math.min(100, Math.round((matches / Math.max(values.length, 1)) * 100));
}
function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
function normalizedWords(value) {
    return value
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .join(' ');
}
export function normalizeDiscoveryUrl(url) {
    if (!url)
        return undefined;
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        parsed.hostname = parsed.hostname.toLowerCase();
        for (const key of [...parsed.searchParams.keys()]) {
            if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
                parsed.searchParams.delete(key);
            }
        }
        parsed.searchParams.sort();
        parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        if (parsed.hostname === 'github.com') {
            const [, owner, repo] = parsed.pathname.split('/');
            if (owner && repo) {
                parsed.pathname = `/${owner.toLowerCase()}/${repo.toLowerCase()}`;
                parsed.search = '';
            }
        }
        return parsed.toString().replace(/\/$/, '');
    }
    catch {
        return url.trim();
    }
}
export function fingerprintDiscovery(input) {
    const parts = [
        normalizedWords(input.title),
        input.canonicalUrl ?? '',
        ...(input.entities ?? []).map(normalizedWords).sort(),
        ...(input.topics ?? []).map(normalizedWords).sort(),
        input.sourceType ?? ''
    ];
    return `fp_${stableHash(parts.join('|'))}`;
}
export function qualityScoreForSignal(signal) {
    const titleScore = signal.title.trim().length >= 8 ? 35 : 10;
    const summaryScore = (signal.summary ?? signal.rawContent ?? '').trim().length >= 24 ? 35 : 10;
    const urlScore = signal.url ? 15 : 0;
    const specificityScore = /\b(how|why|guide|release|architecture|pattern|research|example)\b/i.test(`${signal.title} ${signal.summary ?? ''}`)
        ? 15
        : 8;
    return Math.min(100, titleScore + summaryScore + urlScore + specificityScore);
}
export function captureSignal(input) {
    return {
        id: createId('signal'),
        sourceType: input.sourceType,
        provider: input.provider,
        title: input.title.trim(),
        summary: input.summary?.trim(),
        url: input.url,
        rawContent: input.rawContent,
        capturedAt: nowIso(),
        metadata: input.metadata
    };
}
export function normalizeSignal(signal) {
    return {
        ...signal,
        canonicalUrl: normalizeDiscoveryUrl(signal.url),
        normalizedTitle: normalizedWords(signal.title),
        qualityScore: qualityScoreForSignal(signal)
    };
}
export function createSignalEngine() {
    return {
        async capture(input) {
            return captureSignal(input);
        },
        async normalize(signal) {
            return normalizeSignal(signal);
        }
    };
}
function sourceTypeFromDiscoverySource(source) {
    if (source === 'github')
        return 'github';
    if (source === 'youtube')
        return 'youtube';
    if (source === 'reddit' || source === 'hackernews')
        return 'community';
    return 'internet';
}
export function signalFromNormalizedDiscovery(discovery) {
    return captureSignal({
        sourceType: sourceTypeFromDiscoverySource(discovery.source),
        provider: discovery.source,
        title: discovery.title,
        summary: discovery.summary,
        url: discovery.url,
        rawContent: JSON.stringify(discovery.raw),
        metadata: {
            externalId: discovery.externalId,
            tags: discovery.tags,
            publishedAt: discovery.publishedAt
        }
    });
}
export function passesDiscoveryQuality(signal, minimumScore = 45) {
    return signal.qualityScore >= minimumScore;
}
export function checkDuplicateDiscovery(candidate, existing) {
    const titleWords = new Set(normalizedWords(candidate.title).split(/\s+/).filter(Boolean));
    for (const item of existing) {
        if (candidate.canonicalUrl && item.canonicalUrl === candidate.canonicalUrl) {
            return { type: 'duplicate', existingDiscoveryId: item.id };
        }
        if (candidate.fingerprint && item.fingerprint === candidate.fingerprint) {
            return { type: 'duplicate', existingDiscoveryId: item.id };
        }
        const overlap = normalizedWords(item.title)
            .split(/\s+/)
            .filter((word) => titleWords.has(word)).length;
        if (overlap >= Math.min(4, titleWords.size)) {
            return { type: 'revival_candidate', existingConceptId: `concept:${stableHash(item.title)}`, reason: 'Similar topic resurfaced with new context.' };
        }
    }
    return { type: 'new' };
}
export function discoveryOriginForSignal(signal) {
    const type = signal.sourceType === 'user' || signal.sourceType === 'system'
        ? 'user'
        : signal.sourceType === 'companion'
            ? 'companion'
            : signal.sourceType === 'community'
                ? 'community'
                : signal.sourceType === 'local_file'
                    ? 'local'
                    : 'internet';
    return {
        type,
        provider: signal.provider,
        displayName: signal.provider ?? signal.sourceType
    };
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
    const signal = signalFromNormalizedDiscovery(item);
    const normalizedSignal = normalizeSignal(signal);
    return {
        ...item,
        ...scores,
        id: createId('disc'),
        signalId: signal.id,
        origin: discoveryOriginForSignal(signal),
        status: 'candidate',
        canonicalUrl: normalizedSignal.canonicalUrl,
        fingerprint: fingerprintDiscovery({
            title: item.title,
            canonicalUrl: normalizedSignal.canonicalUrl,
            topics: item.tags,
            sourceType: item.source
        }),
        growthValue: scores.finalScore,
        confidenceScore: Math.min(100, Math.round((normalizedSignal.qualityScore + scores.finalScore) / 2)),
        createdAt: nowIso()
    };
}
export function discoveryFromSignal(signal, scores) {
    if (!passesDiscoveryQuality(signal))
        return undefined;
    const source = signal.provider === 'github' || signal.provider === 'reddit' || signal.provider === 'hackernews' || signal.provider === 'youtube'
        ? signal.provider
        : 'hackernews';
    return {
        source,
        externalId: signal.id,
        title: signal.title,
        summary: signal.summary ?? signal.rawContent ?? signal.title,
        url: signal.url,
        tags: Array.isArray(signal.metadata?.tags) ? signal.metadata.tags.map(String) : [signal.sourceType],
        publishedAt: signal.metadata?.publishedAt ? String(signal.metadata.publishedAt) : undefined,
        raw: signal.metadata ?? signal,
        ...scores,
        id: createId('disc'),
        signalId: signal.id,
        origin: discoveryOriginForSignal(signal),
        status: 'candidate',
        canonicalUrl: signal.canonicalUrl,
        fingerprint: fingerprintDiscovery({
            title: signal.title,
            canonicalUrl: signal.canonicalUrl,
            topics: Array.isArray(signal.metadata?.tags) ? signal.metadata.tags.map(String) : [signal.sourceType],
            sourceType: signal.sourceType
        }),
        growthValue: scores.finalScore,
        confidenceScore: Math.min(100, Math.round((signal.qualityScore + scores.finalScore) / 2)),
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
function sourceTypeFor(source) {
    const map = {
        github: 'github',
        hackernews: 'community_discussion',
        reddit: 'community_discussion',
        youtube: 'video'
    };
    return map[source];
}
function agentForSource(source, preferred) {
    if (source === 'github')
        return preferred.includes('builder') ? 'builder' : preferred[0] ?? 'scout';
    if (source === 'hackernews')
        return preferred.includes('trend') ? 'trend' : preferred[0] ?? 'scout';
    if (source === 'reddit')
        return preferred.includes('contrarian') ? 'contrarian' : preferred[0] ?? 'scout';
    if (source === 'youtube')
        return preferred.includes('research') ? 'research' : preferred[0] ?? 'scout';
    return preferred[0] ?? 'scout';
}
export function planExploration(curiosityTarget) {
    const objectiveByType = {
        similar: 'find_new_examples',
        adjacent: 'find_new_examples',
        opposite: 'challenge_assumption',
        deepening: 'find_related_research',
        challenge: 'challenge_assumption',
        practical: 'find_practical_references'
    };
    const agentsByType = {
        similar: ['scout', 'memory_scout'],
        adjacent: ['scout', 'trend', 'memory_scout'],
        opposite: ['contrarian', 'research'],
        deepening: ['research', 'memory_scout'],
        challenge: ['contrarian', 'research'],
        practical: ['builder', 'scout']
    };
    const queryTopic = curiosityTarget.topic.trim();
    return {
        id: createId('plan'),
        curiosityTargetId: curiosityTarget.id,
        objective: objectiveByType[curiosityTarget.explorationType],
        agents: agentsByType[curiosityTarget.explorationType],
        searchQueries: [
            queryTopic,
            `${queryTopic} examples`,
            `${queryTopic} ${curiosityTarget.explorationType === 'practical' ? 'implementation' : 'patterns'}`
        ],
        constraints: ['Prefer specific evidence over generic summaries.', 'Do not produce user-facing narration.'],
        maxCandidatesPerAgent: 3,
        createdAt: nowIso()
    };
}
export function scoreCandidate(candidate) {
    return (candidate.relevanceScore * 0.35 +
        candidate.noveltyScore * 0.2 +
        candidate.evidenceScore * 0.2 +
        candidate.usefulnessScore * 0.15 +
        0.1);
}
export function deduplicateCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
        const key = (candidate.sourceUrl || `${candidate.sourceName ?? candidate.sourceType}:${candidate.title}`).toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
export async function runDiscoveryAgents(input) {
    const connectors = input.connectors ??
        ['github', 'hackernews', 'reddit', 'youtube'].map(createFallbackConnector);
    const preferredAgents = input.explorationPlan.agents;
    const searchQuery = input.explorationPlan.searchQueries[0];
    const external = await Promise.all(connectors.map(async (connector) => {
        const raw = await connector.fetch({ query: searchQuery, limit: input.explorationPlan.maxCandidatesPerAgent });
        return raw.slice(0, input.explorationPlan.maxCandidatesPerAgent).map((item) => {
            const normalized = connector.normalize(item);
            const agentType = agentForSource(connector.source, preferredAgents);
            const tags = normalized.tags.map((tag) => tag.toLowerCase());
            const topicWords = input.curiosityTarget.topic.toLowerCase().split(/\s+/);
            const relevanceScore = topicWords.some((word) => tags.includes(word)) ? 0.82 : 0.62;
            return {
                id: createId('candidate'),
                userId: input.userId,
                companionId: input.companionId,
                title: normalized.title,
                summary: normalized.summary ?? `A ${connector.source} signal related to ${input.curiosityTarget.topic}.`,
                sourceType: sourceTypeFor(connector.source),
                sourceUrl: normalized.url,
                sourceName: connector.source,
                agentType,
                relatedCuriosityTargetId: input.curiosityTarget.id,
                relevanceScore,
                noveltyScore: normalized.url ? 0.72 : 0.48,
                evidenceScore: normalized.summary || normalized.url ? 0.68 : 0.42,
                usefulnessScore: normalized.tags.length > 0 ? 0.66 : 0.45,
                fingerprint: fingerprintDiscovery({
                    title: normalized.title,
                    canonicalUrl: normalizeDiscoveryUrl(normalized.url),
                    topics: normalized.tags,
                    sourceType: normalized.source
                }),
                rawEvidence: JSON.stringify(normalized.raw),
                collectedAt: nowIso()
            };
        });
    }));
    const memoryCandidates = preferredAgents.includes('memory_scout')
        ? (input.memoryCandidates ?? []).slice(0, input.explorationPlan.maxCandidatesPerAgent).map((item) => ({
            id: createId('candidate'),
            userId: input.userId,
            companionId: input.companionId,
            title: item.title,
            summary: item.summary ?? `Ann found this in memory while exploring ${input.curiosityTarget.topic}.`,
            sourceType: 'internal_memory',
            sourceUrl: item.url,
            sourceName: 'memory',
            agentType: 'memory_scout',
            relatedCuriosityTargetId: input.curiosityTarget.id,
            relevanceScore: 0.78,
            noveltyScore: 0.45,
            evidenceScore: 0.7,
            usefulnessScore: 0.72,
            fingerprint: fingerprintDiscovery({
                title: item.title,
                canonicalUrl: normalizeDiscoveryUrl(item.url),
                topics: item.tags,
                sourceType: 'internal_memory'
            }),
            rawEvidence: JSON.stringify(item),
            collectedAt: nowIso()
        }))
        : [];
    return deduplicateCandidates([...external.flat(), ...memoryCandidates]).sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
}
