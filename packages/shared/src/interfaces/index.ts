import type {
  ActionPermissionState,
  CaptureSignalInput,
  Concept,
  NormalizedSignal,
  PermissionScope,
  Signal,
} from '../models';
import type { ActionPlanV2, ActionResult, PerformanceScriptV2 } from '../index';

export interface SignalEngine {
  capture(input: CaptureSignalInput): Promise<Signal>;
  normalize(signal: Signal): Promise<NormalizedSignal>;
}

export interface ConceptMatchInput {
  name: string;
  summary?: string;
  topics?: string[];
  entities?: string[];
  discoveryId?: string;
}

export type ConceptMatchResult =
  | { type: 'created'; concept: Concept }
  | { type: 'matched'; concept: Concept };

export interface ConceptMatcher {
  match(input: ConceptMatchInput, existing: Concept[]): ConceptMatchResult;
}

export interface MemoryReader<TMemory = unknown> {
  listRecent(limit?: number): Promise<TMemory[]>;
}

export interface KnowledgeReader<TKnowledge = unknown> {
  findByConcept(conceptKey: string): Promise<TKnowledge[]>;
}

export interface LlmTextRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface LlmJsonRequest extends LlmTextRequest {
  schemaName?: string;
}

export interface LlmProvider {
  completeJson<T>(request: LlmJsonRequest): Promise<T>;
  completeText(request: LlmTextRequest): Promise<string>;
}

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingResult {
  vectors: number[][];
  model?: string;
}

export interface EmbeddingProvider {
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}

export interface SourceFetchRequest {
  query?: string;
  url?: string;
  limit?: number;
  metadata?: Record<string, unknown>;
}

export interface SourceItem {
  title: string;
  summary?: string;
  url?: string;
  raw?: unknown;
  metadata?: Record<string, unknown>;
}

export interface SourceProvider {
  readonly name: string;
  fetch(request: SourceFetchRequest): Promise<SourceItem[]>;
}

export interface CommandExecutionRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  requiresConfirmation?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CommandExecutionResult {
  status: 'executed' | 'blocked' | 'failed' | 'preview_required';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  result?: unknown;
  errorMessage?: string;
}

export interface CommandExecutor {
  preview?(request: CommandExecutionRequest): Promise<CommandExecutionResult>;
  execute(request: CommandExecutionRequest): Promise<CommandExecutionResult>;
}

// Volume 05 — Desktop Action & Automation

export interface ActionPlanner {
  plan(text: string): ActionPlanV2 | undefined;
}

export interface PermissionManager {
  resolve(plan: ActionPlanV2, stored: ActionPermissionState): PermissionScope[] | 'ok' | 'denied';
}

export interface ActionOrchestratorDeps {
  executeStep(toolName: string, args: Record<string, unknown>): Promise<{ status: string; errorMessage?: string; blockedReason?: string }>;
  emitEvent(type: string, payload?: Record<string, unknown>, correlationId?: string): void;
  getPermissions(): ActionPermissionState;
  directPerformance(actionId: string, outcome: 'success' | 'failure'): PerformanceScriptV2;
  broadcastPerformance(script: PerformanceScriptV2): void;
}

export interface ActionOrchestrator {
  run(plan: ActionPlanV2, deps: ActionOrchestratorDeps): Promise<ActionResult>;
}
