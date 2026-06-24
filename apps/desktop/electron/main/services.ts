import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';
import {
  DeepSeekClient,
  deepSeekDefaultEndpoint,
  getConfiguredModel,
  normalizeDeepSeekEndpoint,
  normalizeDeepSeekModel
} from '@our-companion/ai-engine';
import { advanceCharacter, applyEmotionEvent } from '@our-companion/character-engine';
import { DatabaseService } from '@our-companion/database';
import { generateDailyDiary } from '@our-companion/diary-engine';
import {
  createFallbackConnector,
  runDiscoveryPipeline
} from '@our-companion/discovery-engine';
import { createJourney, createJourneyMilestone } from '@our-companion/journey-engine';
import {
  createMemoryEdge,
  createMemoryNode,
  graphFromMemory,
  searchMemory,
  updateMemoryNode as updateMemoryNodePure
} from '@our-companion/memory-engine';
import type {
  AddDiscoveryToJourneyInput,
  AddJourneyMilestoneInput,
  AiSettings,
  CharacterBehaviorSettings,
  ChatInput,
  CompanionSessionPhase,
  CompanionTurnInput,
  CreateJourneyInput,
  CreateMemoryEdgeInput,
  CreateMemoryNodeInput,
  Discovery,
  DiscoveryFeedInput,
  DiscoverySource,
  NormalizedDiscovery,
  ToolExecuteInput,
  TranscribeAudioInput,
  UpdateAiSettingsInput,
  UpdateCharacterBehaviorSettingsInput,
  UpdateMemoryNodeInput
} from '@our-companion/shared';
import { DEFAULT_CHARACTER_ID } from '@our-companion/shared';
import { executeTool, previewTool } from '@our-companion/tool-engine';
import { getWhisperStatus, transcribeRecording } from '@our-companion/speech-engine';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';
import type { DiscoveryRefreshResult } from './discoveryScheduler';

export class AppServices {
  readonly db: DatabaseService;
  readonly databaseMode: 'persistent' | 'memory';
  companionSessionPhase: CompanionSessionPhase = 'idle';
  companionDragging = false;
  private shareOrchestrator?: DiscoveryShareOrchestrator;

  constructor(dbPath = path.join(app.getPath('userData'), 'our-companion.db')) {
    const userDataDir = app.getPath('userData');
    fs.mkdirSync(userDataDir, { recursive: true });

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
      return this.db.saveCharacterState({ ...state, position: { x: input.x, y: input.y } });
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
      return this.db.saveCharacterState(next);
    }
  };

  discovery = {
    getFeed: async (input: DiscoveryFeedInput = {}) => this.db.listDiscoveries(input),
    refresh: async (input: { sources?: DiscoverySource[] } = {}) => {
      const result = await this.runDiscoveryRefresh(input.sources);
      this.queueDiscoveryAnnouncements(result.newlyInserted);
      return result.discoveries;
    },
    markInterested: async (discoveryId: string) => {
      const discovery = this.db.updateDiscoveryStatus(discoveryId, 'saved');
      const state = this.db.getCharacterState();
      this.db.saveCharacterState({ ...state, emotion: applyEmotionEvent(state.emotion, 'user_accepts_discovery') });
      return discovery;
    },
    markNotInterested: async (discoveryId: string) => {
      const discovery = this.db.updateDiscoveryStatus(discoveryId, 'rejected');
      const state = this.db.getCharacterState();
      this.db.saveCharacterState({ ...state, emotion: applyEmotionEvent(state.emotion, 'user_rejects_discovery') });
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
      return { journey, milestone, memory };
    }
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
      const entry = generateDailyDiary({
        characterId: input.characterId ?? DEFAULT_CHARACTER_ID,
        milestones: this.db.listMilestones().slice(0, 10),
        savedDiscoveries: this.db.listDiscoveries({ status: 'saved', limit: 10 }) as Discovery[],
        completedTasks: [],
        memoryChanges: this.db.listMemoryNodes().slice(0, 10)
      });
      return this.db.insertDiary(entry);
    }
  };

  tool = {
    preview: async (input: ToolExecuteInput) => previewTool(input),
    execute: async (input: ToolExecuteInput) =>
      executeTool(input, {
        openUrl: async (url) => shell.openExternal(url),
        openApp: async (appName) => openKnownApp(appName),
        searchWeb: async (query, target) => shell.openExternal(searchUrl(query, target)),
        browserNavigation: async (action, url) => {
          if (action === 'open_tab' && url) return shell.openExternal(url);
          return { action, handledBy: 'browser_navigation_stub' };
        }
      })
  };

  ai = {
    getSettings: async () => this.getAiSettings(),
    updateSettings: async (input: UpdateAiSettingsInput) => this.updateAiSettings(input),
    chat: async (input: ChatInput) => {
      try {
        return {
          message: await this.createDeepSeekClient().chat([
            {
              role: 'system',
              content:
                'You are Ann, the active companion inside Our Companion. Be warm, brief, curious, and never romantic or clingy.'
            },
            { role: 'user', content: input.message }
          ])
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          message: `DeepSeek request failed. Check Settings > model, endpoint, and API key. Details: ${message}`
        };
      }
    },
    generateDiscoveryReason: async (input: { discovery: NormalizedDiscovery }) => ({
      why_this_matters: `${input.discovery.title} matches Ann's curiosity around web, UX, and exploration.`,
      recommended_action: 'view' as const,
      short_message: 'I found something that might be worth a small look.',
      tags: input.discovery.tags
    }),
    summarizeMemory: async (input: { content: string }) => ({
      type: 'topic' as const,
      title: input.content.slice(0, 48) || 'Untitled memory',
      summary: input.content.slice(0, 180),
      importance_score: 50
    })
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
    transcribe: async (input: TranscribeAudioInput) => {
      const result = await transcribeRecording({
        audio: input.audio,
        mimeType: input.mimeType,
        userDataRoot: app.getPath('userData')
      });
      return { text: result.text };
    }
  };

  companion = {
    turn: async (input: CompanionTurnInput) => {
      const reply = await this.ai.chat({ message: input.message, characterId: input.characterId });
      if (input.source === 'voice') {
        const state = this.db.getCharacterState(input.characterId);
        this.db.saveCharacterState({
          ...state,
          emotion: applyEmotionEvent(state.emotion, 'expertise_topic_match')
        });
      }
      return reply;
    },
    reportSessionPhase: async (phase: CompanionSessionPhase) => {
      this.companionSessionPhase = phase;
    },
    reportDragging: async (input: { dragging: boolean }) => {
      this.companionDragging = input.dragging;
    }
  };

  attachShareOrchestrator(orchestrator: DiscoveryShareOrchestrator): void {
    this.shareOrchestrator = orchestrator;
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

  private queueDiscoveryAnnouncements(discoveries: Discovery[]): void {
    const shared = discoveries.filter((discovery) => discovery.status === 'shared');
    if (shared.length > 0) {
      this.shareOrchestrator?.enqueue(shared);
    }
  }

  private getStoredAiSettings(): StoredAiSettings {
    return this.db.getAppSetting<StoredAiSettings>(AI_SETTINGS_KEY) ?? {};
  }

  private getAiSettings(): AiSettings {
    const stored = this.getStoredAiSettings();
    return {
      provider: 'deepseek',
      model: normalizeDeepSeekModel(stored.model || getConfiguredModel()),
      endpoint: stored.endpoint || process.env.DEEPSEEK_ENDPOINT || deepSeekDefaultEndpoint,
      apiKeyConfigured: Boolean(stored.apiKey || process.env.DEEPSEEK_API_KEY)
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

    this.db.setAppSetting(AI_SETTINGS_KEY, next);
    return this.getAiSettings();
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
const CHARACTER_BEHAVIOR_SETTINGS_KEY = 'character.behavior';

interface StoredAiSettings {
  model?: string;
  endpoint?: string;
  apiKey?: string;
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

function searchUrl(query: string, target?: string): string {
  const encoded = encodeURIComponent(query);
  if (target === 'youtube') return `https://www.youtube.com/results?search_query=${encoded}`;
  if (target === 'github') return `https://github.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function openKnownApp(appName: string): Promise<{ appName: string; started: boolean }> {
  const allowedApps: Record<string, string> = {
    chrome: 'chrome',
    chromium: 'chromium',
    edge: 'msedge',
    firefox: 'firefox',
    notepad: 'notepad',
    calculator: 'calc',
    vscode: 'code'
  };
  const executable = allowedApps[appName.toLowerCase()];
  if (!executable) throw new Error(`App is not in the v1 allowlist: ${appName}`);

  const child = spawn(executable, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  return Promise.resolve({ appName, started: true });
}
