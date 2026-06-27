export type ResetType = 'runtime' | 'module' | 'validation' | 'full';

export interface Snapshot {
  id: string;
  name: string;
  description?: string;
  runtimeState: string;
  contextCategory: string;
  relationshipTrust: number;
  relationshipStage: string;
  memoryCount: number;
  discoveryCount: number;
  journeyCount: number;
  notebookPageCount: number;
  reflectionCount: number;
  notificationQueueSize: number;
  characterState: Record<string, unknown>;
  createdAt: string;
}

export interface SeedData {
  id: string;
  name: string;
  description: string;
  category: string;
  components: SeedComponent[];
}

export interface SeedComponent {
  type: string;
  data: Record<string, unknown>;
}

export interface SnapshotDiff {
  runtimeChanged: boolean;
  contextChanged: boolean;
  relationshipChanged: boolean;
  memoryDelta: number;
  discoveryDelta: number;
  journeyDelta: number;
  notebookDelta: number;
  summary: string[];
}
