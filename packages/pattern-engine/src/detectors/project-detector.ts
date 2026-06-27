import type { MemoryRecord, PatternV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculatePatternConfidence } from '../confidence';
import { MIN_SUPPORTING_MEMORIES } from '../types';

export function detectProjectPatterns(memories: MemoryRecord[], userId: string): PatternV2[] {
  const projectKeywords = ['project', 'app', 'engine', 'system', 'feature', 'implementation'];
  const projectMemories = memories.filter((m) =>
    m.tags.some((tag) => projectKeywords.some((kw) => tag.toLowerCase().includes(kw))) ||
    m.content.toLowerCase().includes('project')
  );

  const patterns: PatternV2[] = [];
  const timestamp = nowIso();

  if (projectMemories.length >= MIN_SUPPORTING_MEMORIES) {
    const avgImportance = projectMemories.reduce((sum, m) => sum + m.importance, 0) / projectMemories.length;
    const recency = Math.max(...projectMemories.map((m) =>
      Math.max(0, 1 - (Date.now() - new Date(m.lastAccessedAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
    ));

    const confidence = calculatePatternConfidence({
      supportingMemoryCount: projectMemories.length,
      recency,
      reinforcementCount: projectMemories.reduce((sum, m) => sum + m.reinforcementCount, 0),
      consistency: 0.75,
      avgMemoryImportance: avgImportance,
    });

    patterns.push({
      id: createId('pattern'),
      userId,
      category: 'project',
      type: 'repeated_topic',
      title: 'Active project work',
      summary: `User is actively working on project-related topics across ${projectMemories.length} memories.`,
      confidence,
      strength: confidence,
      supportingMemoryIds: projectMemories.map((m) => m.id),
      firstDetectedAt: timestamp,
      lastUpdatedAt: timestamp,
      reinforcementCount: 0,
      evidence: projectMemories.slice(0, 5).map((m) => ({
        sourceType: 'memory' as const,
        sourceId: m.id,
        summary: m.content.slice(0, 100),
        weight: m.importance / 100,
      })),
    });
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}
