import { createId, nowIso } from '@our-companion/shared';
import type { Snapshot, SnapshotDiff } from './types';

export class SnapshotManager {
  private snapshots: Map<string, Snapshot> = new Map();

  save(name: string, data: Omit<Snapshot, 'id' | 'createdAt'>, description?: string): Snapshot {
    const snapshot: Snapshot = {
      ...data,
      id: createId('snap'),
      name,
      description,
      createdAt: nowIso(),
    };
    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  load(id: string): Snapshot | undefined {
    return this.snapshots.get(id);
  }

  list(): Snapshot[] {
    return Array.from(this.snapshots.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  rename(id: string, newName: string): boolean {
    const snap = this.snapshots.get(id);
    if (!snap) return false;
    this.snapshots.set(id, { ...snap, name: newName });
    return true;
  }

  duplicate(id: string, newName?: string): Snapshot | undefined {
    const original = this.snapshots.get(id);
    if (!original) return undefined;
    const copy: Snapshot = {
      ...original,
      id: createId('snap'),
      name: newName ?? `${original.name} (copy)`,
      createdAt: nowIso(),
    };
    this.snapshots.set(copy.id, copy);
    return copy;
  }

  delete(id: string): boolean {
    return this.snapshots.delete(id);
  }

  compare(idA: string, idB: string): SnapshotDiff | undefined {
    const a = this.snapshots.get(idA);
    const b = this.snapshots.get(idB);
    if (!a || !b) return undefined;

    const summary: string[] = [];
    const runtimeChanged = a.runtimeState !== b.runtimeState;
    const contextChanged = a.contextCategory !== b.contextCategory;
    const relationshipChanged = a.relationshipTrust !== b.relationshipTrust || a.relationshipStage !== b.relationshipStage;
    const memoryDelta = b.memoryCount - a.memoryCount;
    const discoveryDelta = b.discoveryCount - a.discoveryCount;
    const journeyDelta = b.journeyCount - a.journeyCount;
    const notebookDelta = b.notebookPageCount - a.notebookPageCount;

    if (runtimeChanged) summary.push(`Runtime: ${a.runtimeState} → ${b.runtimeState}`);
    if (contextChanged) summary.push(`Context: ${a.contextCategory} → ${b.contextCategory}`);
    if (relationshipChanged) summary.push(`Relationship: ${a.relationshipStage} (${a.relationshipTrust}) → ${b.relationshipStage} (${b.relationshipTrust})`);
    if (memoryDelta !== 0) summary.push(`Memory: ${a.memoryCount} → ${b.memoryCount} (${memoryDelta > 0 ? '+' : ''}${memoryDelta})`);
    if (discoveryDelta !== 0) summary.push(`Discovery: ${a.discoveryCount} → ${b.discoveryCount} (${discoveryDelta > 0 ? '+' : ''}${discoveryDelta})`);
    if (journeyDelta !== 0) summary.push(`Journey: ${a.journeyCount} → ${b.journeyCount} (${journeyDelta > 0 ? '+' : ''}${journeyDelta})`);
    if (notebookDelta !== 0) summary.push(`Notebook: ${a.notebookPageCount} → ${b.notebookPageCount} (${notebookDelta > 0 ? '+' : ''}${notebookDelta})`);

    return { runtimeChanged, contextChanged, relationshipChanged, memoryDelta, discoveryDelta, journeyDelta, notebookDelta, summary };
  }

  exportSnapshot(id: string): string | undefined {
    const snap = this.snapshots.get(id);
    return snap ? JSON.stringify(snap, null, 2) : undefined;
  }

  importSnapshot(json: string): Snapshot | undefined {
    try {
      const data = JSON.parse(json) as Snapshot;
      const snapshot: Snapshot = {
        ...data,
        id: createId('snap'),
        createdAt: nowIso(),
      };
      this.snapshots.set(snapshot.id, snapshot);
      return snapshot;
    } catch {
      return undefined;
    }
  }
}
