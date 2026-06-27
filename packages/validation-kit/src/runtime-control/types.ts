export type RuntimeMode = 'normal' | 'paused' | 'step' | 'slow_motion' | 'fast_forward';

export interface Breakpoint {
  id: string;
  eventType: string;
  enabled: boolean;
  hitCount: number;
  createdAt: string;
}

export interface QueueState {
  name: string;
  paused: boolean;
  length: number;
  items: unknown[];
}

export interface RuntimeControlState {
  mode: RuntimeMode;
  speed: number;
  tickCount: number;
  breakpoints: Breakpoint[];
  queues: QueueState[];
  lastTickAt: string;
}
