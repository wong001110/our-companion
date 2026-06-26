import { describe, expect, it } from 'vitest';
import {
  applyDailyCap,
  checkDuplicateDiscovery,
  deduplicateDiscoveries,
  discoveryFromSignal,
  fingerprintDiscovery,
  normalizeDiscoveryUrl,
  normalizeSignal,
  passesDiscoveryQuality,
  planExploration,
  runDiscoveryAgents,
  scoreDiscovery,
  captureSignal
} from './index';

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
    const capped = applyDailyCap(
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
        finalScore: index,
        status: 'candidate' as const,
        createdAt: 'now'
      })),
      2
    );

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
      source: 'memory_trigger' as const,
      explorationType: 'practical' as const,
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
