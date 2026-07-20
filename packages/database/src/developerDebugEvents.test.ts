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

    const events = db.listDeveloperDebugEvents({ kind: 'ai_call' });
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

    const aiEvents = db.listDeveloperDebugEvents({ kind: 'ai_call' });
    expect(aiEvents).toHaveLength(1);
    expect(aiEvents[0].kind).toBe('ai_call');

    const searchEvents = db.listDeveloperDebugEvents({ kind: 'research_search' });
    expect(searchEvents).toHaveLength(1);

    const allEvents = db.listDeveloperDebugEvents();
    expect(allEvents).toHaveLength(3);
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

  it('counts events by kind', () => {
    const db = new DatabaseService();
    db.insertDeveloperDebugEvent(makeEvent('ai_call'));
    db.insertDeveloperDebugEvent(makeEvent('ai_call'));
    db.insertDeveloperDebugEvent(makeEvent('research_search'));

    expect(db.countDeveloperDebugEvents()).toBe(3);
    expect(db.countDeveloperDebugEvents({ kind: 'ai_call' })).toBe(2);
    expect(db.countDeveloperDebugEvents({ kind: 'research_search' })).toBe(1);
    expect(db.countDeveloperDebugEvents({ kind: 'research_page_fetch' })).toBe(0);
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
      expect(db.countDeveloperDebugEvents({ kind })).toBe(1);
    }
  });
});
