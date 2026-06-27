export type SimulationCategory =
  | 'time'
  | 'relationship'
  | 'context'
  | 'runtime'
  | 'journey'
  | 'discovery'
  | 'memory'
  | 'notebook';

export interface TimeAdvance {
  minutes?: number;
  hours?: number;
  days?: number;
  customDate?: string;
}

export interface RelationshipOverride {
  trustScore?: number;
  stage?: string;
  sharedExperienceCount?: number;
}

export interface ContextOverride {
  category: string;
  confidence?: number;
}

export interface RuntimeOverride {
  state: string;
}

export interface SimulationConfig {
  category: SimulationCategory;
  params: Record<string, unknown>;
}

export interface SimulationResult {
  success: boolean;
  category: SimulationCategory;
  description: string;
  affectedSystems: string[];
  timestamp: string;
}

export interface SimulationSnapshot {
  id: string;
  name: string;
  currentTime: string;
  runtimeState: string;
  contextCategory: string;
  relationshipTrust: number;
  memoryCount: number;
  discoveryCount: number;
  journeyCount: number;
  notebookPageCount: number;
  notificationQueueSize: number;
  createdAt: string;
}
