import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import type { Discovery } from '@our-companion/shared';

describe('canonical Discovery lifecycle persistence', () => {
  it('persists legal ACK transitions idempotently and counts announcements independently of terminal status', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const discovery = sampleDiscovery('disc_lifecycle', '2026-07-17T01:00:00.000Z');
    db.insertDiscovery(discovery);

    const eligible = db.transitionDiscoveryStatus(discovery.id, 'eligible', {
      at: '2026-07-17T02:00:00.000Z',
      companionId: 'companion-a',
      cycleId: 'cycle-a'
    });
    expect(eligible).toEqual(expect.objectContaining({
      status: 'eligible',
      eligibleAt: '2026-07-17T02:00:00.000Z',
      companionId: 'companion-a',
      cycleId: 'cycle-a'
    }));

    const duplicateEligible = db.transitionDiscoveryStatus(discovery.id, 'eligible', {
      at: '2026-07-17T02:30:00.000Z'
    });
    expect(duplicateEligible.eligibleAt).toBe('2026-07-17T02:00:00.000Z');

    db.transitionDiscoveryStatus(discovery.id, 'queued', {
      at: '2026-07-17T03:00:00.000Z',
      commandId: 'command-a'
    });
    const presenting = db.transitionDiscoveryStatus(discovery.id, 'presenting', {
      at: '2026-07-17T04:00:00.000Z'
    });
    expect(presenting).toEqual(expect.objectContaining({
      status: 'presenting',
      queuedAt: '2026-07-17T03:00:00.000Z',
      presentingAt: '2026-07-17T04:00:00.000Z',
      presentationCommandId: 'command-a'
    }));

    const announced = db.transitionDiscoveryStatus(discovery.id, 'announced', {
      at: '2026-07-17T05:00:00.000Z'
    });
    expect(announced.announcedAt).toBe('2026-07-17T05:00:00.000Z');
    expect(db.countAnnouncedToday(undefined, new Date('2026-07-17T12:00:00.000Z'))).toBe(1);
    expect(db.countAnnouncedToday('companion-a', new Date('2026-07-17T12:00:00.000Z'))).toBe(1);

    db.transitionDiscoveryStatus(discovery.id, 'saved', {
      at: '2026-07-18T01:00:00.000Z'
    });
    db.insertDiscovery({
      ...discovery,
      title: 'Refreshed metadata must not reset lifecycle',
      updatedAt: '2026-07-18T02:00:00.000Z'
    });
    expect(db.countAnnouncedToday(undefined, new Date('2026-07-17T12:00:00.000Z'))).toBe(1);
    expect(db.getDiscovery(discovery.id)).toEqual(expect.objectContaining({
      status: 'saved',
      title: 'Refreshed metadata must not reset lifecycle',
      announcedAt: '2026-07-17T05:00:00.000Z'
    }));
    db.close();
  });

  it('rejects illegal transitions and recovers queued items before eligible items', () => {
    const db = new DatabaseService({ path: ':memory:' });
    db.insertDiscovery(sampleDiscovery('eligible-old', '2026-07-17T01:00:00.000Z'));
    db.insertDiscovery(sampleDiscovery('queued-new', '2026-07-17T02:00:00.000Z'));
    db.insertDiscovery(sampleDiscovery('candidate-only', '2026-07-17T00:00:00.000Z'));

    expect(() => db.transitionDiscoveryStatus('candidate-only', 'announced')).toThrow(
      'Illegal Discovery lifecycle transition: candidate -> announced'
    );

    db.transitionDiscoveryStatus('eligible-old', 'eligible', { at: '2026-07-17T03:00:00.000Z' });
    db.transitionDiscoveryStatus('queued-new', 'eligible', { at: '2026-07-17T04:00:00.000Z' });
    db.transitionDiscoveryStatus('queued-new', 'queued', { at: '2026-07-17T05:00:00.000Z' });

    expect(db.listQueuedOrEligible().map((item) => item.id)).toEqual(['queued-new', 'eligible-old']);
    expect(db.getOldestQueuedDiscovery()?.id).toBe('queued-new');
    db.close();
  });

  it('does not expose unowned or foreign queued discoveries to a Companion-scoped lookup', () => {
    const db = new DatabaseService({ path: ':memory:' });
    db.insertDiscovery({
      ...sampleDiscovery('unowned', '2026-07-17T01:00:00.000Z'),
      status: 'eligible'
    });
    db.insertDiscovery({
      ...sampleDiscovery('foreign', '2026-07-17T02:00:00.000Z'),
      companionId: 'companion-b',
      status: 'eligible'
    });
    db.insertDiscovery({
      ...sampleDiscovery('owned', '2026-07-17T03:00:00.000Z'),
      companionId: 'companion-a',
      status: 'eligible'
    });

    expect(db.listQueuedOrEligible(20, 'companion-a').map((item) => item.id))
      .toEqual(['owned']);
    expect(db.getOldestQueuedDiscovery('companion-b')?.id).toBe('foreign');
    db.close();
  });
});

function sampleDiscovery(id: string, createdAt: string): Discovery {
  return {
    id,
    source: 'github',
    title: `Discovery ${id}`,
    tags: ['frontend'],
    raw: {},
    userInterestScore: 0.8,
    userHistoryScore: 0.7,
    characterExpertiseScore: 0.75,
    noveltyScore: 0.7,
    usefulnessScore: 0.65,
    finalScore: 0.75,
    status: 'candidate',
    createdAt
  };
}
