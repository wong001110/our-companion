import { describe, expect, it } from 'vitest';
import { DEFAULT_PROACTIVE_COMPANION_SETTINGS, selectProactiveCompanionOpportunity } from './ProactiveCompanionPolicy';

const NOW = '2026-07-25T10:00:00.000Z';
const base = {
  companionId: 'ann',
  settings: DEFAULT_PROACTIVE_COMPANION_SETTINGS,
  now: NOW,
  localHour: 10,
  attentionMode: 'available' as const,
  conversationActive: false,
  companionDragging: false,
  companionAway: false,
  recentIgnoredInteractions: 0,
  lastUserInteractionAt: '2026-07-25T04:00:00.000Z',
  promptCountToday: 0,
  activeGoalCount: 1,
  activeJourneyCount: 1,
  language: 'en' as const,
};

describe('selectProactiveCompanionOpportunity', () => {
  it('prioritizes an unfinished topic over other opportunities', () => {
    const result = selectProactiveCompanionOpportunity({ ...base, unfinishedTopic: 'Memory quality' });
    expect(result?.prompt.type).toBe('unfinished_topic');
    expect(result?.lifeActivity).toBe('thinking');
  });

  it('uses a goal check-in when no unfinished topic exists', () => {
    const result = selectProactiveCompanionOpportunity(base);
    expect(result?.prompt.type).toBe('goal_check_in');
  });

  it('protects focused mode and late hours', () => {
    expect(selectProactiveCompanionOpportunity({ ...base, attentionMode: 'focused' })).toBeUndefined();
    expect(selectProactiveCompanionOpportunity({ ...base, localHour: 0 })).toBeUndefined();
  });

  it('respects daily limits, cooldown and repeated ignores', () => {
    expect(selectProactiveCompanionOpportunity({ ...base, promptCountToday: 2 })).toBeUndefined();
    expect(selectProactiveCompanionOpportunity({ ...base, lastPromptAt: '2026-07-25T08:00:00.000Z' })).toBeUndefined();
    expect(selectProactiveCompanionOpportunity({ ...base, recentIgnoredInteractions: 3 })).toBeUndefined();
  });

  it('falls back to quiet presence only after extended inactivity', () => {
    const result = selectProactiveCompanionOpportunity({
      ...base,
      activeGoalCount: 0,
      activeJourneyCount: 0,
      lastUserInteractionAt: '2026-07-24T20:00:00.000Z',
      language: 'zh-CN',
    });
    expect(result?.prompt.type).toBe('quiet_presence');
    expect(result?.prompt.message).toContain('不需要');
    expect(result?.lifeActivity).toBe('resting');
  });
});
