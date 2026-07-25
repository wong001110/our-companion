import { describe, expect, it } from 'vitest';
import type { DiscoveryCandidate, MemoryNode } from '@our-companion/shared';
import {
  alignDiscoveryCandidateWithMemory,
  attachDiscoveryMemoryAlignment,
  buildDiscoveryMemoryProfile,
  extractDiscoveryMemoryTerms,
  rankDiscoveryCandidatesWithMemory,
  readDiscoveryMemoryAlignment,
} from './discoveryMemory';

const AT = '2026-07-25T00:00:00.000Z';

function memory(input: {
  id: string;
  text: string;
  memoryType?: MemoryNode['memoryType'];
  sensitivity?: 'normal' | 'personal' | 'private' | 'sensitive';
  boundary?: NonNullable<NonNullable<MemoryNode['metadata']>['userBoundary']>;
}): MemoryNode {
  return {
    id: input.id,
    type: 'topic',
    title: input.text,
    summary: input.text,
    content: input.text,
    importance: 0.9,
    companionId: 'companion-1',
    userId: 'user-1',
    memoryType: input.memoryType ?? 'user_preference',
    metadata: {
      ownerCompanionId: 'companion-1',
      ownerUserId: 'user-1',
      sourceType: 'user_explicit',
      confidence: 0.95,
      sensitivity: input.sensitivity ?? 'normal',
      scope: 'companion',
      createdAt: AT,
      canonicalText: input.text,
      canonicalSource: input.boundary ? 'deterministic_boundary' : 'exact_user_evidence',
      userBoundary: input.boundary,
    },
    confidence: 0.95,
    status: 'active',
    createdAt: AT,
    updatedAt: AT,
  };
}

function candidate(id: string, title: string, summary: string, relevanceScore = 0.55): DiscoveryCandidate {
  return {
    id,
    userId: 'user-1',
    companionId: 'companion-1',
    title,
    summary,
    sourceType: 'article',
    sourceUrl: `https://example.test/${id}`,
    sourceName: 'example.test',
    agentType: 'research',
    relatedCuriosityTargetId: 'curiosity-1',
    relevanceScore,
    noveltyScore: 0.7,
    evidenceScore: 0.8,
    usefulnessScore: 0.75,
    collectedAt: AT,
  };
}

describe('Discovery Memory integration', () => {
  it('extracts English and Chinese topic terms deterministically', () => {
    const terms = extractDiscoveryMemoryTerms('Local-first SQLite 与 本地优先数据库');
    expect(terms).toContain('local-first');
    expect(terms).toContain('sqlite');
    expect(terms).toContain('本地');
    expect(terms).toContain('数据库');
  });

  it('uses a normal preference to rank a matching core candidate first', () => {
    const profile = buildDiscoveryMemoryProfile({
      memoryNodes: [memory({ id: 'memory-1', text: 'I prefer local-first SQLite architecture.' })],
      generatedAt: AT,
    });
    const ranked = rankDiscoveryCandidatesWithMemory({
      candidates: [
        candidate('unrelated', 'Cloud gaming graphics update', 'A rendering pipeline release.', 0.55),
        candidate('matching', 'Local-first SQLite architecture', 'A practical offline database pattern.', 0.55),
      ],
      profile,
      mode: 'core',
      curiosityTarget: { topic: 'software architecture' },
      baseScore: (item) => item.relevanceScore,
    });
    expect(ranked[0]?.candidate.id).toBe('matching');
    expect(ranked[0]?.alignment.supportingMemoryIds).toContain('memory-1');
    expect(ranked[0]?.alignment.publicHintTerms).toContain('sqlite');
  });

  it('excludes private and sensitive Memory from positive ranking', () => {
    const profile = buildDiscoveryMemoryProfile({
      memoryNodes: [memory({ id: 'private-1', text: 'Secret oncology identifier', sensitivity: 'private' })],
      generatedAt: AT,
    });
    expect(profile.memoryTerms).toEqual([]);
    expect(profile.sourceMemoryIds).toEqual([]);
  });

  it('hard-blocks a candidate that violates a do-not-recommend Boundary', () => {
    const profile = buildDiscoveryMemoryProfile({
      memoryNodes: [memory({
        id: 'boundary-1',
        text: 'gambling',
        memoryType: 'user_boundary',
        boundary: { action: 'do_not_recommend', target: 'gambling', sourceLanguage: 'en' },
      })],
      generatedAt: AT,
    });
    const alignment = alignDiscoveryCandidateWithMemory({
      candidate: candidate('gambling', 'Online gambling market trends', 'New casino products and betting platforms.'),
      profile,
      mode: 'core',
    });
    expect(alignment.blockedByBoundary).toBe(true);
    expect(alignment.score).toBe(0);
    expect(alignment.boundaryMemoryIds).toEqual(['boundary-1']);
    expect(alignment.publicHintTerms).not.toContain('gambling');
  });

  it('keeps wildcard exploration less personalized than core exploration', () => {
    const profile = buildDiscoveryMemoryProfile({
      memoryNodes: [memory({ id: 'memory-1', text: 'I prefer local-first SQLite architecture.' })],
      generatedAt: AT,
    });
    const matching = candidate('matching', 'Local-first SQLite architecture', 'Offline database design.', 0.55);
    const highBase = candidate('high-base', 'Generative typography research', 'A strong cross-domain design study.', 0.65);
    const core = rankDiscoveryCandidatesWithMemory({
      candidates: [matching, highBase], profile, mode: 'core', baseScore: (item) => item.relevanceScore,
    });
    const wildcard = rankDiscoveryCandidatesWithMemory({
      candidates: [matching, highBase], profile, mode: 'wildcard', baseScore: (item) => item.relevanceScore,
    });
    expect(core[0]?.candidate.id).toBe('matching');
    expect(wildcard[0]?.candidate.id).toBe('high-base');
  });

  it('matches Chinese Memory to a Chinese candidate', () => {
    const profile = buildDiscoveryMemoryProfile({
      memoryNodes: [memory({ id: 'memory-zh', text: '我偏好本地优先的向量数据库方案。' })],
      generatedAt: AT,
    });
    const alignment = alignDiscoveryCandidateWithMemory({
      candidate: candidate('zh', '本地优先向量数据库实践', '离线向量检索和数据隐私设计。'),
      profile,
      mode: 'core',
    });
    expect(alignment.memoryScore).toBeGreaterThan(0.5);
    expect(alignment.supportingMemoryIds).toContain('memory-zh');
  });

  it('persists only safe alignment data without Memory or Boundary IDs', () => {
    const profile = buildDiscoveryMemoryProfile({
      memoryNodes: [memory({ id: 'memory-1', text: 'I prefer local-first SQLite architecture.' })],
      generatedAt: AT,
    });
    const ranked = rankDiscoveryCandidatesWithMemory({
      candidates: [candidate('matching', 'Local-first SQLite architecture', 'Offline database design.')],
      profile,
      mode: 'core',
      baseScore: (item) => item.relevanceScore,
    })[0]!;
    const attached = attachDiscoveryMemoryAlignment(ranked.candidate, ranked);
    const raw = JSON.parse(attached.rawEvidence ?? '{}') as Record<string, unknown>;
    const alignment = raw.memoryAlignment as Record<string, unknown>;
    expect(alignment.supportingMemoryIds).toBeUndefined();
    expect(alignment.boundaryMemoryIds).toBeUndefined();
    expect(alignment.publicHintTerms).toContain('sqlite');
    expect(readDiscoveryMemoryAlignment(raw)?.sourceCounts.memories).toBe(1);
  });

  it('penalizes topics that were explicitly rejected', () => {
    const profile = buildDiscoveryMemoryProfile({
      memoryNodes: [],
      discoveries: [{
        id: 'rejected-1', source: 'internet', title: 'Crypto token speculation', summary: 'Trading and token prices.',
        tags: ['crypto'], raw: {}, userInterestScore: 0.5, userHistoryScore: 0.5, characterExpertiseScore: 0.5,
        noveltyScore: 0.5, usefulnessScore: 0.5, finalScore: 0.5, status: 'rejected', createdAt: AT,
      }],
      generatedAt: AT,
    });
    const alignment = alignDiscoveryCandidateWithMemory({
      candidate: candidate('crypto', 'Crypto token speculation update', 'More token trading and price discussion.'),
      profile,
      mode: 'core',
    });
    expect(alignment.negativePenalty).toBeGreaterThan(0);
    expect(alignment.score).toBeLessThan(0.5);
  });
});
