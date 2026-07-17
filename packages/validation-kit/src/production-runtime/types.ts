import type { SimulationCategory } from '../simulation/types';

export type ProductionExecutionStatus = 'completed' | 'empty' | 'skipped' | 'failed';

export interface ProductionRuntimeCommand {
  category: SimulationCategory;
  params: Record<string, unknown>;
  scenarioId?: string;
}

export interface ProductionRuntimeExecution {
  operation: string;
  status: ProductionExecutionStatus;
  description?: string;
  correlationId?: string;
  traceIds: string[];
  inputRefs?: string[];
  outputRefs?: string[];
  state?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Validation Kit never implements domain transitions itself. The desktop
 * application supplies this port and routes commands to its production
 * orchestration over an isolated database.
 */
export interface ProductionRuntimeGateway {
  execute(command: ProductionRuntimeCommand): Promise<ProductionRuntimeExecution>;
  getState(): Promise<Record<string, unknown>>;
}

export interface Clock {
  now(): number;
  nowIso(): string;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RandomSource {
  next(): number;
}

export type ProviderMode = 'live' | 'mock' | 'fixture' | 'deterministic' | 'unavailable';

export interface DiscoveryProviderInput {
  query?: string;
  limit?: number;
  companionId?: string;
  correlationId?: string;
}

export interface DiscoveryProviderItem {
  id: string;
  title: string;
  summary?: string;
  url?: string;
  tags?: string[];
  source?: string;
  raw?: Record<string, unknown>;
}

export interface DiscoveryProvider {
  readonly mode: ProviderMode;
  search(input: DiscoveryProviderInput): Promise<DiscoveryProviderItem[]>;
}

export interface AiProviderRequest {
  operation: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  input?: Record<string, unknown>;
  correlationId?: string;
}

export interface AiProvider {
  readonly mode: ProviderMode;
  complete<T = unknown>(request: AiProviderRequest): Promise<T>;
}

export interface ToolAdapters {
  openUrl(url: string): Promise<unknown>;
  openApp(appName: string): Promise<unknown>;
  searchWeb(query: string, target?: string): Promise<unknown>;
  browserNavigation(action: string, url?: string): Promise<unknown>;
}

export interface RendererCommand {
  id: string;
  companionId: string;
  kind: string;
  payload?: Record<string, unknown>;
}

export type RendererAckStatus = 'received' | 'started' | 'completed' | 'cancelled' | 'failed';

export interface RendererAcknowledgement {
  commandId: string;
  status: RendererAckStatus;
  reportedAt: string;
  reason?: string;
}

export interface RendererGateway {
  dispatch(command: RendererCommand): Promise<RendererAcknowledgement>;
}
