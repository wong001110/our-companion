import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const connection = readFileSync(new URL('./networkConnection.ts', import.meta.url), 'utf8');
const visit = readFileSync(new URL('./network/visitService.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const preload = readFileSync(new URL('../preload/index.ts', import.meta.url), 'utf8');
const socialPage = readFileSync(new URL('../../renderer/src/pages/SocialPage.tsx', import.meta.url), 'utf8');
const conversation = readFileSync(new URL('../../renderer/src/features/social/SocialVisitConversation.tsx', import.meta.url), 'utf8');
const published = readFileSync(new URL('../../renderer/src/features/social/PublishedCompanionSection.tsx', import.meta.url), 'utf8');
const visual = readFileSync(new URL('./network/visualVisitService.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../renderer/src/app/CompanionEntryShell.tsx', import.meta.url), 'utf8');

describe('Desktop Social Room experience contract', () => {
  it('wires Shareable Topics and all three Visit modes through main and preload', () => {
    expect(connection).toContain('/shareable-topics');
    expect(connection).toContain("mode?: VisitMode");
    expect(published).toContain('ShareableTopicsSection');
    expect(published).toContain('allowRecipientSave');
    expect(published).toContain('eligibleForRandomVisit');
    expect(socialPage).toContain("'standard' | 'visitor_topic' | 'random_host_topic'");
    expect(preload).toContain('createShareableTopic');
    expect(index).toContain("'network:companions:createShareableTopic'");
  });

  it('supports joinable three-Companion rooms and queues a guest topic without replacing the active one', () => {
    expect(connection).toContain('/api/visit-rooms/joinable');
    expect(connection).toContain('/join-requests');
    expect(socialPage).toContain('joinable-social-rooms');
    expect(socialPage).toContain('selectedJoinTopicId');
    expect(socialPage).toContain('social-room-join-requests');
    expect(conversation).toContain('social-room-topic-list');
    expect(conversation).toContain('roomTopicId');
  });

  it('locks Companion activity from invitation creation through accepted room participation', () => {
    expect(visit).toContain("kind: 'outgoing_invitation'");
    expect(visit).toContain("kind: 'session_participant'");
    expect(visit).toContain("kind: 'join_request'");
    expect(visit).toContain('VISIT_COMPANION_RESERVED');
    expect(index).toContain('VISIT_RESERVED_ACTIVITY_CHANNELS');
    expect(index).toContain("'discovery:generateNow'");
    expect(index).toContain("'autonomy:startExploration'");
  });

  it('presents the actual speaker, acknowledges presentation, and saves recipient-approved outcomes locally', () => {
    expect(visual).toContain('latestTurn.senderUserId === participant.userId');
    expect(visual).toContain('next.localPresentation');
    expect(shell).toContain('visualVisit.localPresentation');
    expect(shell).toContain('acknowledgePresentation(presentation.turnId)');
    expect(conversation).toContain('Save to Discovery Feed');
    expect(conversation).toContain('Add Shared Moment to Journey');
    expect(conversation).toContain('Do not suggest again');
    expect(visit).toContain('SAVED_TOPIC_PREFIX');
    expect(visit).toContain('SAVED_MOMENT_PREFIX');
    expect(visit).toContain('SUPPRESSED_TOPIC_PREFIX');
  });

  it('settles local continuity once per remote Companion for a completed room', () => {
    expect(visit).toContain('COMPLETED_PREFIX');
    expect(visit).toContain('remoteUserIds');
    expect(visit).toContain('for (const remoteUserId of remoteUserIds)');
    expect(visit).toContain('interactionCount: (previous?.interactionCount ?? 0) + 1');
  });
});
