import type { ContextCategory } from '../context/types';

export type BehaviorCategory =
  | 'observe'
  | 'wait'
  | 'interact'
  | 'recommend'
  | 'reflect'
  | 'organize'
  | 'explore'
  | 'rest';

export interface BehaviorRequest {
  id: string;
  category: BehaviorCategory;
  source: string;
  priority: number;
  reason: string;
  payload?: unknown;
  requestedAt: string;
}

export interface BehaviorSelection {
  category: BehaviorCategory;
  reason: string;
  confidence: number;
  cooldownKey: string;
}

export interface BehaviorCooldown {
  category: BehaviorCategory;
  expiresAt: string;
}

export const BEHAVIOR_PRIORITY: Record<BehaviorCategory, number> = {
  observe: 90,
  interact: 80,
  rest: 70,
  recommend: 60,
  explore: 50,
  reflect: 40,
  organize: 30,
  wait: 20,
};

export const CONTEXT_BEHAVIOR_MAP: Partial<Record<ContextCategory, BehaviorCategory[]>> = {
  working: ['observe', 'wait'],
  learning: ['observe', 'recommend'],
  relaxing: ['recommend', 'interact'],
  gaming: ['observe', 'wait'],
  meeting: ['observe', 'wait'],
  away: ['observe', 'organize', 'explore'],
  sleeping: ['rest'],
  unknown: ['observe'],
};

export const DEFAULT_COOLDOWN_MS: Record<BehaviorCategory, number> = {
  observe: 0,
  wait: 60_000,
  interact: 30_000,
  recommend: 3_600_000,
  reflect: 3_600_000,
  organize: 7_200_000,
  explore: 1_800_000,
  rest: 300_000,
};
