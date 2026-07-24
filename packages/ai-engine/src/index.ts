import { z } from 'zod';
import type {
  ActionPlan,
  CompanionTurnProposal,
  CompanionDecision,
  CompanionInsight,
  CuriosityAssessment,
  CuriosityTarget,
  DiscoveryReason,
  DiscoveryUnderstanding,
  Insight,
  GeneratedInsight,
  MemorySummary,
  ToolIntent
} from '@our-companion/shared';
import {
  getActionCapability,
  validateActionCapabilityArgs,
} from '@our-companion/shared';

export const deepSeekDefaultModel = 'deepseek-v4-flash';
export const deepSeekDefaultEndpoint = 'https://api.deepseek.com';
const deepSeekChatPath = '/chat/completions';

export function getConfiguredModel(env: Pick<NodeJS.ProcessEnv, string> = process.env): string {
  return normalizeDeepSeekModel(env.DEEPSEEK_MODEL || deepSeekDefaultModel);
}

export function normalizeDeepSeekModel(model: string): string {
  const trimmed = model.trim();
  const aliases: Record<string, string> = {
    'DeepSeek V4 Flash': 'deepseek-v4-flash',
    'deepseek v4 flash': 'deepseek-v4-flash',
    'DeepSeek V4 Pro': 'deepseek-v4-pro',
    'deepseek v4 pro': 'deepseek-v4-pro'
  };
  return aliases[trimmed] ?? trimmed;
}

export function normalizeDeepSeekEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (!trimmed) return `${deepSeekDefaultEndpoint}${deepSeekChatPath}`;
  if (trimmed.endsWith(deepSeekChatPath)) return trimmed;
  return `${trimmed}${deepSeekChatPath}`;
}

export const discoveryReasonSchema = z.object({
  why_this_matters: z.string(),
  recommended_action: z.enum(['view', 'save', 'ignore', 'add_to_journey']),
  short_message: z.string(),
  card_title: z.string().optional(),
  card_body: z.string().optional(),
  tags: z.array(z.string())
});

export const memorySummarySchema = z.object({
  type: z.enum(['topic', 'discovery', 'resource', 'question', 'decision', 'outcome']),
  title: z.string(),
  summary: z.string(),
  importance_score: z.number().min(0).max(100)
});

export const toolIntentSchema = z.object({
  tool_name: z.string(),
  args: z.record(z.unknown()),
  requires_confirmation: z.boolean(),
  user_facing_summary: z.string()
}).superRefine((intent, context) => {
  if (intent.tool_name === 'none') {
    if (Object.keys(intent.args).length > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'none cannot include arguments' });
    }
    return;
  }
  const validated = validateActionCapabilityArgs(intent.tool_name, intent.args);
  if (!validated.ok) context.addIssue({ code: z.ZodIssueCode.custom, message: validated.reason });
});

export const actionStepSchema = z.object({
  id: z.string().optional(),
  toolName: z.string(),
  args: z.record(z.unknown()),
  waitMs: z.number().optional(),
  requiredScopes: z.array(z.string()).optional()
}).superRefine((step, context) => {
  const validated = validateActionCapabilityArgs(step.toolName, step.args);
  if (!validated.ok) context.addIssue({ code: z.ZodIssueCode.custom, message: validated.reason });
});

export const actionPlanSchema = z.object({
  id: z.string().optional(),
  intentId: z.string().optional(),
  steps: z.array(actionStepSchema),
  requiredPermissions: z.array(z.string()).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  confirmationRequired: z.boolean(),
  status: z.enum(['draft', 'pending_confirmation', 'approved', 'running', 'completed', 'failed', 'cancelled']).optional()
});

export const companionTurnProposalSchema = z.object({
  intent: z.enum(['conversation', 'action', 'conversation_and_action', 'cannot_complete']),
  replySegments: z.array(z.object({
    segmentId: z.string().min(1).max(100),
    text: z.string().min(1).max(1_000),
    provenance: z.enum(['current_turn', 'general_knowledge', 'memory']),
    supportingMemoryId: z.string().min(1).max(200).refine((id) => !/[\s,;]/.test(id), 'Memory IDs must be a single token.').optional(),
  }).strict().superRefine((segment, context) => {
    if (segment.provenance === 'memory' && !segment.supportingMemoryId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Memory segments require supportingMemoryId.' });
    if (segment.provenance !== 'memory' && segment.supportingMemoryId !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only memory segments may cite a Memory ID.' });
  })).min(1).max(24)
    .refine((segments) => new Set(segments.map((segment) => segment.segmentId)).size === segments.length, 'Reply segment IDs must be unique.'),
  actions: z.array(z.object({
    toolName: z.string().min(1).max(80),
    args: z.record(z.unknown()),
    reason: z.string().max(500),
  }).strict()).max(4),
  memoryCandidates: z.array(z.object({
    type: z.enum(['user_preference', 'user_fact', 'user_boundary', 'goal']),
    summary: z.string().min(1).max(500),
    evidence: z.string().min(1).max(1_000),
    confidence: z.number().min(0).max(1),
  }).strict()).max(6),
}).strict().superRefine((proposal, context) => {
  const actionIntent = proposal.intent === 'action' || proposal.intent === 'conversation_and_action';
  if (actionIntent !== (proposal.actions.length > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Turn intent and actions must agree.',
    });
  }
});

/**
 * Strictly validates a structured turn. The only repair attempted is extracting
 * one JSON object from provider wrapper text; no action or memory fields are
 * inferred from invalid output.
 */
export function validateCompanionTurnProposal(text: string): CompanionTurnProposal | undefined {
  try {
    const parsed = companionTurnProposalSchema.safeParse(parseJsonObject(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export type ActionPlanLlmResult = z.infer<typeof actionPlanSchema>;

export function validateActionPlan(raw: string): ActionPlan | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    const source = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    const sourceSteps = Array.isArray(source.steps) ? source.steps : [];
    const usesSnakeCase = 'requires_confirmation' in source
      || sourceSteps.some((step) => step && typeof step === 'object' && 'tool_name' in step);
    const canonicalInput = usesSnakeCase
      ? {
          steps: sourceSteps.map((step) => {
            const value = step as Record<string, unknown>;
            return {
              toolName: value.tool_name,
              args: value.args,
              requiredScopes: value.required_scopes,
            };
          }),
          confirmationRequired: source.requires_confirmation ?? false,
        }
      : parsed;
    const result = actionPlanSchema.safeParse(canonicalInput);
    if (!result.success) return undefined;
    const data = result.data;
    const steps = data.steps.map((step) => {
      const capability = getActionCapability(step.toolName);
      const validated = validateActionCapabilityArgs(step.toolName, step.args);
      if (!capability?.enabled || !validated.ok) return undefined;
      return {
        id: step.id ?? '',
        toolName: capability.toolName,
        args: validated.args,
        waitMs: step.waitMs,
        requiredScopes: [...capability.requiredScopes],
      };
    });
    if (steps.some((step) => !step)) return undefined;
    const capabilities = steps.map((step) => getActionCapability(step?.toolName));
    const riskRank = { low: 0, medium: 1, high: 2 } as const;
    const canonicalRisk = capabilities.reduce<'low' | 'medium' | 'high'>(
      (highest, capability) => capability && riskRank[capability.riskLevel] > riskRank[highest]
        ? capability.riskLevel
        : highest,
      'low',
    );
    return {
      id: data.id ?? '',
      intentId: data.intentId ?? '',
      steps: steps as ActionPlan['steps'],
      requiredPermissions: [...new Set(steps.flatMap((step) => step?.requiredScopes ?? []))],
      riskLevel: canonicalRisk,
      confirmationRequired: data.confirmationRequired
        || capabilities.some((capability) => capability?.requiresConfirmationByDefault),
      status: data.status ?? 'draft'
    };
  } catch {
    return undefined;
  }
}

export const curiosityTargetSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  companionId: z.string().optional(),
  topic: z.string(),
  description: z.string(),
  source: z.enum([
    'memory_trigger',
    'pattern_trigger',
    'journey_trigger',
    'novelty_trigger',
    'contradiction_trigger',
    'relationship_trigger',
    'character_trigger'
  ]),
  explorationType: z.enum(['similar', 'adjacent', 'opposite', 'deepening', 'challenge', 'practical']),
  priority: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  expectedValue: z.string(),
  relatedMemoryIds: z.array(z.string()).optional(),
  relatedPatternIds: z.array(z.string()).optional(),
  relatedInterestNodeIds: z.array(z.string()).optional(),
  createdAt: z.string().optional()
});

export const discoveryUnderstandingSchema = z.object({
  summary: z.string(),
  concepts: z.array(z.string()),
  entities: z.array(z.string()),
  tags: z.array(z.string()),
  growth_value: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

export const cognitiveInsightSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  category: z.enum(['interest', 'learning', 'productivity', 'project', 'behaviour', 'relationship', 'discovery', 'risk']),
  title: z.string(),
  summary: z.string(),
  explanation: z.string(),
  supportingPatternIds: z.array(z.string()).optional(),
  supportingMemoryIds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  evidenceCount: z.number().min(0).optional()
});

export const curiosityAssessmentSchema = z.object({
  target_id: z.string(),
  target_type: z.string(),
  growth_value: z.number().min(0).max(100),
  budget_cost: z.number().min(0),
  gap_match: z
    .object({
      gap_id: z.string(),
      strength: z.number().min(0).max(1),
      reason: z.string()
    })
    .optional(),
  reason: z.string()
});

export const decisionSchema = z.object({
  action: z.enum([
    'stay_silent',
    'idle_activity',
    'respond',
    'approach',
    'share_discovery',
    'start_exploration',
    'continue_conversation',
    'end_conversation',
    'suggest_action',
    'execute_approved_action'
  ]),
  timing: z.enum(['now', 'next_idle', 'later']),
  priority: z.enum(['low', 'normal', 'high']),
  reason: z.string()
});

export const companionInsightSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  companionId: z.string().optional(),
  title: z.string(),
  type: z.enum([
    'observation',
    'pattern',
    'hypothesis',
    'question',
    'opportunity',
    'warning',
    'contradiction',
    'practical_next_step'
  ]),
  summary: z.string(),
  insight: z.string(),
  whyItMatters: z.string(),
  whyCompanionFoundIt: z.string(),
  confidence: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  emotionalRelevance: z.number().min(0).max(1),
  practicalRelevance: z.number().min(0).max(1),
  supportingCandidateIds: z.array(z.string()),
  relatedMemoryIds: z.array(z.string()).optional(),
  relatedPatternIds: z.array(z.string()).optional(),
  suggestedQuestion: z.string().optional(),
  suggestedAction: z.string().optional(),
  narration: z.string().optional(),
  createdAt: z.string().optional()
});

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error('AI response did not contain a JSON object.');
  }
  return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
}

export function validateDiscoveryReason(text: string): DiscoveryReason {
  return discoveryReasonSchema.parse(parseJsonObject(text));
}

export function validateMemorySummary(text: string): MemorySummary {
  return memorySummarySchema.parse(parseJsonObject(text));
}

export function validateToolIntent(text: string): ToolIntent {
  const parsed = toolIntentSchema.parse(parseJsonObject(text));
  if (parsed.tool_name === 'none') return parsed as ToolIntent;
  const capability = getActionCapability(parsed.tool_name);
  const validated = validateActionCapabilityArgs(parsed.tool_name, parsed.args);
  if (!capability?.enabled || !validated.ok) throw new Error('ACTION_CAPABILITY_NOT_AVAILABLE');
  return {
    ...parsed,
    tool_name: capability.toolName,
    args: validated.args,
    requires_confirmation: parsed.requires_confirmation || capability.requiresConfirmationByDefault,
  };
}

export function validateCuriosityTargets(text: string): Array<Partial<CuriosityTarget> & Pick<CuriosityTarget, 'topic' | 'description' | 'source' | 'explorationType' | 'priority' | 'confidence' | 'reason' | 'expectedValue'>> {
  const parsed = parseJsonObject(text);
  const list = Array.isArray(parsed) ? parsed : z.object({ targets: z.array(curiosityTargetSchema) }).parse(parsed).targets;
  return z.array(curiosityTargetSchema).parse(list);
}

export function validateDiscoveryUnderstanding(text: string): DiscoveryUnderstanding {
  return discoveryUnderstandingSchema.parse(parseJsonObject(text));
}

export function validateCognitiveInsight(text: string): Pick<GeneratedInsight, 'title' | 'explanation' | 'confidence' | 'importance' | 'novelty' | 'category' | 'summary'> & { supportingPatternIds: string[]; supportingMemoryIds: string[] } {
  const parsed = cognitiveInsightSchema.parse(parseJsonObject(text));
  return {
    id: parsed.id ?? '',
    userId: parsed.userId ?? '',
    category: parsed.category as GeneratedInsight['category'],
    title: parsed.title,
    summary: parsed.summary,
    explanation: parsed.explanation,
    supportingPatternIds: parsed.supportingPatternIds ?? [],
    supportingMemoryIds: parsed.supportingMemoryIds ?? [],
    confidence: parsed.confidence,
    importance: parsed.importance,
    novelty: parsed.novelty,
    evidenceCount: parsed.evidenceCount ?? 0
  } as Pick<GeneratedInsight, 'title' | 'explanation' | 'confidence' | 'importance' | 'novelty' | 'category' | 'summary'> & { supportingPatternIds: string[]; supportingMemoryIds: string[] };
}

export function validateCuriosityAssessment(text: string): Pick<CuriosityAssessment, 'targetId' | 'targetType' | 'growthValue' | 'budgetCost' | 'reason'> & { gapMatch?: CuriosityAssessment['gapMatch'] } {
  const parsed = curiosityAssessmentSchema.parse(parseJsonObject(text));
  return {
    targetId: parsed.target_id,
    targetType: parsed.target_type as CuriosityAssessment['targetType'],
    growthValue: parsed.growth_value,
    budgetCost: parsed.budget_cost,
    gapMatch: parsed.gap_match
      ? {
          gapId: parsed.gap_match.gap_id,
          strength: parsed.gap_match.strength,
          reason: parsed.gap_match.reason
        }
      : undefined,
    reason: parsed.reason
  };
}

export function validateDecision(text: string): Pick<CompanionDecision, 'action' | 'timing' | 'priority' | 'reason'> {
  return decisionSchema.parse(parseJsonObject(text));
}

export function validateCompanionInsights(text: string): Array<Partial<CompanionInsight> & Pick<CompanionInsight, 'title' | 'type' | 'summary' | 'insight' | 'whyItMatters' | 'whyCompanionFoundIt' | 'confidence' | 'novelty' | 'emotionalRelevance' | 'practicalRelevance' | 'supportingCandidateIds'>> {
  const parsed = parseJsonObject(text);
  const list = Array.isArray(parsed) ? parsed : z.object({ insights: z.array(companionInsightSchema) }).parse(parsed).insights;
  return z.array(companionInsightSchema).parse(list);
}

export interface DeepSeekClientOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
}

export class DeepSeekRequestError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly requestBody: unknown;
  readonly responseBody: unknown;

  constructor(input: {
    status: number;
    statusText: string;
    requestBody: unknown;
    responseBody: unknown;
  }) {
    super(`DeepSeek request failed: ${input.status} ${input.statusText}`);
    this.name = 'DeepSeekRequestError';
    this.status = input.status;
    this.statusText = input.statusText;
    this.requestBody = input.requestBody;
    this.responseBody = input.responseBody;
  }
}

export class DeepSeekClient {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(options: DeepSeekClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
    this.model = normalizeDeepSeekModel(options.model ?? getConfiguredModel());
    this.endpoint = normalizeDeepSeekEndpoint(options.endpoint ?? process.env.DEEPSEEK_ENDPOINT ?? deepSeekDefaultEndpoint);
  }

  async chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    const { content } = await this.chatDebug(messages);
    return content;
  }

  async chatDebug(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<{
    content: string;
    raw: unknown;
    requestBody: unknown;
  }> {
    const requestBody = { model: this.model, messages, temperature: 0.4 };

    if (!this.apiKey) {
      return {
        content: 'I am running in local demo mode because no DeepSeek API key is configured.',
        raw: { demo: true },
        requestBody
      };
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new DeepSeekRequestError({
        status: response.status,
        statusText: response.statusText,
        requestBody,
        responseBody: await parseResponseBody(response)
      });
    }

    const raw = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = raw.choices?.[0]?.message?.content ?? '';
    return { content, raw, requestBody };
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
