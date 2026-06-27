export type OverlaySection =
  | 'runtime'
  | 'context'
  | 'behavior'
  | 'attention'
  | 'initiative'
  | 'presence'
  | 'conversation'
  | 'discovery'
  | 'journey'
  | 'relationship'
  | 'notebook'
  | 'memory'
  | 'notification';

export interface OverlayConfig {
  visible: boolean;
  sections: OverlaySection[];
  docked: boolean;
  compact: boolean;
}

export interface OverlaySnapshot {
  runtime: Record<string, unknown>;
  context: Record<string, unknown>;
  behavior: Record<string, unknown>;
  attention: Record<string, unknown>;
  initiative: Record<string, unknown>;
  presence: Record<string, unknown>;
  conversation: Record<string, unknown>;
  discovery: Record<string, unknown>;
  journey: Record<string, unknown>;
  relationship: Record<string, unknown>;
  notebook: Record<string, unknown>;
  memory: Record<string, unknown>;
  notification: Record<string, unknown>;
  timestamp: string;
}

export interface DecisionTraceEntry {
  id: string;
  timestamp: string;
  inputs: Record<string, unknown>;
  candidates: string[];
  selected: string;
  rejected: string[];
  reason: string;
}
