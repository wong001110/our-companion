export type ContextCategory =
  | 'working'
  | 'learning'
  | 'relaxing'
  | 'gaming'
  | 'meeting'
  | 'away'
  | 'sleeping'
  | 'unknown';

export interface ContextState {
  category: ContextCategory;
  confidence: number;
  startedAt: string;
  lastUpdated: string;
  expiresAt?: string;
  signals: ContextSignal[];
}

export interface ContextSignal {
  source: string;
  type: string;
  value: string;
  confidence: number;
  timestamp: string;
}

export interface ContextDetectorInput {
  activeWindow?: string;
  runningTasks?: string[];
  keyboardActive?: boolean;
  lastInputAt?: string;
  localTime?: string;
  calendarEvent?: boolean;
  screenSharing?: boolean;
  fullscreenApp?: boolean;
}

export const CONTEXT_PRIORITY: Record<ContextCategory, number> = {
  meeting: 70,
  working: 60,
  learning: 50,
  gaming: 40,
  relaxing: 30,
  away: 20,
  sleeping: 10,
  unknown: 0,
};

export const CONTEXT_STABILIZATION_MS = 10_000;
export const CONTEXT_EXPIRY_MS = 300_000;
