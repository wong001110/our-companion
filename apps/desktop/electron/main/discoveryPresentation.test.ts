import { describe, expect, it } from 'vitest';
import { compactDiscoveryTagsForStorage } from './discoveryPresentation';

describe('compactDiscoveryTagsForStorage', () => {
  it('turns a long Chinese curiosity sentence into short chips', () => {
    const tags = compactDiscoveryTagsForStorage([
      '温柔护理中的耐心观察与沟通方法，以及护理经验文章',
    ]);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.length).toBeLessThanOrEqual(4);
    expect(tags.every((tag) => tag.length <= 8)).toBe(true);
    expect(tags).not.toContain('温柔护理中的耐心观察与沟通方法，以及护理经验文章');
  });

  it('deduplicates sources and keeps English tags short', () => {
    expect(compactDiscoveryTagsForStorage([
      'Reddit',
      'reddit',
      'gentle nursing patient care soft spoken caregiver',
    ])).toEqual(['reddit', 'gentle nursing patient']);
  });

  it('never stores more than the requested bounded number of tags', () => {
    expect(compactDiscoveryTagsForStorage([
      'one topic', 'two topic', 'three topic', 'four topic', 'five topic',
    ], 3)).toHaveLength(3);
  });
});
