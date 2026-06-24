import { z } from 'zod';
import type { DiscoveryReason, MemorySummary, ToolIntent } from '@our-companion/shared';

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

export interface DeepSeekClientOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
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
    if (!this.apiKey) {
      return 'I am running in local demo mode because no DeepSeek API key is configured.';
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }
}
