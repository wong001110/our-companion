import { z } from 'zod';
import type {
  CompanionDecision,
  CompanionInsight,
  CuriosityAssessment,
  CuriosityTarget,
  DiscoveryReason,
  DiscoveryUnderstanding,
  Insight,
  MemorySummary,
  ToolIntent
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
  tags: z.array(z.string())
});

export const memorySummarySchema = z.object({
  type: z.enum(['topic', 'discovery', 'resource', 'question', 'decision', 'outcome']),
  title: z.string(),
  summary: z.string(),
  importance_score: z.number().min(0).max(100)
});

export const toolIntentSchema = z.object({
  tool_name: z.enum(['open_url', 'open_app', 'search_web', 'browser_navigation', 'none']),
  args: z.record(z.unknown()),
  requires_confirmation: z.boolean(),
  user_facing_summary: z.string()
});

export const actionStepSchema = z.object({
  tool_name: z.enum(['open_url', 'open_app', 'search_web', 'browser_navigation', 'none']),
  args: z.record(z.unknown()),
  required_scopes: z.array(z.string()).optional()
});

export const actionPlanSchema = z.object({
  summary: z.string(),
  steps: z.array(actionStepSchema),
  requires_confirmation: z.boolean().optional()
});

export type ActionPlanLlmResult = z.infer<typeof actionPlanSchema>;

export function validateActionPlan(raw: string): ActionPlanLlmResult | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = actionPlanSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
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
  title: z.string(),
  explanation: z.string(),
  related_concepts: z.array(z.string()),
  growth_value: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1)
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
  action: z.enum(['speak', 'queue_for_later', 'remember_only', 'ignore', 'perform_action', 'stay_silent']),
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
  whyAnnFoundIt: z.string(),
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
  return toolIntentSchema.parse(parseJsonObject(text));
}

export function validateCuriosityTargets(text: string): Array<Partial<CuriosityTarget> & Pick<CuriosityTarget, 'topic' | 'description' | 'source' | 'explorationType' | 'priority' | 'confidence' | 'reason' | 'expectedValue'>> {
  const parsed = parseJsonObject(text);
  const list = Array.isArray(parsed) ? parsed : z.object({ targets: z.array(curiosityTargetSchema) }).parse(parsed).targets;
  return z.array(curiosityTargetSchema).parse(list);
}

export function validateDiscoveryUnderstanding(text: string): DiscoveryUnderstanding {
  return discoveryUnderstandingSchema.parse(parseJsonObject(text));
}

export function validateCognitiveInsight(text: string): Pick<Insight, 'title' | 'explanation' | 'growthValue' | 'confidence'> & { relatedConcepts: string[] } {
  const parsed = cognitiveInsightSchema.parse(parseJsonObject(text));
  return {
    title: parsed.title,
    explanation: parsed.explanation,
    relatedConcepts: parsed.related_concepts,
    growthValue: parsed.growth_value,
    confidence: parsed.confidence
  };
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

export function validateCompanionInsights(text: string): Array<Partial<CompanionInsight> & Pick<CompanionInsight, 'title' | 'type' | 'summary' | 'insight' | 'whyItMatters' | 'whyAnnFoundIt' | 'confidence' | 'novelty' | 'emotionalRelevance' | 'practicalRelevance' | 'supportingCandidateIds'>> {
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
