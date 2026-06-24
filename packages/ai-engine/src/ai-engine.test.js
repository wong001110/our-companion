import { describe, expect, it } from 'vitest';
import { getConfiguredModel, normalizeDeepSeekEndpoint, normalizeDeepSeekModel, validateDiscoveryReason, validateMemorySummary, validateToolIntent } from './index';
describe('ai engine', () => {
    it('uses configurable model with API default', () => {
        expect(getConfiguredModel({})).toBe('deepseek-v4-flash');
        expect(getConfiguredModel({ DEEPSEEK_MODEL: 'custom-model' })).toBe('custom-model');
    });
    it('normalizes DeepSeek model display aliases and endpoints', () => {
        expect(normalizeDeepSeekModel('DeepSeek V4 Flash')).toBe('deepseek-v4-flash');
        expect(normalizeDeepSeekEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/chat/completions');
        expect(normalizeDeepSeekEndpoint('https://api.deepseek.com/chat/completions')).toBe('https://api.deepseek.com/chat/completions');
    });
    it('validates discovery reason JSON', () => {
        const parsed = validateDiscoveryReason('{"why_this_matters":"Useful","recommended_action":"view","short_message":"Look","tags":["ux"]}');
        expect(parsed.recommended_action).toBe('view');
    });
    it('validates memory summary JSON', () => {
        const parsed = validateMemorySummary('{"type":"topic","title":"PixiJS","summary":"Notes","importance_score":50}');
        expect(parsed.type).toBe('topic');
    });
    it('validates tool intent JSON', () => {
        const parsed = validateToolIntent('{"tool_name":"search_web","args":{"query":"PixiJS"},"requires_confirmation":false,"user_facing_summary":"Search"}');
        expect(parsed.tool_name).toBe('search_web');
    });
});
