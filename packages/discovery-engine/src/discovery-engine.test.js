import { describe, expect, it } from 'vitest';
import { applyDailyCap, checkDuplicateDiscovery, deduplicateDiscoveries, discoveryFromSignal, fingerprintDiscovery, normalizeDiscoveryUrl, normalizeSignal, passesDiscoveryQuality, planExploration, runDiscoveryAgents, scoreDiscovery, captureSignal, createPoolItem, addToPool, getShareCandidates, evaluateShareCandidate, determineInterruptionLevel, shouldShareNow, DiscoveryEngine, } from './index';
describe('discovery engine', () => {
    it('scores with user interest, history, character expertise, novelty, and usefulness', () => {
        const score = scoreDiscovery({
            source: 'github',
            title: 'PixiJS desktop companion',
            tags: ['pixijs', 'frontend', 'ux'],
            summary: 'Animation notes',
            url: 'https://example.com',
            raw: {}
        }, {
            userInterests: ['frontend'],
            recentMemoryTags: ['pixijs'],
            activeCharacter: { expertise: ['ux'] },
            seenUrls: new Set()
        });
        expect(score.finalScore).toBeGreaterThan(50);
    });
    it('deduplicates by URL', () => {
        const items = deduplicateDiscoveries([
            { source: 'github', title: 'A', url: 'https://same.test', tags: [], raw: {} },
            { source: 'reddit', title: 'B', url: 'https://same.test', tags: [], raw: {} }
        ]);
        expect(items).toHaveLength(1);
    });
    it('normalizes tracking URLs and canonical GitHub repo URLs', () => {
        expect(normalizeDiscoveryUrl('https://GitHub.com/OpenAI/Codex/?utm_source=x&ref=abc')).toBe('https://github.com/openai/codex');
    });
    it('creates deterministic fingerprints and duplicate results', () => {
        const fingerprint = fingerprintDiscovery({
            title: 'SQLite local-first memory',
            canonicalUrl: 'https://example.test/sqlite',
            topics: ['sqlite', 'memory'],
            sourceType: 'github'
        });
        const duplicate = checkDuplicateDiscovery({ id: 'candidate', title: 'SQLite local-first memory', canonicalUrl: 'https://example.test/sqlite', fingerprint }, [{ id: 'existing', title: 'SQLite local-first memory', canonicalUrl: 'https://example.test/sqlite', fingerprint }]);
        expect(fingerprint).toMatch(/^fp_/);
        expect(duplicate).toEqual({ type: 'duplicate', existingDiscoveryId: 'existing' });
    });
    it('filters low-quality signals and creates discovery from useful signals', () => {
        const lowQuality = normalizeSignal(captureSignal({ sourceType: 'internet', title: 'Hi' }));
        const useful = normalizeSignal(captureSignal({
            sourceType: 'github',
            provider: 'github',
            title: 'Local-first memory architecture guide',
            summary: 'A detailed implementation guide for SQLite-backed companion memory.',
            url: 'https://github.com/example/memory?utm_campaign=test',
            metadata: { tags: ['sqlite', 'memory'] }
        }));
        const discovery = discoveryFromSignal(useful, {
            userInterestScore: 80,
            userHistoryScore: 70,
            characterExpertiseScore: 60,
            noveltyScore: 75,
            usefulnessScore: 85,
            finalScore: 76
        });
        expect(passesDiscoveryQuality(lowQuality)).toBe(false);
        expect(discovery?.fingerprint).toMatch(/^fp_/);
        expect(discovery?.canonicalUrl).toBe('https://github.com/example/memory');
    });
    it('applies the global daily cap', () => {
        const capped = applyDailyCap(Array.from({ length: 12 }, (_, index) => ({
            id: `d${index}`,
            source: 'github',
            title: `Discovery ${index}`,
            tags: [],
            raw: {},
            userInterestScore: 0,
            userHistoryScore: 0,
            characterExpertiseScore: 0,
            noveltyScore: 0,
            usefulnessScore: 0,
            finalScore: index,
            status: 'candidate',
            createdAt: 'now'
        })), 2);
        expect(capped).toHaveLength(8);
        expect(capped.every((item) => item.status === 'shared')).toBe(true);
    });
    it('plans and runs discovery agents for a curiosity target', async () => {
        const target = {
            id: 'curiosity_test',
            userId: 'default',
            companionId: 'ann',
            topic: 'Desktop companion',
            description: 'Explore desktop companion examples.',
            source: 'memory_trigger',
            explorationType: 'practical',
            priority: 0.8,
            confidence: 0.7,
            reason: 'Current project memory.',
            expectedValue: 'Find implementation references.',
            createdAt: 'now'
        };
        const plan = planExploration(target);
        const candidates = await runDiscoveryAgents({
            userId: 'default',
            companionId: 'ann',
            curiosityTarget: target,
            explorationPlan: plan
        });
        expect(plan.agents).toContain('builder');
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates[0]?.relatedCuriosityTargetId).toBe(target.id);
    });
});
describe('discovery pool', () => {
    const mockResult = {
        id: 'result_1',
        jobId: 'job_1',
        summary: 'Found PixiJS tutorials',
        detailedFindings: 'Multiple tutorials found',
        evidence: [],
        confidence: 0.8,
        novelty: 0.7,
        suggestedMemoryUpdates: ['mem_1'],
        suggestedInsights: ['insight_1'],
        suggestedFollowUps: [],
        createdAt: new Date().toISOString(),
    };
    it('creates pool item from result', () => {
        const item = createPoolItem(mockResult);
        expect(item.sourceDiscoveryId).toBe('job_1');
        expect(item.status).toBe('pooled');
        expect(item.noveltyScore).toBe(0.7);
    });
    it('adds item to pool', () => {
        const item = createPoolItem(mockResult);
        const pool = addToPool([], item);
        expect(pool).toHaveLength(1);
    });
    it('prevents duplicate pool items', () => {
        const item = createPoolItem(mockResult);
        let pool = addToPool([], item);
        pool = addToPool(pool, item);
        expect(pool).toHaveLength(1);
    });
    it('gets share candidates', () => {
        const item = createPoolItem(mockResult);
        const pool = addToPool([], item);
        const candidates = getShareCandidates(pool);
        expect(candidates).toHaveLength(1);
    });
});
describe('share timing', () => {
    const mockAttention = {
        userActive: true,
        appFocused: true,
        recentInteraction: true,
        doNotDisturb: false,
        estimatedInterruptCost: 0.2,
    };
    it('evaluates share candidate', () => {
        const item = {
            id: 'item_1',
            sourceDiscoveryId: 'disc_1',
            title: 'PixiJS Tutorial',
            summary: 'Found PixiJS tutorial',
            evidence: [],
            tags: [],
            relatedTopics: [],
            relatedMemories: [],
            relatedInsights: [],
            noveltyScore: 0.8,
            relevanceScore: 0.7,
            confidenceScore: 0.75,
            sharePriority: 0.7,
            status: 'pooled',
            createdAt: new Date().toISOString(),
            returnedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
        };
        const candidate = evaluateShareCandidate(item, mockAttention, 0);
        expect(candidate.poolItemId).toBe('item_1');
        expect(candidate.suggestedTone).toBe('excited');
    });
    it('determines interruption level', () => {
        const candidate = {
            id: 'candidate_1',
            poolItemId: 'item_1',
            reason: 'High novelty',
            priority: 0.8,
            urgency: 0.7,
            expectedUserValue: 0.8,
            interruptionCost: 0.3,
            confidence: 0.75,
            suggestedTone: 'excited',
            suggestedTiming: 'now',
        };
        const level = determineInterruptionLevel(candidate, mockAttention);
        expect(level).toBe('soft_prompt');
    });
    it('blocks share when do not disturb', () => {
        const dndAttention = {
            ...mockAttention,
            doNotDisturb: true,
        };
        const candidate = {
            id: 'candidate_1',
            poolItemId: 'item_1',
            reason: 'High novelty',
            priority: 0.8,
            urgency: 0.7,
            expectedUserValue: 0.8,
            interruptionCost: 0.3,
            confidence: 0.75,
            suggestedTone: 'excited',
            suggestedTiming: 'now',
        };
        expect(shouldShareNow(candidate, dndAttention)).toBe(false);
    });
});
describe('discovery engine v2', () => {
    it('creates and completes discovery job', () => {
        const engine = new DiscoveryEngine();
        const job = engine.createDiscoveryJob('curiosity_1', 0.8, ['PixiJS']);
        expect(job.status).toBe('pending');
        expect(job.sourceCuriosityId).toBe('curiosity_1');
        const completed = engine.completeDiscovery(job.id);
        expect(completed).toBeTruthy();
        expect(completed?.summary).toBeTruthy();
    });
    it('cancels discovery job', () => {
        const engine = new DiscoveryEngine();
        const job = engine.createDiscoveryJob('curiosity_1', 0.8);
        engine.cancelDiscovery(job.id);
        const queue = engine.getDiscoveryQueue();
        expect(queue.find((j) => j.id === job.id)?.status).toBe('cancelled');
    });
    it('retries failed job', () => {
        const engine = new DiscoveryEngine();
        const job = engine.createDiscoveryJob('curiosity_1', 0.8);
        engine.cancelDiscovery(job.id);
        const retried = engine.retryDiscovery(job.id);
        expect(retried?.status).toBe('pending');
        expect(retried?.retryCount).toBe(1);
    });
});
