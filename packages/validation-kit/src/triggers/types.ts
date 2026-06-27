export type TriggerCategory =
  | 'runtime'
  | 'presence'
  | 'discovery'
  | 'notebook'
  | 'journey'
  | 'relationship'
  | 'memory'
  | 'notification'
  | 'conversation';

export interface TriggerConfig {
  category: TriggerCategory;
  eventType: string;
  params?: Record<string, unknown>;
  delayMs?: number;
  repeatCount?: number;
  repeatIntervalMs?: number;
}

export interface TriggerResult {
  id: string;
  category: TriggerCategory;
  eventType: string;
  success: boolean;
  executedAt: string;
  params?: Record<string, unknown>;
  error?: string;
}

export interface TriggerHistoryEntry {
  id: string;
  config: TriggerConfig;
  result: TriggerResult;
  timestamp: string;
}

export interface EventChain {
  id: string;
  name: string;
  description: string;
  steps: TriggerConfig[];
}

export interface Macro {
  id: string;
  name: string;
  description: string;
  chain: EventChain;
  category: string;
  createdAt: string;
}
