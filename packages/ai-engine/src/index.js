import { z } from 'zod';
export const deepSeekDefaultModel = 'deepseek-v4-flash';
export const deepSeekDefaultEndpoint = 'https://api.deepseek.com';
const deepSeekChatPath = '/chat/completions';
export function getConfiguredModel(env = process.env) {
    return normalizeDeepSeekModel(env.DEEPSEEK_MODEL || deepSeekDefaultModel);
}
export function normalizeDeepSeekModel(model) {
    const trimmed = model.trim();
    const aliases = {
        'DeepSeek V4 Flash': 'deepseek-v4-flash',
        'deepseek v4 flash': 'deepseek-v4-flash',
        'DeepSeek V4 Pro': 'deepseek-v4-pro',
        'deepseek v4 pro': 'deepseek-v4-pro'
    };
    return aliases[trimmed] ?? trimmed;
}
export function normalizeDeepSeekEndpoint(endpoint) {
    const trimmed = endpoint.trim().replace(/\/+$/, '');
    if (!trimmed)
        return `${deepSeekDefaultEndpoint}${deepSeekChatPath}`;
    if (trimmed.endsWith(deepSeekChatPath))
        return trimmed;
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
export function parseJsonObject(text) {
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
        throw new Error('AI response did not contain a JSON object.');
    }
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
}
export function validateDiscoveryReason(text) {
    return discoveryReasonSchema.parse(parseJsonObject(text));
}
export function validateMemorySummary(text) {
    return memorySummarySchema.parse(parseJsonObject(text));
}
export function validateToolIntent(text) {
    return toolIntentSchema.parse(parseJsonObject(text));
}
export class DeepSeekClient {
    apiKey;
    model;
    endpoint;
    constructor(options = {}) {
        this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
        this.model = normalizeDeepSeekModel(options.model ?? getConfiguredModel());
        this.endpoint = normalizeDeepSeekEndpoint(options.endpoint ?? process.env.DEEPSEEK_ENDPOINT ?? deepSeekDefaultEndpoint);
    }
    async chat(messages) {
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
        const data = (await response.json());
        return data.choices?.[0]?.message?.content ?? '';
    }
}
