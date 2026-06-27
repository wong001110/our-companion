import type { AppContext } from './appContext';
import type { AiSettings, UpdateAiSettingsInput, ChatInput, NormalizedDiscovery, AiDebugEntry, CompanionReplyLanguage, UiLang, CompanionSessionPhase } from '@our-companion/shared';
import { DEFAULT_CHARACTER_ID, COMPANION_CHAT_CONTEXT_LIMIT } from '@our-companion/shared';
import {
  DeepSeekClient,
  DeepSeekRequestError,
  deepSeekDefaultEndpoint,
  getConfiguredModel,
  normalizeDeepSeekEndpoint,
  normalizeDeepSeekModel,
  validateDiscoveryReason
} from '@our-companion/ai-engine';

interface StoredAiSettings {
  model?: string;
  endpoint?: string;
  apiKey?: string;
}

const AI_SETTINGS_KEY = 'ai.deepseek';
const DEBUG_LOG_MAX = 100;

export class AiApplicationService {
  private debugLog: AiDebugEntry[] = [];
  private companionSessionPhase: CompanionSessionPhase = 'idle';

  constructor(private readonly ctx: AppContext) {}

  getSettings = (): AiSettings => {
    const stored = this.getStoredAiSettings();
    const replyLanguage = (this.ctx.db.getAppSetting<CompanionReplyLanguage>('ai.replyLanguage') ?? 'en') as CompanionReplyLanguage;
    const uiLang = (this.ctx.db.getAppSetting<UiLang>('ui.lang') ?? 'en') as UiLang;
    return {
      provider: 'deepseek',
      model: normalizeDeepSeekModel(stored.model || getConfiguredModel()),
      endpoint: stored.endpoint || process.env.DEEPSEEK_ENDPOINT || deepSeekDefaultEndpoint,
      apiKeyConfigured: Boolean(stored.apiKey || process.env.DEEPSEEK_API_KEY),
      replyLanguage,
      uiLang
    };
  };

  updateSettings = (input: UpdateAiSettingsInput): AiSettings => {
    const existing = this.getStoredAiSettings();
    const next: StoredAiSettings = { ...existing };
    const model = input.model?.trim();
    const endpoint = input.endpoint?.trim();
    const apiKey = input.apiKey?.trim();

    if (model) next.model = normalizeDeepSeekModel(model);
    if (endpoint) next.endpoint = endpoint;
    if (input.clearApiKey) {
      delete next.apiKey;
    } else if (apiKey) {
      next.apiKey = apiKey;
    }
    if (input.replyLanguage) this.ctx.db.setAppSetting('ai.replyLanguage', input.replyLanguage);
    if (input.uiLang) this.ctx.db.setAppSetting('ui.lang', input.uiLang);

    this.ctx.db.setAppSetting(AI_SETTINGS_KEY, next);
    return this.getSettings();
  };

  chat = async (input: ChatInput) => {
    const characterId = input.characterId ?? DEFAULT_CHARACTER_ID;
    const builtMessages = this.buildChatMessages(characterId, input.message);
    this.ctx.db.insertCompanionMessage({ role: 'user', content: input.message, source: 'panel', characterId });
    try {
      const { content: message, raw, requestBody } = await this.createDeepSeekClient().chatDebug(builtMessages);
      this.pushDebugEntry({
        channel: 'chat',
        source: 'panel',
        status: 'success',
        requestMessages: builtMessages,
        requestBody,
        rawResponse: raw,
        content: message
      });
      this.ctx.db.insertCompanionMessage({ role: 'assistant', content: message, source: 'panel', characterId });
      return { message };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushDebugEntry({
        channel: 'chat',
        source: 'panel',
        status: 'error',
        requestMessages: builtMessages,
        requestBody: getDebugRequestBody(error),
        rawResponse: getDebugResponseBody(error),
        content: '',
        error: message
      });
      const reply = `DeepSeek request failed. Check Settings > model, endpoint, and API key. Details: ${message}`;
      this.ctx.db.insertCompanionMessage({
        role: 'assistant',
        content: reply,
        source: 'panel',
        characterId,
        status: 'error',
        metadata: { error: message }
      });
      return { message: reply };
    }
  };

  generateDiscoveryReason = async (input: { discovery: NormalizedDiscovery }) => {
    const fallback = {
      why_this_matters: `${input.discovery.title} matches Ann's curiosity around web, UX, and exploration.`,
      recommended_action: 'view' as const,
      short_message: 'I found something that might be worth a small look.',
      tags: input.discovery.tags
    };
    const builtMessages = [
      {
        role: 'system',
        content:
          'You are Ann, an exploration companion. Given a discovery, explain why it matters to the user and suggest an action.\n' +
          'Return ONLY valid JSON with these exact fields:\n' +
          '{\n' +
          '  "why_this_matters": string,\n' +
          '  "recommended_action": "view" | "save" | "ignore" | "add_to_journey",\n' +
          '  "short_message": string (warm, 1 sentence, <=20 words),\n' +
          '  "tags": string[]\n' +
          '}'
      },
      {
        role: 'user',
        content: JSON.stringify({
          title: input.discovery.title,
          summary: input.discovery.summary,
          source: input.discovery.source,
          tags: input.discovery.tags
        })
      }
    ] satisfies Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    let debugRequestBody: unknown;
    let debugRawResponse: unknown;
    let raw = '';
    try {
      const result = await this.createDeepSeekClient().chatDebug(builtMessages);
      raw = result.content;
      debugRequestBody = result.requestBody;
      debugRawResponse = result.raw;
      const parsed = validateDiscoveryReason(raw);
      this.pushDebugEntry({
        channel: 'discovery_reason',
        source: input.discovery.source,
        status: 'success',
        requestMessages: builtMessages,
        requestBody: debugRequestBody,
        rawResponse: debugRawResponse,
        content: raw
      });
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushDebugEntry({
        channel: 'discovery_reason',
        source: input.discovery.source,
        status: 'error',
        requestMessages: builtMessages,
        requestBody: debugRequestBody ?? getDebugRequestBody(error),
        rawResponse: debugRawResponse ?? getDebugResponseBody(error),
        content: raw,
        error: message
      });
      return fallback;
    }
  };

  summarizeMemory = async (input: { content: string }) => ({
    type: 'topic' as const,
    title: input.content.slice(0, 48) || 'Untitled memory',
    summary: input.content.slice(0, 180),
    importance_score: 50
  });

  getDebugLog = async (): Promise<AiDebugEntry[]> => [...this.debugLog];

  private getStoredAiSettings(): StoredAiSettings {
    return this.ctx.db.getAppSetting<StoredAiSettings>(AI_SETTINGS_KEY) ?? {};
  }

  private buildChatMessages(
    characterId: string,
    userMessage: string
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const history = this.ctx.db.listCompanionContext(characterId, COMPANION_CHAT_CONTEXT_LIMIT);
    const replyLanguage = this.getSettings().replyLanguage;
    const langInstruction =
      replyLanguage === 'zh-CN'
        ? '请始终用中文（简体）回复用户。'
        : 'Always reply in English.';
    return [
      {
        role: 'system',
        content:
          `You are Ann, the active companion inside Our Companion. Be warm, brief, curious, and never romantic or clingy. ${langInstruction}`
      },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage }
    ];
  }

  private createDeepSeekClient(): DeepSeekClient {
    const stored = this.getStoredAiSettings();
    return new DeepSeekClient({
      apiKey: stored.apiKey || process.env.DEEPSEEK_API_KEY,
      model: normalizeDeepSeekModel(stored.model || getConfiguredModel()),
      endpoint: normalizeDeepSeekEndpoint(stored.endpoint || process.env.DEEPSEEK_ENDPOINT || deepSeekDefaultEndpoint)
    });
  }

  private pushDebugEntry(entry: Omit<AiDebugEntry, 'id' | 'createdAt'>): void {
    this.debugLog.unshift({ ...entry, id: `dbg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`, createdAt: new Date().toISOString() });
    if (this.debugLog.length > DEBUG_LOG_MAX) this.debugLog.length = DEBUG_LOG_MAX;
  }
}

function getDebugRequestBody(error: unknown): unknown {
  return error instanceof DeepSeekRequestError ? error.requestBody : undefined;
}

function getDebugResponseBody(error: unknown): unknown {
  return error instanceof DeepSeekRequestError ? error.responseBody : undefined;
}
