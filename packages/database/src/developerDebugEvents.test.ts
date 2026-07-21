import { describe, expect, it } from 'vitest';
import type { DeveloperDebugEvent, DeveloperDebugEventKind } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { DatabaseService } from './index';

function makeEvent(kind: DeveloperDebugEventKind, overrides: Partial<DeveloperDebugEvent> = {}): DeveloperDebugEvent {
  return {
    id: createId('devent'),
    kind,
    operation: 'test-operation',
    status: 'completed',
    summary: 'test summary',
    createdAt: nowIso(),
    syncStatus: 'pending',
    syncAttemptCount: 0,
    ...overrides,
  };
}

describe('Developer Debug Events', () => {
  it('persists and retrieves debug events', () => {
    const db = new DatabaseService();
    const event = makeEvent('ai_call', { operation: 'chat', summary: 'AI chat call' });
    db.insertDeveloperDebugEvent(event);

    const events = db.listDeveloperDebugEvents({ kinds: ['ai_call'] });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(event.id);
    expect(events[0].kind).toBe('ai_call');
    expect(events[0].operation).toBe('chat');
    expect(events[0].summary).toBe('AI chat call');
    expect(events[0].syncStatus).toBe('pending');
    expect(events[0].syncAttemptCount).toBe(0);
  });

  it('filters by kind', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call'));
    db.insertDeveloperDebugEvent(makeEvent('research_search'));
    db.insertDeveloperDebugEvent(makeEvent('research_page_fetch'));

    const aiEvents = db.listDeveloperDebugEvents({ kinds: ['ai_call'] });
    expect(aiEvents).toHaveLength(1);
    expect(aiEvents[0].kind).toBe('ai_call');

    const searchEvents = db.listDeveloperDebugEvents({ kinds: ['research_search'] });
    expect(searchEvents).toHaveLength(1);

    const allEvents = db.listDeveloperDebugEvents();
    expect(allEvents).toHaveLength(3);
  });

  it('filters by multiple kinds (IN query)', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call'));
    db.insertDeveloperDebugEvent(makeEvent('research_search'));
    db.insertDeveloperDebugEvent(makeEvent('research_page_fetch'));
    db.insertDeveloperDebugEvent(makeEvent('research_evidence'));
    db.insertDeveloperDebugEvent(makeEvent('evidence_synthesis'));
    db.insertDeveloperDebugEvent(makeEvent('pipeline_failure'));

    const researchKinds = db.listDeveloperDebugEvents({ kinds: ['research_search', 'research_page_fetch', 'research_evidence', 'evidence_synthesis'] });
    expect(researchKinds).toHaveLength(4);

    const mixedKinds = db.listDeveloperDebugEvents({ kinds: ['ai_call', 'pipeline_failure'] });
    expect(mixedKinds).toHaveLength(2);

    const aiAndResearch = db.listDeveloperDebugEvents({ kinds: ['ai_call', 'research_search'] });
    expect(aiAndResearch).toHaveLength(2);
  });

  it('filters by operation (case-insensitive LIKE)', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { operation: 'ChatCompletion' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { operation: 'ResearchPlan' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { operation: 'chat-turn' }));

    const chatOps = db.listDeveloperDebugEvents({ operation: 'chat' });
    expect(chatOps).toHaveLength(2);

    const researchOps = db.listDeveloperDebugEvents({ operation: 'research' });
    expect(researchOps).toHaveLength(1);
  });

  it('filters by status (exact match)', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { status: 'completed' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { status: 'error' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { status: 'completed' }));

    const completed = db.listDeveloperDebugEvents({ status: 'completed' });
    expect(completed).toHaveLength(2);

    const errors = db.listDeveloperDebugEvents({ status: 'error' });
    expect(errors).toHaveLength(1);
  });

  it('filters by provider (case-insensitive LIKE)', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { provider: 'deepseek-v4' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { provider: 'openai-gpt4' }));
    db.insertDeveloperDebugEvent(makeEvent('research_search', { provider: 'deepseek-search' }));

    const deepseekEvents = db.listDeveloperDebugEvents({ provider: 'deepseek' });
    expect(deepseekEvents).toHaveLength(2);

    const openaiEvents = db.listDeveloperDebugEvents({ provider: 'openai' });
    expect(openaiEvents).toHaveLength(1);
  });

  it('filters by cycleId (LIKE contains)', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { cycleId: 'cycle_abc123' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { cycleId: 'cycle_def456' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { cycleId: 'other_cycle' }));

    const abcEvents = db.listDeveloperDebugEvents({ cycleId: 'abc123' });
    expect(abcEvents).toHaveLength(1);

    const cycleEvents = db.listDeveloperDebugEvents({ cycleId: 'cycle' });
    expect(cycleEvents).toHaveLength(3);
  });

  it('filters by correlationId (LIKE contains)', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { correlationId: 'corr_xyz789' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { correlationId: 'corr_abc123' }));

    const xyzEvents = db.listDeveloperDebugEvents({ correlationId: 'xyz789' });
    expect(xyzEvents).toHaveLength(1);

    const corrEvents = db.listDeveloperDebugEvents({ correlationId: 'corr' });
    expect(corrEvents).toHaveLength(2);
  });

  it('filters by turnId (LIKE contains)', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { turnId: 'turn_111' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { turnId: 'turn_222' }));

    const t1 = db.listDeveloperDebugEvents({ turnId: 'turn_111' });
    expect(t1).toHaveLength(1);

    const allTurns = db.listDeveloperDebugEvents({ turnId: 'turn' });
    expect(allTurns).toHaveLength(2);
  });

  it('filters by syncStatus (exact match)', () => {
    const db = new DatabaseService();
    const e1 = makeEvent('ai_call');
    const e2 = makeEvent('ai_call');
    const e3 = makeEvent('ai_call');
    db.insertDeveloperDebugEvent(e1);
    db.insertDeveloperDebugEvent(e2);
    db.insertDeveloperDebugEvent(e3);

    db.markDeveloperDebugEventsUploading([e1.id]);
    db.markDeveloperDebugEventsUploaded([e2.id]);

    const pendingEvents = db.listDeveloperDebugEvents({ syncStatus: 'pending' });
    expect(pendingEvents).toHaveLength(1);

    const uploadingEvents = db.listDeveloperDebugEvents({ syncStatus: 'uploading' });
    expect(uploadingEvents).toHaveLength(1);

    const uploadedEvents = db.listDeveloperDebugEvents({ syncStatus: 'uploaded' });
    expect(uploadedEvents).toHaveLength(1);
  });

  it('applies combined filters', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { operation: 'chat', provider: 'deepseek', status: 'completed' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { operation: 'chat', provider: 'openai', status: 'error' }));
    db.insertDeveloperDebugEvent(makeEvent('research_search', { operation: 'search', provider: 'deepseek', status: 'completed' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { operation: 'plan', provider: 'deepseek', status: 'completed' }));

    const filtered = db.listDeveloperDebugEvents({
      kinds: ['ai_call'],
      provider: 'deepseek',
      status: 'completed',
    });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.kind === 'ai_call' && e.status === 'completed')).toBe(true);
  });

  it('countEvents uses same filters as listEvents', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { provider: 'deepseek' }));
    db.insertDeveloperDebugEvent(makeEvent('ai_call', { provider: 'openai' }));
    db.insertDeveloperDebugEvent(makeEvent('research_search', { provider: 'deepseek' }));

    const query = { kinds: ['ai_call'] as DeveloperDebugEventKind[], provider: 'deepseek' };
    const count = db.countDeveloperDebugEvents(query);
    const list = db.listDeveloperDebugEvents(query);
    expect(count).toBe(list.length);
    expect(count).toBe(1);
  });

  it('filtered pagination returns correct results', () => {
    const db = new DatabaseService();
    for (let i = 0; i < 15; i++) {
      db.insertDeveloperDebugEvent(makeEvent('ai_call', { summary: `ai-${i}`, operation: i < 10 ? 'chat' : 'plan' }));
    }
    db.insertDeveloperDebugEvent(makeEvent('research_search', { summary: 'research-1', operation: 'search' }));

    const query = { kinds: ['ai_call'] as DeveloperDebugEventKind[], operation: 'chat' };
    const total = db.countDeveloperDebugEvents(query);
    expect(total).toBe(10);

    const page1 = db.listDeveloperDebugEvents({ ...query, limit: 5, offset: 0 });
    expect(page1).toHaveLength(5);

    const page2 = db.listDeveloperDebugEvents({ ...query, limit: 5, offset: 5 });
    expect(page2).toHaveLength(5);

    const page3 = db.listDeveloperDebugEvents({ ...query, limit: 5, offset: 10 });
    expect(page3).toHaveLength(0);
  });

  it('no results returns count=0', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call'));

    expect(db.countDeveloperDebugEvents({ kinds: ['pipeline_failure'] })).toBe(0);
    expect(db.countDeveloperDebugEvents({ operation: 'nonexistent' })).toBe(0);
    expect(db.countDeveloperDebugEvents({ provider: 'unknown' })).toBe(0);
  });

  it('respects limit and offset', () => {
    const db = new DatabaseService();
    for (let i = 0; i < 10; i++) {
      db.insertDeveloperDebugEvent(makeEvent('ai_call', { summary: `event-${i}` }));
    }

    const page1 = db.listDeveloperDebugEvents({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = db.listDeveloperDebugEvents({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);
    expect(page2[0].summary).not.toBe(page1[0].summary);

    const all = db.listDeveloperDebugEvents({ limit: 500 });
    expect(all).toHaveLength(10);
  });

  it('caps limit at 500', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call'));
    const events = db.listDeveloperDebugEvents({ limit: 999 });
    expect(events).toHaveLength(1);
  });

  it('gets a single event by id', () => {
    const db = new DatabaseService();
    const event = makeEvent('research_evidence');
    db.insertDeveloperDebugEvent(event);

    const found = db.getDeveloperDebugEvent(event.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(event.id);
    expect(found!.kind).toBe('research_evidence');

    expect(db.getDeveloperDebugEvent('nonexistent')).toBeUndefined();
  });

  it('marks events as uploading', () => {
    const db = new DatabaseService();
    const e1 = makeEvent('ai_call');
    const e2 = makeEvent('research_search');
    db.insertDeveloperDebugEvent(e1);
    db.insertDeveloperDebugEvent(e2);

    db.markDeveloperDebugEventsUploading([e1.id]);

    const events = db.listDeveloperDebugEvents();
    const uploaded = events.find((e) => e.id === e1.id)!;
    const pending = events.find((e) => e.id === e2.id)!;
    expect(uploaded.syncStatus).toBe('uploading');
    expect(uploaded.syncAttemptCount).toBe(1);
    expect(uploaded.lastSyncAttemptAt).toBeDefined();
    expect(pending.syncStatus).toBe('pending');
  });

  it('marks events as uploaded', () => {
    const db = new DatabaseService();
    const e1 = makeEvent('ai_call');
    db.insertDeveloperDebugEvent(e1);

    db.markDeveloperDebugEventsUploading([e1.id]);
    db.markDeveloperDebugEventsUploaded([e1.id]);

    const found = db.getDeveloperDebugEvent(e1.id)!;
    expect(found.syncStatus).toBe('uploaded');
    expect(found.uploadedAt).toBeDefined();
  });

  it('marks events back to pending', () => {
    const db = new DatabaseService();
    const e1 = makeEvent('ai_call');
    db.insertDeveloperDebugEvent(e1);

    db.markDeveloperDebugEventsUploading([e1.id]);
    db.markDeveloperDebugEventsPending([e1.id]);

    const found = db.getDeveloperDebugEvent(e1.id)!;
    expect(found.syncStatus).toBe('pending');
  });

  it('prunes old events', () => {
    const db = new DatabaseService();
    const oldEvent = makeEvent('ai_call', {
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const recentEvent = makeEvent('ai_call', {
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    });
    db.insertDeveloperDebugEvent(oldEvent);
    db.insertDeveloperDebugEvent(recentEvent);

    const pruned = db.pruneDeveloperDebugEvents(14);
    expect(pruned).toBe(1);

    const remaining = db.listDeveloperDebugEvents();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(recentEvent.id);
  });

  it('persists payload as JSON', () => {
    const db = new DatabaseService();
    const event = makeEvent('research_search', {
      payload: { query: 'test query', resultCount: 5, nested: { key: 'value' } },
    });
    db.insertDeveloperDebugEvent(event);

    const found = db.getDeveloperDebugEvent(event.id)!;
    expect(found.payload).toEqual({ query: 'test query', resultCount: 5, nested: { key: 'value' } });
  });

  it('survives AppServices recreation (events persist across instances)', () => {
    const { mkdtempSync } = require('node:fs');
    const { join } = require('node:path');
    const { tmpdir } = require('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'debug-events-test-'));
    const dbPath = join(dir, 'test.db');

    const db1 = new DatabaseService({ path: dbPath });
    db1.insertDeveloperDebugEvent(makeEvent('ai_call', { summary: 'persist-test' }));
    db1.close();

    const db2 = new DatabaseService({ path: dbPath });
    const events = db2.listDeveloperDebugEvents();
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('persist-test');
    db2.close();
  });

  it('handles all event kinds', () => {
    const db = new DatabaseService();
    const kinds: DeveloperDebugEventKind[] = [
      'ai_call', 'research_search', 'research_page_fetch',
      'research_evidence', 'evidence_synthesis', 'pipeline_failure'
    ];

    for (const kind of kinds) {
      db.insertDeveloperDebugEvent(makeEvent(kind));
    }

    expect(db.countDeveloperDebugEvents()).toBe(6);
    for (const kind of kinds) {
      expect(db.countDeveloperDebugEvents({ kinds: [kind] })).toBe(1);
    }
  });
});
