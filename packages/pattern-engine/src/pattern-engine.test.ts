import { describe, expect, it } from 'vitest';
import { detectPatterns, scorePattern } from './index';

describe('pattern engine', () => {
  it('scores repeated patterns with feedback weight', () => {
    expect(scorePattern({ frequency: 0.8, recency: 0.8, emotionalWeight: 0.7, feedbackWeight: 0.9 }).finalScore).toBeGreaterThan(0.75);
  });

  it('detects repeated memory themes using normalized importance', () => {
    const patterns = detectPatterns({
      userId: 'default',
      memoryNodes: [
        { id: 'mem_1', type: 'topic', title: 'AI companion memory', importance: 0.8, createdAt: 'now', updatedAt: 'now' },
        { id: 'mem_2', type: 'topic', title: 'Desktop companion presence', importance: 0.7, createdAt: 'now', updatedAt: 'now' },
      ],
      journeyMilestones: [],
      discoveryHistory: [],
      feedbackHistory: [],
    });
    expect(patterns.some((pattern) => pattern.title.toLowerCase().includes('companion'))).toBe(true);
  });
});
