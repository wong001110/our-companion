import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  DeepSeekClient,
  DeepSeekRequestError,
  deepSeekDefaultEndpoint,
  getConfiguredModel,
  normalizeDeepSeekEndpoint,
  normalizeDeepSeekModel,
  validateActionPlan,
  validateDiscoveryReason
} from '@our-companion/ai-engine';
import { directPerformance, planAction, runActionPlan, type ActionOrchestratorDeps } from '@our-companion/action-engine';
import { advanceCharacter, applyEmotionEvent } from '@our-companion/character-engine';
import { collectWorkspaceStatus, type WorkspaceStatusSnapshot } from './workspaceStatus';
import { generateCuriosityTargets } from '@our-companion/curiosity-engine';
import { assessCuriosity } from '@our-companion/curiosity-engine';
import { DatabaseService } from '@our-companion/database';
import { assessAttention, decideCompanionAction } from '@our-companion/decision-engine';
import { generateDailyDiary } from '@our-companion/diary-engine';
import {
  createFallbackConnector,
  planExploration,
  runDiscoveryAgents,
  runDiscoveryPipeline
} from '@our-companion/discovery-engine';
import { generateInsights, selectPrimaryInsight } from '@our-companion/insight-engine';
import { createJourney, createJourneyMilestone } from '@our-companion/journey-engine';
import {
  buildInterestGraph,
  createMemoryEdge,
  createMemoryNode,
  graphFromMemory,
  searchMemory,
  updateMemoryNode as updateMemoryNodePure
} from '@our-companion/memory-engine';
import type {
  ActionPermissionState,
  ActionPlan,
  AddDiscoveryToJourneyInput,
  AddJourneyMilestoneInput,
  AiDebugEntry,
  AiSettings,
  CharacterBehaviorSettings,
  CharacterRuntimeState,
  ChatInput,
  CompanionInsight,
  CompanionAppendMessageInput,
  CompanionHistoryInput,
  CompanionMessage,
  CompanionProfile,
  CompanionReplyLanguage,
  CompanionSessionPhase,
  CompanionTurnInput,
  CreateCompanionInput,
  CreateJourneyInput,
  CreateMemoryEdgeInput,
  CreateMemoryNodeInput,
  DebugDataResetInput,
  Discovery,
  DiscoveryAnnouncePayload,
  DiscoveryFeedInput,
  DiscoveryFeedback,
  DiscoverySource,
  EngineSnapshotInput,
  ExplorationCycle,
  ExplorationCycleResult,
  ExplorationLoopEvent,
  ExplorationState,
  FoundationEventLogInput,
  NormalizedDiscovery,
  PerformanceScript,
  SpeechSettings,
  StartExplorationInput,
  SubmitDiscoveryFeedbackInput,
  ToolExecuteInput,
  TranscribeAudioInput,
  UiLang,
  UpdateAiSettingsInput,
  UpdateCharacterBehaviorSettingsInput,
  UpdateCompanionInput,
  UpdateSpeechSettingsInput,
  UpdateMemoryNodeInput
} from '@our-companion/shared';
import { COMPANION_CHAT_CONTEXT_LIMIT, DEFAULT_CHARACTER_ID, createId, nowIso, type BaseEvent } from '@our-companion/shared';
import { detectPatterns } from '@our-companion/pattern-engine';
import { executeActionStep, executeTool, previewTool } from '@our-companion/tool-engine';
import { createElectronToolAdapters } from './platform/electronCommandAdapter';
import { getWhisperStatus, transcribeRecording } from '@our-companion/speech-engine';
import { createEvent, globalEventBus, type EventBus } from '@our-companion/event-bus';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';
import type { DiscoveryRefreshResult } from './discoveryScheduler';
import { buildEngineSnapshot } from './engineSnapshot';

const DEBUG_LOG_MAX = 100;
const FOUNDATION_EVENT_LOG_MAX = 200;

export class AppServices {
  readonly db: DatabaseService;
  readonly databaseMode: 'persistent' | 'memory';
  companionSessionPhase: CompanionSessionPhase = 'idle';
  companionDragging = false;
  private shareOrchestrator?: DiscoveryShareOrchestrator;
  private explorationBroadcaster?: (event: ExplorationLoopEvent) => void;
  private characterBroadcaster?: (state: CharacterRuntimeState) => void;
  private discoveryAnnounceBroadcaster?: (payload: DiscoveryAnnouncePayload) => void;
  private foundationEventBroadcaster?: (event: BaseEvent) => void;
  private debugLog: AiDebugEntry[] = [];
  private foundationEventLog: BaseEvent[] = [];

  constructor(
    dbPath = path.join(app.getPath('userData'), 'our-companion.db'),
    readonly eventBus: EventBus = globalEventBus
  ) {
    const userDataDir = app.getPath('userData');
    if (userDataDir !== ':memory:') {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    try {
      this.db = new DatabaseService({ path: dbPath });
      this.databaseMode = 'persistent';
    } catch (error) {
      if (!shouldFallbackToMemory(error)) throw error;

      console.warn(
        `[our-companion] Persistent SQLite startup failed at ${dbPath}; falling back to in-memory demo mode.`,
        error
      );
      this.db = new DatabaseService({ path: ':memory:' });
      this.databaseMode = 'memory';
    }
  }

  character = {
    getState: async (characterId?: string) => this.db.getCharacterState(characterId),
    getActive: async () => this.db.getActiveCharacters(),
    getBehaviorSettings: async () => this.getCharacterBehaviorSettings(),
    updateBehaviorSettings: async (input: UpdateCharacterBehaviorSettingsInput) => this.updateCharacterBehaviorSettings(input),
    setPrimary: async (characterId: string) => this.db.setPrimaryCharacter(characterId),
    updatePosition: async (input: { characterId?: string; x: number; y: number }) => {
      const state = this.db.getCharacterState(input.characterId);
      const next = this.db.saveCharacterState({ ...state, position: { x: input.x, y: input.y } });
      this.emitFoundationEvent('AnnStateChanged', 'character', {
        characterId: next.characterId,
        coreState: next.coreState,
        intent: next.intent,
        position: next.position
      });
      return next;
    },
    triggerBehavior: async (input: { characterId?: string; event: string }) => {
      const state = this.db.getCharacterState(input.characterId);
      const next = advanceCharacter(state, {
        userCommand: input.event === 'user_command' ? input.event : undefined,
        availableDiscoveries: input.event === 'discovery' ? [{} as NormalizedDiscovery] : undefined,
        recentMemoryActivity: input.event === 'memory',
        reflectionDue: input.event === 'reflection',
        userActive: true
      });
      const saved = this.db.saveCharacterState(next);
      this.emitFoundationEvent('AnnStateChanged', 'character', {
        characterId: saved.characterId,
        coreState: saved.coreState,
        intent: saved.intent
      });
      return saved;
    }
  };

  companionNew = {
    create: async (input: CreateCompanionInput): Promise<CompanionProfile> => {
      return this.db.createCompanion(input);
    },
    list: async (): Promise<CompanionProfile[]> => {
      return this.db.listCompanions();
    },
    get: async (id: string): Promise<CompanionProfile | null> => {
      return this.db.getCompanion(id);
    },
    update: async (input: { id: string } & UpdateCompanionInput): Promise<CompanionProfile> => {
      const { id, ...rest } = input;
      return this.db.updateCompanion(id, rest);
    },
    delete: async (id: string): Promise<{ id: string; deleted: true }> => {
      return this.db.deleteCompanion(id);
    },
    setPrimary: async (id: string): Promise<CompanionProfile> => {
      return this.db.setPrimaryCompanion(id);
    },
    getPrimary: async (): Promise<CompanionProfile | null> => {
      return this.db.getPrimaryCompanion();
    }
  };

  discovery = {
    getFeed: async (input: DiscoveryFeedInput = {}) => this.db.listDiscoveries(input),
    refresh: async (input: { sources?: DiscoverySource[] } = {}) => {
      const result = await this.runDiscoveryRefresh(input.sources);
      return result.discoveries;
    },
    markInterested: async (discoveryId: string) => {
      const discovery = this.db.updateDiscoveryStatus(discoveryId, 'saved');
      const state = this.db.getCharacterState();
      const nextState = this.db.saveCharacterState({ ...state, emotion: applyEmotionEvent(state.emotion, 'user_accepts_discovery') });
      this.emitFoundationEvent('EmotionChanged', 'character', {
        characterId: nextState.characterId,
        reason: 'user_accepts_discovery'
      });
      return discovery;
    },
    markNotInterested: async (discoveryId: string) => {
      const discovery = this.db.updateDiscoveryStatus(discoveryId, 'rejected');
      const state = this.db.getCharacterState();
      const nextState = this.db.saveCharacterState({ ...state, emotion: applyEmotionEvent(state.emotion, 'user_rejects_discovery') });
      this.emitFoundationEvent('EmotionChanged', 'character', {
        characterId: nextState.characterId,
        reason: 'user_rejects_discovery'
      });
      return discovery;
    },
    addToJourney: async (input: AddDiscoveryToJourneyInput) => {
      const discovery = this.db.getDiscovery(input.discoveryId);
      if (!discovery) throw new Error(`Discovery not found: ${input.discoveryId}`);

      const journey =
        input.journeyId && this.db.listActiveJourneys().find((item) => item.id === input.journeyId)
          ? this.db.listActiveJourneys().find((item) => item.id === input.journeyId)!
          : this.db.insertJourney(
              createJourney({ title: input.createJourneyTitle ?? `Explore ${discovery.title}`, description: discovery.summary })
            );

      const memory = this.db.insertMemoryNode(
        createMemoryNode({
          type: 'discovery',
          title: discovery.title,
          summary: discovery.summary,
          content: discovery.whyThisMatters,
          source: discovery.source,
          sourceUrl: discovery.url
        })
      );
      const milestone = this.db.insertMilestone(
        createJourneyMilestone({
          journeyId: journey.id,
          title: `Saved discovery: ${discovery.title}`,
          summary: discovery.summary,
          type: 'discovery_saved'
        })
      );
      this.db.updateDiscoveryStatus(discovery.id, 'saved');
      const correlationId = createId('corr');
      this.emitFoundationEvent('KnowledgeCreated', 'knowledge', {
        memoryId: memory.id,
        discoveryId: discovery.id,
        title: memory.title
      }, correlationId);
      this.emitFoundationEvent('JourneyUpdated', 'journey', {
        journeyId: journey.id,
        milestoneId: milestone.id,
        discoveryId: discovery.id
      }, correlationId);
      return { journey, milestone, memory };
    },
    generateNow: async () => {
      const result = await this.runDiscoveryRefresh();
      return result.discoveries;
    },
    shareNext: async () => {
      if (!this.shareOrchestrator) return false;
      const oldest = this.db.getOldestUnannouncedShared();
      if (!oldest) return false;
      return this.shareOrchestrator.enqueue(oldest);
    },
    resetStatuses: async () => {
      const discoveries = this.db.listDiscoveries({ limit: 200 });
      for (const d of discoveries) {
        if (d.status === 'shared' || d.status === 'queued') {
          this.db.updateDiscoveryStatus(d.id, 'new');
        }
      }
      return { reset: true };
    },
    countUnannounced: async () => {
      const announced = this.db.getAnnouncedDiscoveryIds();
      const shared = this.db.listDiscoveries({ status: 'shared', limit: 200 });
      const unannounced = shared.filter((d) => !announced.includes(d.id));
      return { count: unannounced.length };
    },
    markSharedAsUnannounced: async () => {
      this.db.clearAnnouncedDiscoveryIds();
      const shared = this.db.listDiscoveries({ status: 'shared', limit: 200 });
      return { count: shared.length };
    },
    clearPool: async () => {
      this.db.resetDebugData({ targets: ['discoveries'] });
      return { cleared: true };
    },
    simulateCanAnnounceDisabled: async (disabled: boolean) => {
      this.shareOrchestrator?.setSimulateCanAnnounceDisabled(disabled);
      return { disabled };
    },
    simulateInterruptEnabled: async (enabled: boolean) => {
      this.shareOrchestrator?.setSimulateInterruptEnabled(enabled);
      return { enabled };
    },
    clearSimulation: async () => {
      this.shareOrchestrator?.clearSimulation();
      return { cleared: true };
    },
    getSimulationState: async () => {
      return this.shareOrchestrator?.isSimulating() ?? { canAnnounceDisabled: false, interruptEnabled: false };
    }
  };

  autonomy = {
    startExploration: async (input: StartExplorationInput = {}) => this.runAutonomousExploration(input),
    getCurrentCycle: async () => this.db.getCurrentExplorationCycle(),
    getCycleHistory: async (input: { limit?: number } = {}) => this.db.listExplorationCycles(input.limit ?? 20),
    submitFeedback: async (input: SubmitDiscoveryFeedbackInput) => this.submitDiscoveryFeedback(input)
  };

  memory = {
    createNode: async (input: CreateMemoryNodeInput) => this.db.insertMemoryNode(createMemoryNode(input)),
    updateNode: async (input: UpdateMemoryNodeInput) => {
      const existing = this.db.getMemoryNode(input.id);
      if (!existing) throw new Error(`Memory node not found: ${input.id}`);
      return this.db.updateMemoryNode(updateMemoryNodePure(existing, input));
    },
    deleteNode: async (id: string) => {
      this.db.deleteMemoryNode(id);
      return { id, deleted: true as const };
    },
    createEdge: async (input: CreateMemoryEdgeInput) => this.db.insertMemoryEdge(createMemoryEdge(input)),
    getGraph: async (input: { query?: string } = {}) =>
      graphFromMemory(this.db.listMemoryNodes(), this.db.listMemoryEdges(), input.query),
    search: async (query: string) => searchMemory(this.db.listMemoryNodes(), query)
  };

  journey = {
    create: async (input: CreateJourneyInput) => this.db.insertJourney(createJourney(input)),
    getActive: async () => this.db.listActiveJourneys(),
    getTimeline: async (input: { journeyId?: string } = {}) => this.db.listMilestones(input.journeyId),
    addMilestone: async (input: AddJourneyMilestoneInput) => this.db.insertMilestone(createJourneyMilestone(input))
  };

  diary = {
    getEntries: async (input: { type?: 'daily' | 'weekly' | 'milestone'; limit?: number } = {}) => this.db.listDiaryEntries(input),
    generateDaily: async (input: { characterId?: string } = {}) => {
      const correlationId = createId('corr');
      this.emitFoundationEvent('ReflectionRequested', 'reflection', {
        characterId: input.characterId ?? DEFAULT_CHARACTER_ID
      }, correlationId);
      const entry = generateDailyDiary({
        characterId: input.characterId ?? DEFAULT_CHARACTER_ID,
        milestones: this.db.listMilestones().slice(0, 10),
        savedDiscoveries: this.db.listDiscoveries({ status: 'saved', limit: 10 }) as Discovery[],
        completedTasks: [],
        memoryChanges: this.db.listMemoryNodes().slice(0, 10)
      });
      const saved = this.db.insertDiary(entry);
      this.emitFoundationEvent('ReflectionCreated', 'reflection', {
        diaryEntryId: saved.id,
        characterId: saved.characterId,
        title: saved.title
      }, correlationId);
      return saved;
    }
  };

  onPerformanceListeners: Array<(script: PerformanceScript) => void> = [];

  tool = {
    preview: async (input: ToolExecuteInput) => previewTool(input),
    execute: async (input: ToolExecuteInput) => {
      const correlationId = createId('corr');
      this.emitFoundationEvent('ActionRequested', 'tool', {
        toolName: input.toolName,
        args: input.args
      }, correlationId);
      const adapters = createElectronToolAdapters();
      const result = await executeTool(input, adapters);
      this.emitFoundationEvent(result.status === 'executed' ? 'CommandExecuted' : 'ActionFailed', 'tool', {
        toolName: input.toolName,
        status: result.status,
        errorMessage: result.errorMessage,
        blockedReason: (result as { blockedReason?: string }).blockedReason
      }, correlationId);
      return result;
    }
  };

  action = {
    plan: async (text: string) => {
      const aiSettings = this.getAiSettings();
      const hasAi = aiSettings.apiKeyConfigured;
      let llmDeps = undefined;
      if (hasAi) {
        const client = this.createDeepSeekClient();
        llmDeps = {
          completeJson: async <T>(messages: Array<{ role: 'system' | 'user'; content: string }>) => {
            const result = await client.chat(messages.map((m) => ({ ...m, role: m.role as 'system' | 'user' | 'assistant' })));
            return result as T;
          },
          validateActionPlan: (raw: string) => validateActionPlan(raw),
        };
      }
      return planAction(text, llmDeps);
    },
    executePlan: async (plan: ActionPlan) => {
      const correlationId = createId('corr');
      this.emitFoundationEvent('ActionRequested', 'action', { planId: plan.id, summary: plan.summary }, correlationId);
      const adapters = createElectronToolAdapters();
      const orchDeps: ActionOrchestratorDeps = {
        executeStep: (toolName: string, args: Record<string, unknown>) => executeActionStep(toolName, args, adapters),
        emitEvent: (type: string, payload?: Record<string, unknown>, cid?: string) => this.emitFoundationEvent(type, 'action', payload, cid ?? correlationId),
        getPermissions: () => this.db.getActionPermissions(),
        directPerformance: (actionId: string, outcome: 'success' | 'failure') => directPerformance(actionId, outcome),
        broadcastPerformance: (script: PerformanceScript) => {
          for (const listener of this.onPerformanceListeners) listener(script);
        },
      };
      return runActionPlan(plan, orchDeps, correlationId);
    },
    getPermissions: async (): Promise<ActionPermissionState> => this.db.getActionPermissions(),
    updatePermissions: async (state: ActionPermissionState): Promise<ActionPermissionState> => this.db.setActionPermissions(state),
  };

  private pushDebugEntry(entry: Omit<AiDebugEntry, 'id' | 'createdAt'>): void {
    this.debugLog.unshift({ ...entry, id: createId('dbg'), createdAt: nowIso() });
    if (this.debugLog.length > DEBUG_LOG_MAX) this.debugLog.length = DEBUG_LOG_MAX;
  }

  private buildChatMessages(
    characterId: string,
    userMessage: string
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const history = this.db.listCompanionContext(characterId, COMPANION_CHAT_CONTEXT_LIMIT);
    const replyLanguage = this.getAiSettings().replyLanguage;
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

  ai = {
    getSettings: async () => this.getAiSettings(),
    updateSettings: async (input: UpdateAiSettingsInput) => this.updateAiSettings(input),
    chat: async (input: ChatInput) => {
      const characterId = input.characterId ?? DEFAULT_CHARACTER_ID;
      const builtMessages = this.buildChatMessages(characterId, input.message);
      this.db.insertCompanionMessage({ role: 'user', content: input.message, source: 'panel', characterId });
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
        this.db.insertCompanionMessage({ role: 'assistant', content: message, source: 'panel', characterId });
        this.emitFoundationEvent('AnnMessageQueued', 'speech', {
          characterId,
          source: 'panel',
          message
        });
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
        this.db.insertCompanionMessage({
          role: 'assistant',
          content: reply,
          source: 'panel',
          characterId,
          status: 'error',
          metadata: { error: message }
        });
        this.emitFoundationEvent('AnnMessageQueued', 'speech', {
          characterId,
          source: 'panel',
          status: 'error',
          message: reply
        });
        return { message: reply };
      }
    },
    generateDiscoveryReason: async (input: { discovery: NormalizedDiscovery }) => {
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
            'You are Ann, the user\'s desktop companion.\n\n' +
            'Your job is NOT to explain the full discovery aloud.\n' +
            'You should gently point out why this discovery may interest the user.\n\n' +
            'Speak like Ann:\n' +
            '- soft\n' +
            '- curious\n' +
            '- concise\n' +
            '- personal\n' +
            '- slightly shy\n' +
            '- not like a report\n' +
            '- not like a generic assistant\n\n' +
            'Return ONLY valid JSON with this exact shape:\n' +
            '{\n' +
            '  "why_this_matters": string,\n' +
            '  "recommended_action": "view" | "save" | "ignore" | "add_to_journey",\n' +
            '  "short_message": string,\n' +
            '  "card_title": string,\n' +
            '  "card_body": string,\n' +
            '  "tags": string[]\n' +
            '}\n\n' +
            'Rules:\n' +
            '- short_message is what Ann says aloud.\n' +
            '- short_message MUST be 80-140 characters, personality-first, conversational.\n' +
            '- Never narrate the full discovery content.\n' +
            '- Examples: "I found something that reminded me of what we have been discussing." or "This looks surprisingly relevant to your recent interests."\n' +
            '- card_title should be short and readable.\n' +
            '- card_body should explain the discovery in max 2 short sentences.\n' +
            '- why_this_matters can be more internal/detail-oriented.\n' +
            '- Do not repeat the full discovery summary.\n' +
            '- Do not sound like a system assistant.\n' +
            '- If user memory/personality context exists, use it subtly.'
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
    },
    summarizeMemory: async (input: { content: string }) => ({
      type: 'topic' as const,
      title: input.content.slice(0, 48) || 'Untitled memory',
      summary: input.content.slice(0, 180),
      importance_score: 50
    }),
    getDebugLog: async (): Promise<AiDebugEntry[]> => [...this.debugLog]
  };

  speech = {
    getStatus: async () => {
      const status = await getWhisperStatus(app.getPath('userData'));
      return {
        ready: status.ready,
        model: status.model,
        error: status.error
      };
    },
    getSettings: async () => this.getSpeechSettings(),
    updateSettings: async (input: UpdateSpeechSettingsInput) => this.updateSpeechSettings(input),
    transcribe: async (input: TranscribeAudioInput) => {
      try {
        const language = input.language ?? whisperLanguageForReplyLanguage(this.getAiSettings().replyLanguage);
        const speechSettings = this.getSpeechSettings();
        const result = await transcribeRecording({
          audio: input.audio,
          mimeType: input.mimeType,
          userDataRoot: app.getPath('userData'),
          language,
          useGpu: speechSettings.useGpu
        });
        this.emitFoundationEvent('SignalCaptured', 'speech', {
          sourceType: 'user',
          title: 'Voice transcript',
          summary: result.text,
          language: result.language
        });
        return { text: result.text, language: result.language };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (/^I could not/i.test(detail)) {
          throw new Error(detail);
        }
        throw new Error(`I could not transcribe that audio. ${detail}`);
      }
    }
  };

  companion = {
    turn: async (input: CompanionTurnInput) => {
      const characterId = input.characterId ?? DEFAULT_CHARACTER_ID;
      const source = input.source === 'voice' ? 'voice' : 'companion_text';
      const builtMessages = this.buildChatMessages(characterId, input.message);
      this.db.insertCompanionMessage({ role: 'user', content: input.message, source, characterId });
      try {
        const { content: message, raw, requestBody } = await this.createDeepSeekClient().chatDebug(builtMessages);
        this.pushDebugEntry({
          channel: 'turn',
          source,
          status: 'success',
          requestMessages: builtMessages,
          requestBody,
          rawResponse: raw,
          content: message
        });
        this.db.insertCompanionMessage({ role: 'assistant', content: message, source, characterId });
        if (input.source === 'voice') {
          const state = this.db.getCharacterState(characterId);
          const nextState = this.db.saveCharacterState({
            ...state,
            emotion: applyEmotionEvent(state.emotion, 'expertise_topic_match')
          });
          this.emitFoundationEvent('EmotionChanged', 'character', {
            characterId: nextState.characterId,
            reason: 'expertise_topic_match'
          });
        }
        this.emitFoundationEvent('AnnMessageQueued', 'speech', {
          characterId,
          source,
          message
        });
        return { message };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.pushDebugEntry({
          channel: 'turn',
          source,
          status: 'error',
          requestMessages: builtMessages,
          requestBody: getDebugRequestBody(error),
          rawResponse: getDebugResponseBody(error),
          content: '',
          error: errMsg
        });
        const reply = `DeepSeek request failed. Check Settings > model, endpoint, and API key. Details: ${errMsg}`;
        this.db.insertCompanionMessage({
          role: 'assistant',
          content: reply,
          source,
          characterId,
          status: 'error',
          metadata: { error: errMsg }
        });
        this.emitFoundationEvent('AnnMessageQueued', 'speech', {
          characterId,
          source,
          status: 'error',
          message: reply
        });
        return { message: reply };
      }
    },
    getHistory: async (input?: CompanionHistoryInput): Promise<CompanionMessage[]> => {
      return this.db.listCompanionMessages(input);
    },
    appendMessage: async (input: CompanionAppendMessageInput): Promise<CompanionMessage> => {
      return this.db.insertCompanionMessage(input);
    },
    clearHistory: async (input?: { characterId?: string }): Promise<void> => {
      this.db.clearCompanionMessages(input?.characterId);
    },
    reportSessionPhase: async (phase: CompanionSessionPhase) => {
      this.companionSessionPhase = phase;
    },
    reportDragging: async (input: { dragging: boolean }) => {
      this.companionDragging = input.dragging;
    }
  };

  debug = {
    resetData: async (input: DebugDataResetInput) => this.db.resetDebugData(input),
    getFoundationLog: async (input: FoundationEventLogInput = {}) => this.getFoundationLog(input),
    getEngineSnapshot: async (input: EngineSnapshotInput = {}) => buildEngineSnapshot(this.db, input, undefined, this.shareOrchestrator)
  };

  workspace = {
    getStatus: async (): Promise<WorkspaceStatusSnapshot> => collectWorkspaceStatus(),
    getSummary: async (): Promise<WorkspaceStatusSnapshot['summary']> => collectWorkspaceStatus().summary,
  };

  attachShareOrchestrator(orchestrator: DiscoveryShareOrchestrator): void {
    this.shareOrchestrator = orchestrator;
  }

  attachAutonomyBroadcasters(callbacks: {
    explorationEvent: (event: ExplorationLoopEvent) => void;
    characterState: (state: CharacterRuntimeState) => void;
    discoveryAnnounce: (payload: DiscoveryAnnouncePayload) => void;
    foundationEvent?: (event: BaseEvent) => void;
  }): void {
    this.explorationBroadcaster = callbacks.explorationEvent;
    this.characterBroadcaster = callbacks.characterState;
    this.discoveryAnnounceBroadcaster = callbacks.discoveryAnnounce;
    this.foundationEventBroadcaster = callbacks.foundationEvent;
  }

  private setAutonomyCharacterState(coreState: CharacterRuntimeState['coreState'], intent: CharacterRuntimeState['intent']): CharacterRuntimeState {
    const state = this.db.getCharacterState(DEFAULT_CHARACTER_ID);
    const next = this.db.saveCharacterState({
      ...state,
      coreState,
      intent,
      updatedAt: nowIso()
    });
    this.characterBroadcaster?.(next);
    this.emitFoundationEvent('AnnStateChanged', 'character', {
      characterId: next.characterId,
      coreState: next.coreState,
      intent: next.intent
    });
    return next;
  }

  private recordExplorationEvent(
    cycle: ExplorationCycle,
    state: ExplorationState,
    message: string,
    metadata?: Record<string, unknown>
  ): ExplorationLoopEvent {
    const event = this.db.insertExplorationEvent({
      id: createId('explore_evt'),
      userId: cycle.userId,
      companionId: cycle.companionId,
      cycleId: cycle.id,
      state,
      message,
      metadata,
      createdAt: nowIso()
    });
    this.explorationBroadcaster?.(event);
    this.emitFoundationEvent('DiscoveryCreated', 'discovery', {
      cycleId: cycle.id,
      state,
      message
    });
    return event;
  }

  private saveCycleState(cycle: ExplorationCycle, state: ExplorationState, patch: Partial<ExplorationCycle> = {}): ExplorationCycle {
    const next = this.db.insertExplorationCycle({
      ...cycle,
      ...patch,
      state
    });
    this.recordExplorationEvent(next, state, this.messageForExplorationState(state));
    return next;
  }

  private messageForExplorationState(state: ExplorationState): string {
    const messages: Record<ExplorationState, string> = {
      idle: 'Ann is idle.',
      curious: 'Ann became curious.',
      planning: 'Ann is planning where to look.',
      exploring: 'Ann went exploring.',
      collecting: 'Ann found candidate signals.',
      synthesizing: 'Ann is thinking about what the findings mean.',
      returning: 'Ann is coming back.',
      sharing: 'Ann returned with something.',
      reflecting: 'Ann is reflecting on the feedback.'
    };
    return messages[state];
  }

  private async runAutonomousExploration(input: StartExplorationInput = {}): Promise<ExplorationCycleResult> {
    const userId = input.userId ?? 'default';
    const companionId = input.companionId ?? DEFAULT_CHARACTER_ID;
    const trigger = input.trigger ?? 'manual';
    const characterState = this.db.getCharacterState(companionId);
    const characterProfile = this.db.getActiveCharacters().find((character) => character.id === companionId);
    const memoryNodes = this.db.listMemoryNodes();
    const journeyMilestones = this.db.listMilestones();
    const discoveryHistory = this.db.listDiscoveries({ limit: 100 });
    const feedbackHistory = this.db.listDiscoveryFeedback(100);

    const detectedPatterns = detectPatterns({
      userId,
      memoryNodes,
      journeyMilestones,
      discoveryHistory,
      feedbackHistory
    });
    for (const pattern of detectedPatterns) {
      this.db.insertPattern(pattern);
    }

    const interestGraph = buildInterestGraph({
      userId,
      memoryNodes,
      patterns: detectedPatterns,
      discoveries: discoveryHistory,
      feedback: feedbackHistory
    });
    this.db.upsertInterestGraph(interestGraph);

    const curiosityTargets = generateCuriosityTargets({
      userId,
      companionId,
      characterState,
      characterProfile,
      memoryNodes,
      journeySummaries: journeyMilestones.map((milestone) => milestone.summary ?? milestone.title),
      patterns: detectedPatterns,
      interestGraph,
      recentFeedback: feedbackHistory
    });
    for (const target of curiosityTargets) {
      this.db.insertCuriosityTarget(target);
    }

    const selectedCuriosityTarget = curiosityTargets[0];
    let cycle = this.db.insertExplorationCycle({
      id: createId('cycle'),
      userId,
      companionId,
      trigger,
      state: 'curious',
      curiosityTargetIds: curiosityTargets.map((target) => target.id),
      selectedCuriosityTargetId: selectedCuriosityTarget?.id,
      discoveryCandidateIds: [],
      insightIds: [],
      startedAt: nowIso()
    });
    this.recordExplorationEvent(cycle, 'curious', selectedCuriosityTarget?.reason ?? 'Ann became curious.');
    this.setAutonomyCharacterState('thinking', 'reviewing_memory');

    if (!selectedCuriosityTarget) {
      cycle = this.saveCycleState(cycle, 'reflecting', { completedAt: nowIso() });
      return { cycle, curiosityTargets, discoveryCandidates: [], insights: [] };
    }

    const explorationPlan = planExploration(selectedCuriosityTarget);
    this.db.insertExplorationPlan(explorationPlan);
    cycle = this.saveCycleState(cycle, 'planning', { explorationPlanId: explorationPlan.id });
    this.setAutonomyCharacterState('discovering', 'sharing_discovery');

    cycle = this.saveCycleState(cycle, 'exploring');
    const discoveryCandidates = await runDiscoveryAgents({
      userId,
      companionId,
      curiosityTarget: selectedCuriosityTarget,
      explorationPlan,
      memoryCandidates: memoryNodes.map((memory) => ({
        title: memory.title,
        summary: memory.summary ?? memory.content,
        url: memory.sourceUrl,
        tags: [memory.type]
      }))
    });
    for (const candidate of discoveryCandidates) {
      this.db.insertDiscoveryCandidate(candidate);
    }

    cycle = this.saveCycleState(cycle, 'collecting', {
      discoveryCandidateIds: discoveryCandidates.map((candidate) => candidate.id)
    });
    cycle = this.saveCycleState(cycle, 'synthesizing');

    const insights = generateInsights({
      userId,
      companionId,
      characterState,
      characterProfile,
      memoryNodes,
      patterns: detectedPatterns,
      interestGraph,
      curiosityTarget: selectedCuriosityTarget,
      discoveryCandidates
    });
    for (const insight of insights) {
      this.db.insertCompanionInsight(insight);
    }
    const selectedInsight = selectPrimaryInsight(insights);
    cycle = this.saveCycleState(cycle, 'returning', {
      insightIds: insights.map((insight) => insight.id),
      selectedInsightId: selectedInsight?.id
    });
    this.setAutonomyCharacterState('returning', 'sharing_discovery');

    cycle = this.saveCycleState(cycle, 'sharing');
    this.setAutonomyCharacterState('talking', 'sharing_discovery');
    if (selectedInsight) {
      this.discoveryAnnounceBroadcaster?.({
        discoveryId: selectedInsight.id,
        title: selectedInsight.title,
        message: selectedInsight.narration ?? selectedInsight.summary,
        cycleId: cycle.id,
        insightId: selectedInsight.id
      });
      this.emitFoundationEvent('AnnMessageQueued', 'speech', {
        discoveryId: selectedInsight.id,
        cycleId: cycle.id,
        message: selectedInsight.narration ?? selectedInsight.summary
      });
    }

    return {
      cycle,
      curiosityTargets,
      selectedCuriosityTarget,
      explorationPlan,
      discoveryCandidates,
      insights,
      selectedInsight
    };
  }

  private async submitDiscoveryFeedback(input: SubmitDiscoveryFeedbackInput): Promise<DiscoveryFeedback> {
    const cycle = this.db.getExplorationCycle(input.cycleId);
    if (!cycle) throw new Error(`Exploration cycle not found: ${input.cycleId}`);

    const feedback: DiscoveryFeedback = this.db.insertDiscoveryFeedback({
      id: createId('feedback'),
      userId: cycle.userId,
      companionId: cycle.companionId,
      cycleId: cycle.id,
      insightId: input.insightId ?? cycle.selectedInsightId,
      discoveryCandidateId: input.discoveryCandidateId,
      value: input.value,
      note: input.note,
      createdAt: nowIso()
    });

    const insight = feedback.insightId ? this.db.getCompanionInsight(feedback.insightId) : undefined;
    const reflected = this.db.insertExplorationCycle({
      ...cycle,
      state: 'reflecting',
      completedAt: nowIso()
    });
    this.recordExplorationEvent(reflected, 'reflecting', 'Ann recorded what happened after sharing the insight.', {
      feedback: feedback.value
    });

    if (input.value === 'saved' && insight) {
      const memory = this.db.insertMemoryNode(
        createMemoryNode({
          type: 'discovery',
          title: insight.title,
          summary: insight.summary,
          content: `${insight.insight}\n\n${insight.whyItMatters}`,
          source: 'autonomous_exploration'
        })
      );
      const activeJourney = this.db.listActiveJourneys()[0] ?? this.db.insertJourney(
        createJourney({ title: `Explore ${insight.title}`, description: insight.summary })
      );
      this.db.insertMilestone(
        createJourneyMilestone({
          journeyId: activeJourney.id,
          title: `Ann saved an insight: ${insight.title}`,
          summary: insight.suggestedAction ?? insight.whyItMatters,
          type: 'discovery_saved'
        })
      );
      this.db.insertDiary({
        id: createId('diary'),
        characterId: cycle.companionId,
        type: 'milestone',
        title: 'Ann brought something back',
        content: `I explored ${insight.title} and the user wanted to keep it. I added it to memory ${memory.id} so I can connect it to future curiosity.`,
        relatedJourneyId: activeJourney.id,
        createdAt: nowIso()
      });
      const state = this.db.getCharacterState(cycle.companionId);
      const nextState = this.db.saveCharacterState({ ...state, emotion: applyEmotionEvent(state.emotion, 'user_accepts_discovery') });
      this.emitFoundationEvent('EmotionChanged', 'character', {
        characterId: nextState.characterId,
        reason: 'user_accepts_discovery'
      });
    } else if (input.value === 'not_interested') {
      const state = this.db.getCharacterState(cycle.companionId);
      const nextState = this.db.saveCharacterState({ ...state, emotion: applyEmotionEvent(state.emotion, 'user_rejects_discovery') });
      this.emitFoundationEvent('EmotionChanged', 'character', {
        characterId: nextState.characterId,
        reason: 'user_rejects_discovery'
      });
    } else if (input.value === 'talk_about_this' && insight) {
      this.db.insertCompanionMessage({
        characterId: cycle.companionId,
        role: 'assistant',
        content: insight.narration ?? insight.summary,
        source: 'companion_text',
        metadata: { cycleId: cycle.id, insightId: insight.id }
      });
    }

    const settled = this.db.saveCharacterState({
      ...this.db.getCharacterState(cycle.companionId),
      coreState: 'idle',
      intent: 'waiting',
      updatedAt: nowIso()
    });
    this.characterBroadcaster?.(settled);
    this.emitFoundationEvent('AnnStateChanged', 'character', {
      characterId: settled.characterId,
      coreState: settled.coreState,
      intent: settled.intent
    });
    return feedback;
  }

  async runDiscoveryRefresh(sources?: DiscoverySource[]): Promise<DiscoveryRefreshResult> {
    const existingKeys = new Set(
      this.db.listDiscoveries({ limit: 500 }).map((item) => item.url ?? `${item.source}:${item.title}`)
    );
    const activeCharacter = this.db.getActiveCharacters()[0];
    const connectors = (sources ?? ['github', 'hackernews', 'reddit', 'youtube']).map(createFallbackConnector);
    const discoveries = await runDiscoveryPipeline(
      connectors,
      {
        userInterests: ['frontend', 'ux', 'pixijs', 'local-first'],
        recentMemoryTags: this.db.listMemoryNodes().flatMap((node) => [node.type, node.title.toLowerCase()]),
        activeCharacter,
        seenUrls: new Set(this.db.listDiscoveries({ limit: 200 }).map((item) => item.url).filter(Boolean) as string[])
      },
      this.db.countSharedToday()
    );

    const newlyInserted: Discovery[] = [];
    for (const discovery of discoveries) {
      const key = discovery.url ?? `${discovery.source}:${discovery.title}`;
      const isNew = !existingKeys.has(key);
      this.db.insertDiscovery(discovery);
      if (isNew) {
        newlyInserted.push(discovery);
        existingKeys.add(key);
        const correlationId = createId('corr');
        this.emitFoundationEvent('SignalCaptured', 'discovery', {
          sourceType: discovery.source,
          title: discovery.title,
          summary: discovery.summary,
          url: discovery.url
        }, correlationId);
        this.emitFoundationEvent('DiscoveryCreated', 'discovery', {
          discoveryId: discovery.id,
          title: discovery.title,
          status: discovery.status,
          url: discovery.url
        }, correlationId);
        this.emitDecisionEventsForDiscovery(discovery, correlationId);
      }
    }

    return { discoveries, newlyInserted };
  }

  getEffectiveDiscoveryScore(): number {
    const rules = this.db.getCharacterBehaviorRules(DEFAULT_CHARACTER_ID);
    return clampScore(Number(rules.discovery ?? 35));
  }

  canAnnounceDiscovery(): boolean {
    if (this.companionSessionPhase !== 'idle') return false;
    if (this.companionDragging) return false;

    const state = this.db.getCharacterState();
    if (state.intent === 'helping_task' || state.intent === 'asking_permission') return false;
    if (state.intent === 'sharing_discovery') return true;
    if (['listening', 'executing'].includes(state.coreState)) return false;
    return true;
  }

  shouldInterruptShare(): boolean {
    return this.companionSessionPhase !== 'idle' || this.companionDragging;
  }

  countAutonomousCyclesToday(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.db
      .listExplorationCycles(100)
      .filter((cycle) => cycle.trigger !== 'manual' && cycle.startedAt.startsWith(today)).length;
  }

  emitFoundationEvent(
    type: string,
    source: string,
    payload?: Record<string, unknown>,
    correlationId?: string
  ): void {
    const event = createEvent({ type, source, payload, correlationId });
    this.eventBus.emit(event);
    this.foundationEventLog.unshift(event);
    if (this.foundationEventLog.length > FOUNDATION_EVENT_LOG_MAX) {
      this.foundationEventLog.length = FOUNDATION_EVENT_LOG_MAX;
    }
    this.foundationEventBroadcaster?.(event);
  }

  private getFoundationLog(input: FoundationEventLogInput = {}): BaseEvent[] {
    const limit = input.limit ?? 100;
    return this.foundationEventLog
      .filter((event) => (input.source ? event.source === input.source : true))
      .filter((event) => (input.type ? event.type === input.type : true))
      .slice(0, limit);
  }

  private emitDecisionEventsForDiscovery(discovery: Discovery, correlationId: string): void {
    const recentActions = this.db
      .listDiscoveryFeedback(20)
      .map((feedback) => (feedback.value === 'not_interested' ? 'ignored_discovery' : feedback.value));
    const userContext = {
      mode: this.canAnnounceDiscovery() ? ('idle' as const) : ('focused' as const),
      localTime: nowIso(),
      recentActions,
      fatigueScore: this.companionSessionPhase === 'idle' ? 15 : 60
    };
    const companionContext = {
      dailySharedCount: this.db.countSharedToday(),
      attentionBudgetRemaining: 100,
      curiosityBudgetRemaining: 100,
      trustScore: 0.75
    };
    const curiosity = assessCuriosity({
      targetId: discovery.id,
      targetType: 'discovery',
      growthValue: discovery.growthValue ?? discovery.finalScore,
      novelty: discovery.noveltyScore / 100,
      reason: `Discovery scored ${discovery.finalScore} for current interests.`
    });
    const attention = assessAttention({
      targetId: discovery.id,
      targetType: 'discovery',
      noveltyScore: discovery.noveltyScore,
      growthValue: curiosity.growthValue,
      sourceQuality: discovery.confidenceScore ?? discovery.usefulnessScore,
      userContext,
      companionContext
    });
    this.emitFoundationEvent('CuriosityAssessmentCreated', 'curiosity', {
      assessmentId: curiosity.id,
      targetId: curiosity.targetId,
      growthValue: curiosity.growthValue,
      budgetCost: curiosity.budgetCost
    }, correlationId);
    this.emitFoundationEvent('AttentionAssessmentCreated', 'decision', {
      assessmentId: attention.id,
      targetId: attention.targetId,
      deservesAttention: attention.deservesAttention,
      attentionValue: attention.attentionValue,
      attentionCost: attention.attentionCost
    }, correlationId);
    this.emitFoundationEvent('DecisionRequested', 'decision', {
      eventType: 'DiscoveryCreated',
      targetId: discovery.id
    }, correlationId);
    const decision = decideCompanionAction({
      eventType: 'DiscoveryCreated',
      targetId: discovery.id,
      discovery,
      curiosity,
      attention,
      userContext,
      companionContext
    });
    this.emitFoundationEvent('CompanionDecisionMade', 'decision', {
      decisionId: decision.id,
      targetId: discovery.id,
      action: decision.action,
      timing: decision.timing,
      priority: decision.priority,
      reason: decision.reason
    }, correlationId);
    if (decision.action === 'stay_silent') {
      this.emitFoundationEvent('SilenceChosen', 'decision', { decisionId: decision.id, targetId: discovery.id }, correlationId);
    }
  }

  private getStoredAiSettings(): StoredAiSettings {
    return this.db.getAppSetting<StoredAiSettings>(AI_SETTINGS_KEY) ?? {};
  }

  private getAiSettings(): AiSettings {
    const stored = this.getStoredAiSettings();
    const replyLanguage = (this.db.getAppSetting<CompanionReplyLanguage>('ai.replyLanguage') ?? 'en') as CompanionReplyLanguage;
    const uiLang = (this.db.getAppSetting<UiLang>('ui.lang') ?? 'en') as UiLang;
    return {
      provider: 'deepseek',
      model: normalizeDeepSeekModel(stored.model || getConfiguredModel()),
      endpoint: stored.endpoint || process.env.DEEPSEEK_ENDPOINT || deepSeekDefaultEndpoint,
      apiKeyConfigured: Boolean(stored.apiKey || process.env.DEEPSEEK_API_KEY),
      replyLanguage,
      uiLang
    };
  }

  private updateAiSettings(input: UpdateAiSettingsInput): AiSettings {
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
    if (input.replyLanguage) this.db.setAppSetting('ai.replyLanguage', input.replyLanguage);
    if (input.uiLang) this.db.setAppSetting('ui.lang', input.uiLang);

    this.db.setAppSetting(AI_SETTINGS_KEY, next);
    return this.getAiSettings();
  }

  private getStoredSpeechSettings(): StoredSpeechSettings {
    return this.db.getAppSetting<StoredSpeechSettings>(SPEECH_SETTINGS_KEY) ?? {};
  }

  private getSpeechSettings(): SpeechSettings {
    const stored = this.getStoredSpeechSettings();
    return {
      useGpu: stored.useGpu ?? false
    };
  }

  private updateSpeechSettings(input: UpdateSpeechSettingsInput): SpeechSettings {
    const existing = this.getStoredSpeechSettings();
    const next: StoredSpeechSettings = { ...existing };
    if (input.useGpu !== undefined) next.useGpu = Boolean(input.useGpu);
    this.db.setAppSetting(SPEECH_SETTINGS_KEY, next);
    return this.getSpeechSettings();
  }

  private createDeepSeekClient(): DeepSeekClient {
    const stored = this.getStoredAiSettings();
    return new DeepSeekClient({
      apiKey: stored.apiKey || process.env.DEEPSEEK_API_KEY,
      model: normalizeDeepSeekModel(stored.model || getConfiguredModel()),
      endpoint: normalizeDeepSeekEndpoint(stored.endpoint || process.env.DEEPSEEK_ENDPOINT || deepSeekDefaultEndpoint)
    });
  }

  private getCharacterBehaviorSettings(): CharacterBehaviorSettings {
    const rules = this.db.getCharacterBehaviorRules(DEFAULT_CHARACTER_ID);
    const movementDefault = clampScore(Number(rules.movement ?? 25));
    const stored = this.db.getAppSetting<StoredCharacterBehaviorSettings>(CHARACTER_BEHAVIOR_SETTINGS_KEY) ?? {};
    const movementOverride =
      stored.movementOverride === undefined ? undefined : clampScore(Number(stored.movementOverride));

    return {
      movementDefault,
      movementOverride,
      effectiveMovement: movementOverride ?? movementDefault,
      source: movementOverride === undefined ? 'character' : 'override'
    };
  }

  private updateCharacterBehaviorSettings(input: UpdateCharacterBehaviorSettingsInput): CharacterBehaviorSettings {
    const next: StoredCharacterBehaviorSettings = {};
    if (!input.resetMovement && input.movementOverride !== undefined) {
      next.movementOverride = clampScore(Number(input.movementOverride));
    }
    this.db.setAppSetting(CHARACTER_BEHAVIOR_SETTINGS_KEY, next);
    return this.getCharacterBehaviorSettings();
  }
}

const AI_SETTINGS_KEY = 'ai.deepseek';
const SPEECH_SETTINGS_KEY = 'speech.whisper';
const CHARACTER_BEHAVIOR_SETTINGS_KEY = 'character.behavior';

interface StoredAiSettings {
  model?: string;
  endpoint?: string;
  apiKey?: string;
}

interface StoredSpeechSettings {
  useGpu?: boolean;
}

interface StoredCharacterBehaviorSettings {
  movementOverride?: number;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function shouldFallbackToMemory(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /readonly|read-only|permission|access|sqlite|database/i.test(message);
}

function getDebugRequestBody(error: unknown): unknown {
  return error instanceof DeepSeekRequestError ? error.requestBody : undefined;
}

function getDebugResponseBody(error: unknown): unknown {
  return error instanceof DeepSeekRequestError ? error.responseBody : undefined;
}

function whisperLanguageForReplyLanguage(replyLanguage: CompanionReplyLanguage): string {
  if (replyLanguage === 'zh-CN') return 'zh';
  return 'en';
}

