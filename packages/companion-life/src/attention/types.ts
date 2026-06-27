export type AttentionLevel = 'primary' | 'secondary' | 'passive' | 'ignored';

export type AttentionTargetType =
  | 'user'
  | 'conversation'
  | 'discovery'
  | 'journey'
  | 'memory'
  | 'reflection'
  | 'notebook'
  | 'background_task';

export interface AttentionTarget {
  id: string;
  type: AttentionTargetType;
  level: AttentionLevel;
  priority: number;
  startedAt: string;
  lastUpdatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AttentionManagerState {
  primary?: AttentionTarget;
  secondaries: AttentionTarget[];
  passives: AttentionTarget[];
}

export const ATTENTION_PRIORITY: Record<AttentionTargetType, number> = {
  user: 100,
  conversation: 90,
  journey: 70,
  discovery: 60,
  reflection: 50,
  notebook: 40,
  memory: 30,
  background_task: 20,
};
