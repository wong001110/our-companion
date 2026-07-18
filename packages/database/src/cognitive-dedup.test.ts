import { describe, expect, it } from 'vitest';
import type { CuriosityTarget, Pattern } from '@our-companion/shared';
import { CURIOSITY_COOLDOWN_MS, createSemanticFingerprint } from '@our-companion/shared';
import { DatabaseService } from './index';

function pattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pattern-1', userId: 'user', companionId: 'ann',
    semanticFingerprint: createSemanticFingerprint('pattern', ['repeated_theme', 'desktop ai']),
    normalizedTopics: ['desktop ai'], type: 'repeated_theme', title: 'Desktop AI keeps appearing',
    summary: 'Repeated topic', confidence: 0.8, strength: 0.7, freshness: 0.9,
    evidence: [{ sourceType: 'memory', sourceId: 'memory-1', summary: 'Desktop AI', weight: 0.8 }],
    observationCount: 1, frequency: 0.5, lastObservedAt: '2026-07-18T00:00:00.000Z',
    createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function curiosity(overrides: Partial<CuriosityTarget> = {}): CuriosityTarget {
  return {
    id: 'curiosity-1', userId: 'user', companionId: 'ann', topic: 'Desktop AI',
    topicFingerprint: createSemanticFingerprint('curiosity_topic', ['desktop ai']),
    sourceFingerprint: createSemanticFingerprint('curiosity_source', ['memory_trigger', 'memory-1']),
    generatedFromIds: ['memory-1'], description: 'Explore desktop AI', source: 'memory_trigger',
    explorationType: 'adjacent', priority: 0.7, confidence: 0.8, reason: 'Memory', expectedValue: 'Useful',
    relatedMemoryIds: ['memory-1'], status: 'open', lastGeneratedAt: '2026-07-18T00:00:00.000Z',
    generationCount: 1, ignoreCount: 0, createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z', ...overrides,
  };
}

describe('cognitive persistence', () => {
  it('updates a Pattern in place, merges evidence, and isolates Companions', () => {
    const db = new DatabaseService();
    expect(db.upsertPattern(pattern()).outcome).toBe('created');
    const updated = db.upsertPattern(pattern({
      id: 'pattern-2',
      evidence: [{ sourceType: 'memory', sourceId: 'memory-2', summary: 'Desktop AI again', weight: 0.9 }],
      updatedAt: '2026-07-18T01:00:00.000Z',
    }));
    expect(updated.outcome).toBe('updated');
    expect(updated.record.id).toBe('pattern-1');
    expect(updated.record.evidence).toHaveLength(2);
    expect(updated.record.observationCount).toBe(2);
    db.upsertPattern(pattern({ id: 'pattern-other', companionId: 'bea' }));
    expect(db.listPatterns('user', 20, 'ann')).toHaveLength(1);
    expect(db.listPatterns('user', 20, 'bea')).toHaveLength(1);
  });

  it('deduplicates open Curiosity, respects cooldown, and reopens after time advances', () => {
    const db = new DatabaseService();
    expect(db.upsertCuriosityTarget(curiosity()).outcome).toBe('created');
    expect(db.upsertCuriosityTarget(curiosity({ id: 'curiosity-2' }), '2026-07-18T01:00:00.000Z').outcome).toBe('deduplicated');
    const completed = db.setCuriosityTargetStatus('curiosity-1', 'completed', '2026-07-18T02:00:00.000Z');
    expect(Date.parse(completed?.cooldownUntil ?? '')).toBe(
      Date.parse('2026-07-18T02:00:00.000Z') + CURIOSITY_COOLDOWN_MS.completed
    );
    expect(db.upsertCuriosityTarget(curiosity({ id: 'curiosity-3' }), '2026-07-19T01:59:59.000Z').outcome).toBe('cooldown');
    expect(db.upsertCuriosityTarget(curiosity({ id: 'curiosity-4' }), '2026-07-19T02:00:01.000Z').outcome).toBe('reopened');
    expect(db.listCuriosityTargets('user', 20, 'ann')).toHaveLength(1);
  });

  it('increases ignored cooldown and allows materially stronger new evidence to reopen', () => {
    const db = new DatabaseService();
    db.upsertCuriosityTarget(curiosity());
    const once = db.setCuriosityTargetStatus('curiosity-1', 'ignored', '2026-07-18T00:00:00.000Z');
    db.setCuriosityTargetStatus('curiosity-1', 'open', '2026-07-19T00:00:01.000Z');
    const twice = db.setCuriosityTargetStatus('curiosity-1', 'ignored', '2026-07-19T00:00:01.000Z');
    expect(Date.parse(twice?.cooldownUntil ?? '') - Date.parse('2026-07-19T00:00:01.000Z')).toBeGreaterThan(
      Date.parse(once?.cooldownUntil ?? '') - Date.parse('2026-07-18T00:00:00.000Z')
    );
    const reopened = db.upsertCuriosityTarget(curiosity({
      id: 'curiosity-stronger', priority: 0.95, generatedFromIds: ['memory-1', 'pattern-new'],
      relatedPatternIds: ['pattern-new'],
    }), '2026-07-19T00:00:02.000Z');
    expect(reopened.outcome).toBe('reopened');
    expect(reopened.record.generatedFromIds).toContain('pattern-new');
  });
});
