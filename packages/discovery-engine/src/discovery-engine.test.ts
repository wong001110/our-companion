import { describe, expect, it } from 'vitest';
import {
  selectEligibleDiscoveries,
  checkDuplicateDiscovery,
  deduplicateDiscoveries,
  discoveryFromSignal,
  fingerprintDiscovery,
  normalizeDiscoveryUrl,
  normalizeSignal,
  passesDiscoveryQuality,
  createDeterministicResearchPlan,
  createResearchIntent,
  decideResearchContinuation,
  evaluateEvidenceCoverage,
  routeResearchSources,
  selectResearchPages,
  validateAiResearchPlan,
  scoreDiscovery,
  captureSignal,
} from './index';
import type { ResearchCapability } from './index';

describe('discovery engine', () => {
  it('scores with user interest, history, character expertise, novelty, and usefulness', () => {
    const score = scoreDiscovery(
      {
        source: 'github',
        title: 'PixiJS desktop companion',
        tags: ['pixijs', 'frontend', 'ux'],
        summary: 'Animation notes',
        url: 'https://example.com',
        raw: {}
      },
      {
        userInterests: ['frontend'],
        recentMemoryTags: ['pixijs'],
        activeCharacter: { expertise: ['ux'] },
        seenUrls: new Set()
      }
    );

    expect(score.finalScore).toBeGreaterThan(0.5);
  });

  it('deduplicates by URL', () => {
    const items = deduplicateDiscoveries([
      { source: 'github', title: 'A', url: 'https://same.test', tags: [], raw: {} },
      { source: 'reddit', title: 'B', url: 'https://same.test', tags: [], raw: {} }
    ]);

    expect(items).toHaveLength(1);
  });

  it('normalizes tracking URLs and canonical GitHub repo URLs', () => {
    expect(normalizeDiscoveryUrl('https://GitHub.com/OpenAI/Codex/?utm_source=x&ref=abc')).toBe(
      'https://github.com/openai/codex'
    );
  });

  it('creates deterministic fingerprints and duplicate results', () => {
    const fingerprint = fingerprintDiscovery({
      title: 'SQLite local-first memory',
      canonicalUrl: 'https://example.test/sqlite',
      topics: ['sqlite', 'memory'],
      sourceType: 'github'
    });
    const duplicate = checkDuplicateDiscovery(
      { id: 'candidate', title: 'SQLite local-first memory', canonicalUrl: 'https://example.test/sqlite', fingerprint },
      [{ id: 'existing', title: 'SQLite local-first memory', canonicalUrl: 'https://example.test/sqlite', fingerprint }]
    );

    expect(fingerprint).toMatch(/^fp_/);
    expect(duplicate).toEqual({ type: 'duplicate', existingDiscoveryId: 'existing' });
  });

  it('filters low-quality signals and creates discovery from useful signals', () => {
    const lowQuality = normalizeSignal(captureSignal({ sourceType: 'internet', title: 'Hi' }));
    const useful = normalizeSignal(
      captureSignal({
        sourceType: 'github',
        provider: 'github',
        title: 'Local-first memory architecture guide',
        summary: 'A detailed implementation guide for SQLite-backed companion memory.',
        url: 'https://github.com/example/memory?utm_campaign=test',
        metadata: { tags: ['sqlite', 'memory'] }
      })
    );
    const discovery = discoveryFromSignal(useful, {
      userInterestScore: 0.8,
      userHistoryScore: 0.7,
      characterExpertiseScore: 0.6,
      noveltyScore: 0.75,
      usefulnessScore: 0.85,
      finalScore: 0.76
    });

    expect(passesDiscoveryQuality(lowQuality)).toBe(false);
    expect(discovery?.fingerprint).toMatch(/^fp_/);
    expect(discovery?.canonicalUrl).toBe('https://github.com/example/memory');
  });

  it('applies the global daily cap', () => {
    const capped = selectEligibleDiscoveries(
      Array.from({ length: 12 }, (_, index) => ({
        id: `d${index}`,
        source: 'github' as const,
        title: `Discovery ${index}`,
        tags: [],
        raw: {},
        userInterestScore: 0,
        userHistoryScore: 0,
        characterExpertiseScore: 0,
        noveltyScore: 0,
        usefulnessScore: 0,
        finalScore: index / 12,
        status: 'candidate' as const,
        createdAt: 'now'
      })),
      2
    );

    expect(capped).toHaveLength(8);
    expect(capped.every((item) => item.status === 'eligible')).toBe(true);
  });

  it('creates a practical research intent and routes only available capabilities', () => {
    const target = {
      id: 'curiosity_test',
      userId: 'default',
      companionId: 'ann',
      topic: 'Desktop companion',
      description: 'Explore desktop companion examples.',
      source: 'memory_trigger' as const,
      explorationType: 'practical' as const,
      priority: 0.8,
      confidence: 0.7,
      reason: 'Current project memory.',
      expectedValue: 'Find implementation references.',
      createdAt: 'now'
    };
    const intent = createResearchIntent({ userId: 'default', companionId: 'ann', cycleId: 'cycle', curiosityTarget: target, now: 'now' });
    const capabilities: ResearchCapability[] = [
      { id: 'github', kind: 'structured_connector' as const, sourceTypes: ['code'], mode: 'fixture' as const, available: true },
      { id: 'brave-search', kind: 'open_web_search' as const, sourceTypes: ['official', 'code', 'technical_article'], mode: 'fixture' as const, available: true },
      { id: 'page-fetcher', kind: 'web_page_fetcher' as const, sourceTypes: ['official', 'code', 'technical_article'], mode: 'fixture' as const, available: true },
      { id: 'reddit', kind: 'structured_connector' as const, sourceTypes: ['community'], mode: 'unavailable' as const, available: false }
    ];
    const plan = createDeterministicResearchPlan({ intent, capabilities, now: 'now' });
    const routed = routeResearchSources(intent, capabilities);

    expect(intent.preferredSourceTypes).toEqual(expect.arrayContaining(['official', 'code', 'technical_article']));
    expect(plan.queries).toHaveLength(2);
    expect(routed.map((capability) => capability.id)).toEqual(expect.arrayContaining(['github', 'brave-search', 'page-fetcher']));
    expect(routed.map((capability) => capability.id)).not.toContain('reddit');
  });

  it('selects only current search-result IDs with domain diversity and bounded continuation', () => {
    const target = {
      id: 'curiosity_test', userId: 'default', companionId: 'ann', topic: 'Local-first AI companion', description: 'Challenge the architecture.',
      source: 'memory_trigger' as const, explorationType: 'challenge' as const, priority: 0.8, confidence: 0.7,
      reason: 'Current project memory.', expectedValue: 'Find limits.', createdAt: 'now'
    };
    const intent = createResearchIntent({ userId: 'default', companionId: 'ann', cycleId: 'cycle', curiosityTarget: target, now: 'now' });
    const capabilities: ResearchCapability[] = [
      { id: 'search', kind: 'open_web_search' as const, sourceTypes: ['research', 'community', 'technical_article'], mode: 'fixture' as const, available: true },
      { id: 'fetch', kind: 'web_page_fetcher' as const, sourceTypes: ['research', 'community', 'technical_article'], mode: 'fixture' as const, available: true }
    ];
    const plan = createDeterministicResearchPlan({ intent, capabilities, now: 'now' });
    const selected = selectResearchPages({
      intent, plan,
      results: [
        { id: 'official', query: intent.topic, title: 'Official docs', url: 'https://docs.example.test/a', domain: 'docs.example.test', rank: 1, provider: 'fixture' },
        { id: 'critical', query: intent.topic, title: 'Limitations and risks', url: 'https://critique.example.test/b', domain: 'critique.example.test', rank: 2, provider: 'fixture' },
        { id: 'same-domain', query: intent.topic, title: 'Another page', url: 'https://docs.example.test/c', domain: 'docs.example.test', rank: 3, provider: 'fixture' }
      ]
    });
    expect(selected.map((item) => item.searchResultId)).toEqual(expect.arrayContaining(['official', 'critical']));
    expect(selected.map((item) => item.searchResultId)).not.toContain('invented-url');
    const coverage = evaluateEvidenceCoverage(intent, []);
    expect(decideResearchContinuation({ intent, coverage, completedAdditionalPasses: 0 })).toEqual(expect.objectContaining({ action: 'continue' }));
    expect(decideResearchContinuation({ intent, coverage, completedAdditionalPasses: 1 })).toEqual(expect.objectContaining({ action: 'stop' }));
  });

  it('falls back from invalid AI planning and clamps valid AI limits without accepting URLs', () => {
    const target = {
      id: 'target', userId: 'default', companionId: 'ann', topic: 'Local-first AI', description: 'Practical research.',
      source: 'memory_trigger' as const, explorationType: 'practical' as const, priority: 0.8, confidence: 0.8,
      reason: 'memory', expectedValue: 'evidence', createdAt: 'now'
    };
    const intent = createResearchIntent({ userId: 'default', companionId: 'ann', cycleId: 'cycle', curiosityTarget: target, now: 'now' });
    const capabilities: ResearchCapability[] = [
      { id: 'search', kind: 'open_web_search', sourceTypes: ['official', 'code', 'technical_article'], mode: 'fixture', available: true },
      { id: 'fetch', kind: 'web_page_fetcher', sourceTypes: ['official', 'code', 'technical_article'], mode: 'fixture', available: true }
    ];
    const deterministic = createDeterministicResearchPlan({ intent, capabilities, now: 'now' });
    expect(validateAiResearchPlan({ urls: ['https://invented.example'], queries: [], selectedCapabilities: ['search'] }, deterministic, capabilities)).toEqual(deterministic);
    const refined = validateAiResearchPlan({ urls: ['https://invented.example'], queries: ['  local-first safety  '], selectedCapabilities: ['search', 'fetch'], limits: { maxQueries: 999, maxPagesToRead: 999 } }, deterministic, capabilities);
    expect(refined.queries).toEqual(['local-first safety']);
    expect(refined.limits.maxQueries).toBe(3);
    expect(refined.limits.maxPagesToRead).toBe(5);
    expect(refined).not.toHaveProperty('urls');
  });
});
