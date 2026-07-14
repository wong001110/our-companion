import fs from 'node:fs';
import path from 'node:path';
import { app, dialog } from 'electron';
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
import type { CommandAckStatus, CompanionDecision, CompanionCommand, CompanionCommandAck, VisualVisitRendererState } from '@our-companion/shared';
import { generateDailyDiary } from '@our-companion/diary-engine';
import {
  createFallbackConnector,
  planExploration,
  runDiscoveryAgents,
  runDiscoveryPipeline
} from '@our-companion/discovery-engine';
import { generateInsights, selectPrimaryInsight } from '@our-companion/insight-engine';
import { createCompanionJourney, createJourney, createJourneyMilestone, createJourneyMilestoneV2 } from '@our-companion/journey-engine';
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
  ActionPlanV2,
  ActionResult,
  AddDiscoveryToJourneyInput,
  AddJourneyMilestoneInput,
  AiDebugEntry,
  AiSettings,
  CharacterBehaviorSettings,
  CharacterRuntimeState,
  ChatInput,
  CompanionInsight,
  InsightV2,
  CompanionAppendMessageInput,
  CompanionHistoryInput,
  CompanionMessage,
  CompanionPersonality,
  CompanionPersonalityAnalysis,
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
  PerformanceScriptV2,
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
import type { UserProfile, OnlineMode, RegisterUserInput, LoginUserInput } from '@our-companion/shared';
import { COMPANION_ANIMATION_MANIFEST, COMPANION_CHAT_CONTEXT_LIMIT, createId, nowIso, clampScore, type BaseEvent, type CompanionAnimationManifestEntry } from '@our-companion/shared';
import { detectPatterns } from '@our-companion/pattern-engine';
import { executeActionStep, executeTool, previewTool } from '@our-companion/tool-engine';
import { createElectronToolAdapters } from './platform/electronCommandAdapter';
import { getWhisperStatus, transcribeRecording } from '@our-companion/speech-engine';
import { createEvent, globalEventBus, type EventBus } from '@our-companion/event-bus';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';
import type { DiscoveryRefreshResult } from './discoveryScheduler';
import { buildEngineSnapshot } from './engineSnapshot';
import { CompanionRuntime } from './companionRuntime';
import {
  COMPANION_ASSET_SUBFOLDERS,
  CompanionAssetPathError,
  getCompanionAssetMimeType,
  isSupportedCompanionAssetExtension,
  resolveCompanionAssetPath as resolveCompanionAssetPathSafe,
  type ResolveCompanionAssetPathInput
} from './platform/companionAssetPaths';
import { NetworkConnectionService, type NetworkStatus } from './networkConnection';
import { PublicCompanionService } from './network/publicCompanionService';
import { VisitService } from './network/visitService';
import { VisualVisitService } from './network/visualVisitService';

const DEBUG_LOG_MAX = 100;
const FOUNDATION_EVENT_LOG_MAX = 200;
const PERSONALITY_ANALYSIS_MAX_ENTRIES = 50;
export const MAX_COMPANION_ASSET_BYTES = 20 * 1024 * 1024;
export const MAX_COMPANION_TOTAL_ASSET_BYTES = 200 * 1024 * 1024;

export function toPersistedCompanionInsight(
  insight: InsightV2,
  companionId: string,
  whyCompanionFoundIt: string,
  supportingCandidateIds: string[]
): CompanionInsight {
  const type = insight.category === 'risk' ? 'warning'
    : insight.category === 'project' ? 'practical_next_step'
    : insight.category === 'discovery' ? 'observation'
    : 'pattern';
  return {
    id: insight.id, userId: insight.userId, companionId, title: insight.title, type,
    summary: insight.summary, insight: insight.explanation, whyItMatters: insight.explanation,
    whyCompanionFoundIt, confidence: insight.confidence, novelty: insight.novelty,
    emotionalRelevance: 0.5, practicalRelevance: insight.importance, supportingCandidateIds,
    relatedMemoryIds: insight.supportingMemoryIds, relatedPatternIds: insight.supportingPatternIds,
    createdAt: insight.createdAt,
  };
}

export type CommandRecordStatus = 'issued' | CommandAckStatus;

interface ActiveCommandRecord {
  command: CompanionCommand;
  latestStatus: CommandRecordStatus;
  updatedAt: string;
  terminal: boolean;
}

export const VALID_COMMAND_TRANSITIONS: Record<CommandRecordStatus, CommandAckStatus[]> = {
  issued: ['received', 'failed', 'cancelled'],
  received: ['started', 'failed', 'cancelled'],
  started: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export class AppServices {
  readonly db: DatabaseService;
  readonly databaseMode: 'persistent' | 'memory';
  companionSessionPhase: CompanionSessionPhase = 'inactive';
  companionDragging = false;
  private shareOrchestrator?: DiscoveryShareOrchestrator;
  private readonly companionRuntime: CompanionRuntime;
  private explorationBroadcaster?: (event: ExplorationLoopEvent) => void;
  private commandBroadcaster?: (command: CompanionCommand) => void;
  private activeCommand: ActiveCommandRecord | null = null;
  private foundationEventBroadcaster?: (event: BaseEvent) => void;
  private debugLog: AiDebugEntry[] = [];
  private foundationEventLog: BaseEvent[] = [];
  private runtimeStarted = false;
  private readonly personalityAnalyses = new Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>();
  readonly network: NetworkConnectionService;
  readonly publicCompanions: PublicCompanionService;
  readonly visits: VisitService;
  readonly visualVisits: VisualVisitService;
  private networkStatusBroadcaster?: (status: NetworkStatus) => void;
  private visualVisitBroadcaster?: (state: VisualVisitRendererState) => void;
  private localCompanionAway = false;

  constructor(
    dbPath = path.join(app.getPath('userData'), 'our-companion.db'),
    readonly eventBus: EventBus = globalEventBus
  ) {
    const userDataDir = app.getPath('userData');
    if (userDataDir !== ':memory:') {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    try {
      this.db = new DatabaseService({
        path: dbPath,
        legacyAnnHasCustomAssets: () => {
          const directory = path.join(userDataDir, 'companions', 'ann');
          return fs.existsSync(directory) && fs.readdirSync(directory, { recursive: true }).length > 0;
        },
      });
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

    this.companionRuntime = new CompanionRuntime(
      this.db,
      (state) => {
        this.emitFoundationEvent('CharacterStateChanged', 'character', {
          characterId: state.characterId,
          coreState: state.coreState,
          intent: state.intent,
          animationIntent: state.animationIntent,
          lifeActivity: state.lifeActivity,
        });
      },
      (decision) => {
        this.emitFoundationEvent('CompanionDecisionMade', 'decision', {
          decisionId: decision.id,
          action: decision.action,
          timing: decision.timing,
          priority: decision.priority,
          reason: decision.reason,
          displayHint: decision.displayHint,
        });
      },
      (command) => {
        if (!this.tryActivateCommand(command)) return false;
        this.commandBroadcaster?.(command);
        this.tryPresentPendingDiscovery(command);
        return true;
      }
    );
    let visits: VisitService | undefined;
    let visualVisits: VisualVisitService | undefined;
    let wasOnline = false;
    let lastVisitRevision: number | undefined;
    this.network = new NetworkConnectionService(this.db, (status) => {
      const visitInvalidated = status.socialInvalidation?.type === 'visit_session' && status.socialRevision !== lastVisitRevision;
      if (visitInvalidated) lastVisitRevision = status.socialRevision;
      if (status.state === 'reconnecting') { visits?.stopAll(); visualVisits?.pauseForReconnect(); }
      if (status.state === 'online' && (!wasOnline || visitInvalidated)) {
        void visits?.reconcile();
        void visualVisits?.reconcile();
      }
      wasOnline = status.state === 'online';
      this.networkStatusBroadcaster?.(status);
    });
    this.publicCompanions = new PublicCompanionService(this.db, this.network, userDataDir);
    this.visits = new VisitService(this.network, this.publicCompanions);
    visits = this.visits;
    this.visualVisits = new VisualVisitService(this.network, this.visits, this.publicCompanions, (state) => {
      this.localCompanionAway = state.ownerPresenceMode === 'away_visiting';
      this.companionRuntime.setVisualPresenceMode(state.ownerPresenceMode);
      this.visualVisitBroadcaster?.(state);
    });
    visualVisits = this.visualVisits;
    this.network.setTransferLifecycleHandler(() => { this.publicCompanions.cancelTransfers(); this.visits.stopAll(); this.visualVisits.stopAll('network_lifecycle_ended'); });
    this.companionRuntime.setExplicitMode(
      this.db.getAppSetting<'available' | 'focused' | 'do_not_disturb'>('attention_mode') ?? 'available'
    );
  }

  hasActiveCompanion(): boolean {
    return this.db.tryResolveActiveCompanionId() !== null;
  }

  private resolveCompanionRoot(companionId: string): string {
    return path.resolve(app.getPath('userData'), 'companions', companionId);
  }

  private resolveCompanionAssetPath(input: ResolveCompanionAssetPathInput) {
    return resolveCompanionAssetPathSafe(input, {
      userDataDir: app.getPath('userData'),
      companionExists: (companionId) => Boolean(this.db.getCompanion(companionId)),
    });
  }

  private prunePersonalityAnalyses(): void {
    const now = Date.now();
    for (const [id, analysis] of this.personalityAnalyses) {
      if (analysis.used || analysis.expiresAt <= now) {
        this.personalityAnalyses.delete(id);
      }
    }
    const overflow = this.personalityAnalyses.size - PERSONALITY_ANALYSIS_MAX_ENTRIES;
    if (overflow <= 0) return;
    const oldest = [...this.personalityAnalyses.entries()]
      .sort((left, right) => left[1].expiresAt - right[1].expiresAt)
      .slice(0, overflow);
    for (const [id] of oldest) {
      this.personalityAnalyses.delete(id);
    }
  }

  private requireActiveCompanion(): CompanionProfile {
    const companion = this.db.getPrimaryCompanion();
    if (!companion) throw new Error('NO_ACTIVE_COMPANION: No active Companion. Complete Companion creation first.');
    return companion;
  }

  /** Starts companion-owned schedulers only after onboarding has produced a primary Companion. */
  startRuntimeIfReady(): boolean {
    if (this.runtimeStarted || !this.hasActiveCompanion()) return false;
    this.companionRuntime.startLifeScheduler();
    this.runtimeStarted = true;
    return true;
  }

  character = {
    getState: async (characterId?: string) => this.db.getCharacterState(characterId),
    getActive: async () => this.db.getActiveCharacters(),
    getBehaviorSettings: async (characterId?: string) => this.getCharacterBehaviorSettings(characterId),
    updateBehaviorSettings: async (input: UpdateCharacterBehaviorSettingsInput) => this.updateCharacterBehaviorSettings(input),
    setPrimary: async (characterId: string) => this.db.setPrimaryCharacter(characterId),
    updatePosition: async (input: { characterId?: string; x: number; y: number }) => {
      const state = this.db.getCharacterState(input.characterId);
      const next = this.db.saveCharacterState({ ...state, position: { x: input.x, y: input.y } });
      this.emitFoundationEvent('CharacterStateChanged', 'character', {
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
      this.emitFoundationEvent('CharacterStateChanged', 'character', {
        characterId: saved.characterId,
        coreState: saved.coreState,
        intent: saved.intent
      });
      return saved;
    }
  };

  companionNew = {
    analyzePersonality: async (description: string): Promise<CompanionPersonalityAnalysis> => this.analyzeCompanionPersonality(description),
    create: async (input: CreateCompanionInput): Promise<CompanionProfile> => {
      this.prunePersonalityAnalyses();
      const name = input.name.trim();
      const description = input.personalityDescription.trim();
      if (!name || !description || !input.personalityAnalysisId) {
        throw new Error('AI personality analysis is required before creating a Companion.');
      }
      const analysis = this.personalityAnalyses.get(input.personalityAnalysisId);
      if (!analysis || analysis.used || analysis.expiresAt <= Date.now() || analysis.description !== description) {
        throw new Error('AI personality analysis is invalid, expired, or already used. Analyze the description again.');
      }
      const assets = input.assets ?? [];
      if (new Set(assets.map((asset) => asset.animationKey)).size !== assets.length) {
        throw new Error('Duplicate Companion animation assets are not allowed.');
      }
      const assetsByKey = new Map(assets.map((asset) => [asset.animationKey, asset]));
      const requiredAssets = COMPANION_ANIMATION_MANIFEST.filter((entry) => entry.requiredForCreation);
      if (requiredAssets.some((entry) => !assetsByKey.has(entry.key))) {
        throw new Error('All required Companion animation assets must be provided.');
      }
      const manifestByKey = new Map(COMPANION_ANIMATION_MANIFEST.map((entry) => [entry.key, entry]));
      const validatedAssets = new Map<string, Buffer>();
      let totalBytes = 0;
      for (const asset of assets) {
        const definition = manifestByKey.get(asset.animationKey);
        if (!definition) throw new Error(`${asset.animationKey} is not a supported Companion animation.`);
        const bytes = toBuffer(asset.buffer);
        validateCompanionPngAsset(definition, bytes);
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_COMPANION_TOTAL_ASSET_BYTES) {
          throw new Error('Companion animation assets exceed the maximum total size.');
        }
        validatedAssets.set(definition.key, bytes);
      }
      analysis.used = true;
      let companion: CompanionProfile | undefined;
      let companionDir: string | undefined;
      try {
        const shouldBecomePrimary = !this.db.getPrimaryCompanion();
        companion = this.db.createCompanion({ ...input, name, personalityDescription: description, personality: analysis.personality });
        companionDir = this.resolveCompanionRoot(companion.id);
        const animationsDir = this.resolveCompanionAssetPath({
          companionId: companion.id,
          relativePath: path.join('assets', 'animations')
        }).target;
        fs.mkdirSync(animationsDir, { recursive: true });
        for (const entry of requiredAssets) {
          const filePath = this.resolveCompanionAssetPath({
            companionId: companion.id,
            subfolder: 'animations',
            fileName: entry.fileName
          }).target;
          fs.writeFileSync(filePath, validatedAssets.get(entry.key)!);
        }
        companion = this.db.updateCompanion(companion.id, { assetRoot: `companion://${companion.id}/assets` });
        if (shouldBecomePrimary) companion = this.db.setPrimaryCompanion(companion.id);
        this.personalityAnalyses.delete(input.personalityAnalysisId);
        return companion;
      } catch (error) {
        analysis.used = false;
        if (companion) this.db.rollbackCompanionCreation(companion.id);
        if (companionDir && fs.existsSync(companionDir)) fs.rmSync(companionDir, { recursive: true, force: true });
        throw error;
      }
    },
    list: async (): Promise<CompanionProfile[]> => {
      const companions = this.db.listCompanions();
      return companions.map((c) => {
        if (!c.assetRoot.startsWith('companion://')) {
          const correctRoot = `companion://${c.id}/assets`;
          return this.db.updateCompanion(c.id, { assetRoot: correctRoot });
        }
        return c;
      });
    },
    get: async (id: string): Promise<CompanionProfile | null> => {
      return this.db.getCompanion(id);
    },
    update: async (input: { id: string } & UpdateCompanionInput): Promise<CompanionProfile> => {
      this.prunePersonalityAnalyses();
      const { id, ...rest } = input;
      const current = this.db.getCompanion(id);
      if (!current) throw new Error(`Companion not found: ${id}`);
      const description = rest.personalityDescription?.trim() ?? current.personalityDescription;
      const personalityChanged = rest.personality !== undefined || description !== current.personalityDescription;
      let consumedAnalysis: { used: boolean } | undefined;
      let consumedAnalysisId: string | undefined;
      if (personalityChanged) {
        const analysis = rest.personalityAnalysisId ? this.personalityAnalyses.get(rest.personalityAnalysisId) : undefined;
        if (!analysis || analysis.used || analysis.expiresAt <= Date.now() || analysis.description !== description) {
          throw new Error('A current AI personality analysis is required to update personality.');
        }
        analysis.used = true;
        consumedAnalysis = analysis;
        consumedAnalysisId = rest.personalityAnalysisId;
        rest.personality = analysis.personality;
        rest.personalityDescription = description;
      }
      const { personalityAnalysisId: _analysisId, ...trusted } = rest;
      try {
        const updated = this.db.updateCompanion(id, trusted);
        if (consumedAnalysisId) this.personalityAnalyses.delete(consumedAnalysisId);
        return updated;
      } catch (error) {
        if (consumedAnalysis) consumedAnalysis.used = false;
        throw error;
      }
    },
    delete: async (id: string): Promise<{ id: string; deleted: true }> => {
      const companion = this.db.getCompanion(id);
      if (!companion) throw new Error(`Companion not found: ${id}`);
      if (this.db.listCompanions().length <= 1) throw new Error('Create another Companion before deleting your only Companion.');
      if (companion.isPrimary) throw new Error('Choose another primary Companion before deleting this Companion.');
      const result = this.db.deleteCompanion(id);
      const companionDir = path.join(app.getPath('userData'), 'companions', id);
      if (fs.existsSync(companionDir)) fs.rmSync(companionDir, { recursive: true, force: true });
      return result;
    },
    setPrimary: async (id: string): Promise<CompanionProfile> => {
      this.cancelCommandForCompanionSwitch(id);
      const companion = this.db.setPrimaryCompanion(id);
      this.startRuntimeIfReady();
      return companion;
    },
    getPrimary: async (): Promise<CompanionProfile | null> => {
      const companion = this.db.getPrimaryCompanion();
      if (companion && !companion.assetRoot.startsWith('companion://')) {
        const correctRoot = `companion://${companion.id}/assets`;
        return this.db.updateCompanion(companion.id, { assetRoot: correctRoot });
      }
      return companion;
    },
    getAssetRoot: async (id: string): Promise<string> => {
      const companion = this.db.getCompanion(id);
      if (!companion) throw new Error(`Companion not found: ${id}`);
      const companionsDir = this.resolveCompanionAssetPath({ companionId: id, relativePath: 'assets' }).target;
      fs.mkdirSync(companionsDir, { recursive: true });
      return `companion://${id}/assets`;
    },
    uploadAsset: async (input: { companionId: string; fileName: string; buffer: ArrayBuffer | Uint8Array }): Promise<{ name: string; path: string }> => {
      if (!this.db.getCompanion(input.companionId)) throw new Error(`Companion not found: ${input.companionId}`);
      const definition = COMPANION_ANIMATION_MANIFEST.find((entry) => entry.fileName === input.fileName);
      if (!definition) throw new Error(`${input.fileName} is not a valid Companion animation asset.`);
      const buf = toBuffer(input.buffer);
      validateCompanionPngAsset(definition, buf);
      const animationsDir = this.resolveCompanionAssetPath({
        companionId: input.companionId,
        relativePath: path.join('assets', 'animations')
      }).target;
      fs.mkdirSync(animationsDir, { recursive: true });
      const filePath = this.resolveCompanionAssetPath({
        companionId: input.companionId,
        subfolder: 'animations',
        fileName: definition.fileName
      }).target;
      if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isFile()) {
        throw new Error('Cannot overwrite a non-file Companion asset.');
      }
      fs.writeFileSync(filePath, buf);
      return { name: definition.fileName, path: filePath };
    },
    listAssets: async (companionId: string): Promise<Array<{ name: string; size: number; subfolder: string }>> => {
      if (!this.db.getCompanion(companionId)) throw new Error(`Companion not found: ${companionId}`);
      const assetsDir = this.resolveCompanionAssetPath({ companionId, relativePath: 'assets' }).target;
      if (!fs.existsSync(assetsDir)) return [];
      const results: Array<{ name: string; size: number; subfolder: string }> = [];
      for (const subfolder of COMPANION_ASSET_SUBFOLDERS) {
        const dir = this.resolveCompanionAssetPath({
          companionId,
          relativePath: path.join('assets', subfolder)
        }).target;
        if (!fs.existsSync(dir)) continue;
        if (!fs.lstatSync(dir).isDirectory()) continue;
        for (const file of fs.readdirSync(dir)) {
          if (!isSupportedCompanionAssetExtension(file)) continue;
          const filePath = this.resolveCompanionAssetPath({ companionId, subfolder, fileName: file, mustExist: true }).target;
          const stat = fs.lstatSync(filePath);
          if (stat.isFile()) {
            results.push({ name: file, size: stat.size, subfolder });
          }
        }
      }
      return results;
    },
    deleteAsset: async (input: { companionId: string; subfolder: string; fileName: string }): Promise<{ deleted: true }> => {
      if (!this.db.getCompanion(input.companionId)) throw new Error(`Companion not found: ${input.companionId}`);
      if (!isSupportedCompanionAssetExtension(input.fileName)) throw new Error('Unsupported Companion asset type.');
      const filePath = this.resolveCompanionAssetPath({
        companionId: input.companionId,
        subfolder: input.subfolder,
        fileName: input.fileName,
        mustExist: true
      }).target;
      if (!fs.existsSync(filePath)) throw new Error('Asset not found');
      if (!fs.lstatSync(filePath).isFile()) throw new Error('Only regular asset files can be deleted.');
      fs.unlinkSync(filePath);
      return { deleted: true };
    },
    readAsset: async (input: { companionId: string; subfolder: string; fileName: string }): Promise<{ dataUrl: string } | null> => {
      if (!this.db.getCompanion(input.companionId)) throw new Error(`Companion not found: ${input.companionId}`);
      const mime = getCompanionAssetMimeType(input.fileName);
      if (!mime) throw new Error('Unsupported Companion asset type.');
      let filePath: string;
      try {
        filePath = this.resolveCompanionAssetPath({
          companionId: input.companionId,
          subfolder: input.subfolder,
          fileName: input.fileName,
          mustExist: true
        }).target;
      } catch (error) {
        if (error instanceof CompanionAssetPathError && error.code === 'not_found') return null;
        throw error;
      }
      if (!fs.existsSync(filePath)) return null;
      if (!fs.lstatSync(filePath).isFile()) throw new Error('Only regular asset files can be read.');
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      return { dataUrl: `data:${mime};base64,${base64}` };
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
      this.applyCharacterEmotion(undefined, 'user_accepts_discovery');
      return discovery;
    },
    markNotInterested: async (discoveryId: string) => {
      const discovery = this.db.updateDiscoveryStatus(discoveryId, 'rejected');
      this.applyCharacterEmotion(undefined, 'user_rejects_discovery');
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
    create: async (input: CreateJourneyInput) =>
      this.db.insertJourney(createJourney({ title: input.title, description: input.description })),
    getActive: async () => this.db.listActiveJourneys(),
    getTimeline: async (input: { journeyId?: string } = {}) => this.db.listMilestones(input.journeyId),
    addMilestone: async (input: AddJourneyMilestoneInput) =>
      this.db.insertMilestone(
        createJourneyMilestone({
          journeyId: input.journeyId,
          title: input.title,
          summary: input.summary,
          type: input.type
        })
      )
  };

  diary = {
    getEntries: async (input: { type?: 'daily' | 'weekly' | 'milestone'; limit?: number } = {}) => this.db.listDiaryEntries(input),
    generateDaily: async (input: { characterId?: string } = {}) => {
      const correlationId = createId('corr');
      const characterId = this.db.resolveActiveCompanionId(input.characterId);
      this.emitFoundationEvent('ReflectionRequested', 'reflection', {
        characterId
      }, correlationId);
      const entry = generateDailyDiary({
        characterId,
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

  onPerformanceListeners: Array<(script: PerformanceScriptV2) => void> = [];

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
    executePlan: async (plan: ActionPlanV2) => {
      const correlationId = createId('corr');
      this.emitFoundationEvent('ActionRequested', 'action', { planId: plan.id, intentId: plan.intentId }, correlationId);
      const adapters = createElectronToolAdapters();
      const orchDeps: ActionOrchestratorDeps = {
        executeStep: (toolName: string, args: Record<string, unknown>) => executeActionStep(toolName, args, adapters),
        emitEvent: (type: string, payload?: Record<string, unknown>, cid?: string) => this.emitFoundationEvent(type, 'action', payload, cid ?? correlationId),
        getPermissions: () => this.db.getActionPermissions(),
        directPerformance: (actionId: string, outcome: 'success' | 'failure') => directPerformance(actionId, outcome),
        broadcastPerformance: (script: PerformanceScriptV2) => {
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
    const companion = this.db.getCompanion(characterId);
    if (!companion) throw new Error(`Companion not found: ${characterId}`);
    const name = companion.name;
    const personalityDesc = `Personality: ${companion.personalityDescription}.`;
    return [
      {
        role: 'system',
        content:
          `You are ${name}, the active companion inside Our Companion. ${personalityDesc} Be warm, brief, curious, and never romantic or clingy. ${langInstruction}`
      },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage }
    ];
  }

  ai = {
    getSettings: async () => this.getAiSettings(),
    updateSettings: async (input: UpdateAiSettingsInput) => this.updateAiSettings(input),
    chat: async (input: ChatInput) => {
      const characterId = this.db.resolveActiveCompanionId(input.characterId);
      const builtMessages = this.buildChatMessages(characterId, input.message);
      this.db.insertCompanionMessage({ role: 'user', content: input.message, source: 'panel', characterId });
      try {
        const { content: message } = await this.sendToAi({ messages: builtMessages, channel: 'chat', source: 'panel' });
        this.db.insertCompanionMessage({ role: 'assistant', content: message, source: 'panel', characterId });
        this.emitFoundationEvent('CompanionMessageQueued', 'speech', { characterId, source: 'panel', message });
        return { message };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const reply = `DeepSeek request failed. Check Settings > model, endpoint, and API key. Details: ${errMsg}`;
        this.db.insertCompanionMessage({ role: 'assistant', content: reply, source: 'panel', characterId, status: 'error', metadata: { error: errMsg } });
        this.emitFoundationEvent('CompanionMessageQueued', 'speech', { characterId, source: 'panel', status: 'error', message: reply });
        return { message: reply };
      }
    },
    generateDiscoveryReason: async (input: { discovery: NormalizedDiscovery }) => {
      const primary = this.requireActiveCompanion();
      const name = primary.name;
      const personalityDesc = ` Personality: ${primary.personalityDescription}`;
      const fallback = {
        why_this_matters: `${input.discovery.title} matches ${name}'s curiosity around web, UX, and exploration.`,
        recommended_action: 'view' as const,
        short_message: 'I found something that might be worth a small look.',
        tags: input.discovery.tags
      };
      const builtMessages = [
        {
          role: 'system',
          content:
            `You are ${name}, the user's desktop companion.${personalityDesc}\n\n` +
            'Your job is NOT to explain the full discovery aloud.\n' +
            'You should gently point out why this discovery may interest the user.\n\n' +
            `Speak like ${name}:\n` +
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
            `- short_message is what ${name} says aloud.\n` +
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
      try {
        const { content } = await this.sendToAi({ messages: builtMessages, channel: 'discovery_reason', source: input.discovery.source });
        return validateDiscoveryReason(content);
      } catch {
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
      if (this.localCompanionAway) throw new Error('COMPANION_AWAY_VISITING');
      const characterId = this.db.resolveActiveCompanionId(input.characterId);
      const source = input.source === 'voice' ? 'voice' : 'companion_text';
      const sessionId = this.companionRuntime.getActiveSessionId() ?? undefined;
      const builtMessages = this.buildChatMessages(characterId, input.message);
      this.db.insertCompanionMessage({ role: 'user', content: input.message, source, characterId, sessionId });
      try {
        const { content: message } = await this.sendToAi({ messages: builtMessages, channel: 'turn', source });
        this.db.insertCompanionMessage({ role: 'assistant', content: message, source, characterId, sessionId });
        this.companionRuntime.processMemoryFromTurn(characterId, input.message, message, sessionId);
        if (input.source === 'voice') {
          this.applyCharacterEmotion(characterId, 'expertise_topic_match');
        }
        this.emitFoundationEvent('CompanionMessageQueued', 'speech', { characterId, source, message });
        return { message };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const reply = `DeepSeek request failed. Check Settings > model, endpoint, and API key. Details: ${errMsg}`;
        this.db.insertCompanionMessage({ role: 'assistant', content: reply, source, characterId, status: 'error', metadata: { error: errMsg } });
        this.emitFoundationEvent('CompanionMessageQueued', 'speech', { characterId, source, status: 'error', message: reply });
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
      this.companionRuntime.setSessionPhase(phase);
    },
    reportDragging: async (input: { dragging: boolean }) => {
      this.companionDragging = input.dragging;
      this.companionRuntime.setDragging(input.dragging);
    },
    getAttentionMode: async (): Promise<'available' | 'focused' | 'do_not_disturb'> =>
      this.db.getAppSetting<'available' | 'focused' | 'do_not_disturb'>('attention_mode') ?? 'available',
    setAttentionMode: async (mode: 'available' | 'focused' | 'do_not_disturb'): Promise<void> => {
      this.db.setAppSetting('attention_mode', mode);
      this.companionRuntime.setExplicitMode(mode);
    },
    listPendingActions: async () => {
      const companionId = this.db.resolveActiveCompanionId();
      return this.db.listPendingActions(companionId, 'local').filter((action) => action.status === 'pending' || action.status === 'ready');
    },
    cancelPendingAction: async (id: string): Promise<void> => {
      this.db.updatePendingActionStatus(id, 'cancelled');
    },
    getActiveCommand: async (): Promise<CompanionCommand | null> => {
      const record = this.activeCommand;
      const activeCompanionId = this.db.resolveActiveCompanionId();
      if (!record || record.terminal) return null;
      if (record.command.companionId !== activeCompanionId) {
        this.transitionActiveCommand('cancelled', {
          commandId: record.command.id,
          companionId: record.command.companionId,
          reason: 'companion_switched',
        });
        return null;
      }
      if (record.command.expiresAt && Date.parse(record.command.expiresAt) <= Date.now()) {
        this.transitionActiveCommand('cancelled', {
          commandId: record.command.id,
          companionId: record.command.companionId,
          reason: 'command_expired',
        });
        return null;
      }
      return record.command;
    },
    reportCommandAck: async (ack: CompanionCommandAck) => {
      this.transitionActiveCommand(ack.status, ack);
    }
  };

  /** Keeps one authoritative command record; the renderer is never sent a predictable busy conflict. */
  private tryActivateCommand(command: CompanionCommand): boolean {
    if (this.localCompanionAway) return false;
    if (this.activeCommand && !this.activeCommand.terminal) {
      this.emitFoundationEvent('CompanionCommandDeferred', 'companion', {
        commandId: command.id,
        decisionId: command.decision.id,
        companionId: command.companionId,
        reason: 'active_command_exists',
      });
      return false;
    }
    this.activeCommand = { command, latestStatus: 'issued', updatedAt: new Date().toISOString(), terminal: false };
    return true;
  }

  private transitionActiveCommand(nextStatus: CommandAckStatus, input: {
    commandId?: string;
    companionId?: string;
    reason?: string;
    failedStep?: string;
    reportedAt?: string;
  }): boolean {
    const record = this.activeCommand;
    const validNextStatuses = record ? VALID_COMMAND_TRANSITIONS[record.latestStatus] ?? [] : [];
    if (!record || record.terminal ||
      (input.commandId && record.command.id !== input.commandId) ||
      (input.companionId && record.command.companionId !== input.companionId) ||
      record.latestStatus === nextStatus ||
      !validNextStatuses.includes(nextStatus)) return false;

    record.latestStatus = nextStatus;
    record.updatedAt = input.reportedAt ?? nowIso();
    record.terminal = ['completed', 'cancelled', 'failed'].includes(nextStatus);
    this.emitFoundationEvent('CompanionCommandAck', 'companion', {
      commandId: record.command.id,
      companionId: record.command.companionId,
      status: nextStatus,
      reason: input.reason,
      failedStep: input.failedStep,
    });
    if (record.terminal) {
      this.activeCommand = null;
      this.companionRuntime.schedulePendingReevaluation();
    }
    return true;
  }

  private cancelCommandForCompanionSwitch(nextCompanionId: string): void {
    const record = this.activeCommand;
    if (!record || record.terminal || record.command.companionId === nextCompanionId) return;
    this.transitionActiveCommand('cancelled', {
      commandId: record.command.id,
      companionId: record.command.companionId,
      reason: 'companion_switched',
    });
  }

  debug = {
    resetData: async (input: DebugDataResetInput) => this.db.resetDebugData(input),
    getFoundationLog: async (input: FoundationEventLogInput = {}) => this.getFoundationLog(input),
    getEngineSnapshot: async (input: EngineSnapshotInput = {}) => buildEngineSnapshot(this.db, input, undefined, this.shareOrchestrator)
  };

  workspace = {
    getStatus: async (): Promise<WorkspaceStatusSnapshot> => collectWorkspaceStatus(),
    getSummary: async (): Promise<WorkspaceStatusSnapshot['summary']> => collectWorkspaceStatus().summary,
  };

  user = {
    getProfile: async (): Promise<UserProfile | null> => {
      return this.db.getUser();
    },
    register: async (input: RegisterUserInput): Promise<UserProfile> => {
      return this.db.createUser(input);
    },
    login: async (input: LoginUserInput): Promise<UserProfile> => {
      const user = this.db.getUserByUsername(input.username);
      if (!user || user.passwordHash !== input.password) {
        throw new Error('Invalid username or password');
      }
      return { id: user.id, username: user.username, displayName: user.displayName, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt };
    },
    logout: async (): Promise<void> => {
      // Clear any session tokens if needed
    },
    getMode: async (): Promise<OnlineMode> => {
      return (this.db.getAppSetting<OnlineMode>('online_mode')) ?? 'offline';
    },
    setMode: async (mode: OnlineMode): Promise<OnlineMode> => {
      this.db.setAppSetting('online_mode', mode);
      return mode;
    },
    onModeChange: (_listener: (mode: OnlineMode) => void): (() => void) => {
      return () => {};
    }
  };

  attachShareOrchestrator(orchestrator: DiscoveryShareOrchestrator): void {
    this.shareOrchestrator = orchestrator;
  }

  attachNetworkStatusBroadcaster(broadcaster: (status: NetworkStatus) => void): void {
    this.networkStatusBroadcaster = broadcaster;
  }

  attachVisualVisitBroadcaster(broadcaster: (state: VisualVisitRendererState) => void): void {
    this.visualVisitBroadcaster = broadcaster;
  }

  private tryPresentPendingDiscovery(command: CompanionCommand): void {
    if (!this.shareOrchestrator || !this.companionRuntime.shouldPresentNow(command.decision)) return;
    const pending = this.db.listPendingActions(command.companionId).find(
      (a) => a.decision.id === command.decision.id || a.status === 'pending' || a.status === 'ready'
    );
    const discoveryId = pending?.discoveryId;
    if (!discoveryId) return;
    const discovery = this.db.getDiscovery(discoveryId);
    if (discovery) this.shareOrchestrator.enqueue(discovery);
  }

  attachAutonomyBroadcasters(callbacks: {
    explorationEvent: (event: ExplorationLoopEvent) => void;
    command?: (command: CompanionCommand) => void;
    foundationEvent?: (event: BaseEvent) => void;
  }): void {
    this.explorationBroadcaster = callbacks.explorationEvent;
    this.commandBroadcaster = callbacks.command;
    this.foundationEventBroadcaster = callbacks.foundationEvent;
  }

  private setAutonomyCharacterState(
    coreState: CharacterRuntimeState['coreState'],
    intent: CharacterRuntimeState['intent'],
    animationIntent?: string
  ): CharacterRuntimeState {
    const characterId = this.db.resolveActiveCompanionId();
    return this.companionRuntime.advanceWithIntent(characterId, coreState, intent, animationIntent);
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
    const name = this.requireActiveCompanion().name;
    const messages: Record<ExplorationState, string> = {
      idle: `${name} is idle.`,
      curious: `${name} became curious.`,
      planning: `${name} is planning where to look.`,
      exploring: `${name} went exploring.`,
      collecting: `${name} found candidate signals.`,
      synthesizing: `${name} is thinking about what the findings mean.`,
      returning: `${name} is coming back.`,
      sharing: `${name} returned with something.`,
      reflecting: `${name} is reflecting on the feedback.`
    };
    return messages[state];
  }

  private async runAutonomousExploration(input: StartExplorationInput = {}): Promise<ExplorationCycleResult> {
    const userId = input.userId ?? 'default';
    const companionId = this.db.resolveActiveCompanionId(input.companionId);
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
    this.recordExplorationEvent(cycle, 'curious', selectedCuriosityTarget?.reason ?? `${this.requireActiveCompanion().name} became curious.`);
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
      this.db.insertCompanionInsight(toPersistedCompanionInsight(insight, companionId, selectedCuriosityTarget.reason, discoveryCandidates.map((candidate) => candidate.id)));
    }
    const selectedInsight = selectPrimaryInsight(insights);
    cycle = this.saveCycleState(cycle, 'returning', {
      insightIds: insights.map((insight) => insight.id),
      selectedInsightId: selectedInsight?.id
    });
    this.setAutonomyCharacterState('returning', 'sharing_discovery');

    cycle = this.saveCycleState(cycle, 'sharing');
    this.setAutonomyCharacterState('talking', 'sharing_discovery', 'Expedition_Present');
    if (selectedInsight && this.shareOrchestrator) {
      const discoveryPayload: Discovery = {
        id: selectedInsight.id,
        source: 'companion',
        title: selectedInsight.title,
        summary: selectedInsight.summary,
        tags: [],
        raw: {},
        userInterestScore: 50,
        userHistoryScore: 50,
        characterExpertiseScore: 50,
        noveltyScore: selectedInsight.novelty * 100,
        usefulnessScore: selectedInsight.importance * 100,
        finalScore: selectedInsight.confidence * 100,
        status: 'shared',
        createdAt: nowIso(),
      };
      const decision = this.companionRuntime.decideForDiscovery(
        discoveryPayload,
        this.companionSessionPhase !== 'inactive' && this.companionSessionPhase !== 'idle',
        this.companionDragging
      );
      if (this.companionRuntime.shouldPresentNow(decision)) {
        this.shareOrchestrator.enqueue(discoveryPayload);
      }
      this.emitFoundationEvent('CompanionMessageQueued', 'speech', {
        discoveryId: selectedInsight.id,
        cycleId: cycle.id,
        message: selectedInsight.summary,
        gated: !this.companionRuntime.shouldPresentNow(decision),
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
      feedbackDomain: this.companionRuntime.feedbackDomainForValue(input.value),
      createdAt: nowIso()
    });

    const insight = feedback.insightId ? (this.db.getCompanionInsight(feedback.insightId) as unknown as InsightV2 | undefined) : undefined;
    const reflected = this.db.insertExplorationCycle({
      ...cycle,
      state: 'reflecting',
      completedAt: nowIso()
    });
    this.recordExplorationEvent(reflected, 'reflecting', `${this.requireActiveCompanion().name} recorded what happened after sharing the insight.`, {
      feedback: feedback.value
    });

    if (input.value === 'saved' && insight) {
      const memory = this.db.insertMemoryNode(
        createMemoryNode({
          type: 'discovery',
          title: insight.title,
          summary: insight.summary,
          content: insight.explanation,
          source: 'autonomous_exploration'
        })
      );
      const activeJourney = this.db.listActiveJourneys()[0] ?? this.db.insertJourney(
        createJourney({ title: `Explore ${insight.title}`, description: insight.summary })
      );
      this.db.insertMilestone(
        createJourneyMilestone({
          journeyId: activeJourney.id,
          title: `${this.requireActiveCompanion().name} saved an insight: ${insight.title}`,
          summary: insight.summary,
          type: 'discovery_saved'
        })
      );
      this.db.insertDiary({
        id: createId('diary'),
        characterId: cycle.companionId,
        type: 'milestone',
        title: `${this.requireActiveCompanion().name} brought something back`,
        content: `I explored ${insight.title} and the user wanted to keep it. I added it to memory ${memory.id} so I can connect it to future curiosity.`,
        relatedJourneyId: activeJourney.id,
        createdAt: nowIso()
      });
      this.applyCharacterEmotion(cycle.companionId, 'user_accepts_discovery');
    } else if (input.value === 'talk_about_this' && insight) {
      this.db.insertCompanionMessage({
        characterId: cycle.companionId,
        role: 'assistant',
        content: insight.summary,
        source: 'companion_text',
        metadata: { cycleId: cycle.id, insightId: insight.id }
      });
    }

    const relationshipSignal = this.companionRuntime.relationshipSignalForFeedback(input.value);
    if (relationshipSignal) {
      this.companionRuntime.applyRelationshipSignal(relationshipSignal);
    }
    if (input.value === 'not_interested') {
      this.db.recordTopicPreference('local', (input.note ?? insight?.title ?? 'general').toLowerCase(), false);
      this.applyCharacterEmotion(cycle.companionId, 'user_rejects_discovery');
    } else if (input.value === 'saved') {
      this.db.recordTopicPreference('local', (input.note ?? insight?.title ?? 'general').toLowerCase(), true);
    }

    const settled = this.companionRuntime.advanceWithIntent(cycle.companionId, 'idle', 'waiting', 'Idle_Neutral');
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
        userInterests: [
          ...this.db.listTopicPreferences('local').filter((preference) => preference.interestScore > 0).map((preference) => preference.topicKey),
          'frontend', 'ux', 'pixijs', 'local-first'
        ],
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
        const decision = this.companionRuntime.decideForDiscovery(
          discovery,
          this.companionSessionPhase !== 'inactive' && this.companionSessionPhase !== 'idle',
          this.companionDragging
        );
        if (!this.companionRuntime.shouldPresentNow(decision) && discovery.status === 'shared') {
          this.db.updateDiscoveryStatus(discovery.id, 'candidate');
        }
        if (decision.action === 'stay_silent') {
          this.emitFoundationEvent('SilenceChosen', 'decision', { decisionId: decision.id, targetId: discovery.id }, correlationId);
        }
      }
    }

    return { discoveries, newlyInserted };
  }

  getEffectiveDiscoveryScore(): number {
    const characterId = this.db.resolveActiveCompanionId();
    const rules = this.db.getCharacterBehaviorRules(characterId);
    return clampScore(Number(rules.discovery ?? 35));
  }

  canAnnounceDiscovery(): boolean {
    if (this.localCompanionAway) return false;
    this.companionRuntime.reevaluatePendingActions();

    if (this.companionSessionPhase !== 'idle' && this.companionSessionPhase !== 'inactive') return false;
    if (this.companionDragging) return false;

    const state = this.db.getCharacterState(this.db.resolveActiveCompanionId());
    if (state.intent === 'helping_task' || state.intent === 'asking_permission') return false;
    if (state.intent === 'sharing_discovery') return true;
    if (['listening', 'executing'].includes(state.coreState)) return false;

    const lastDecision = this.companionRuntime.getLastDecision();
    if (lastDecision && !this.companionRuntime.shouldPresentNow(lastDecision)) return false;
    return true;
  }

  shouldInterruptShare(): boolean {
    return this.localCompanionAway || (this.companionSessionPhase !== 'idle' && this.companionSessionPhase !== 'inactive') || this.companionDragging;
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

  private async analyzeCompanionPersonality(description: string): Promise<CompanionPersonalityAnalysis> {
    this.prunePersonalityAnalyses();
    const trimmed = description.trim();
    if (!trimmed) throw new Error('A personality description is required.');
    if (!this.getAiSettings().apiKeyConfigured) {
      throw new Error('AI configuration is required before analyzing personality. Configure the API key, model, and endpoint, then retry.');
    }
    const { content } = await this.sendToAi({
      channel: 'personality_analysis',
      source: 'creation',
      messages: [{
        role: 'user',
        content: `Analyze this Companion personality description. Return JSON only, with integer values from 0 to 100 for exactly: energy, curiosity, sociability, diligence, playfulness, confidence, calmness, shyness. Description: ${trimmed}`,
      }],
    });
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI personality analysis did not return valid JSON.');
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const keys: Array<keyof CompanionPersonality> = ['energy', 'curiosity', 'sociability', 'diligence', 'playfulness', 'confidence', 'calmness', 'shyness'];
    if (Object.keys(raw).some((key) => !keys.includes(key as keyof CompanionPersonality))) {
      throw new Error('AI personality analysis returned unexpected fields.');
    }
    const personality = {} as CompanionPersonality;
    for (const key of keys) {
      const value = raw[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 100) {
        throw new Error(`AI personality analysis returned an invalid ${key} value.`);
      }
      personality[key] = value;
    }
    const analysisId = createId('personality_analysis');
    const expiresAt = Date.now() + 10 * 60 * 1000;
    this.personalityAnalyses.set(analysisId, { personality, description: trimmed, expiresAt, used: false });
    this.prunePersonalityAnalyses();
    return { analysisId, personality, description: trimmed, expiresAt: new Date(expiresAt).toISOString() };
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

  private async sendToAi(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    channel: 'chat' | 'turn' | 'discovery_reason' | 'personality_analysis';
    source: string;
  }): Promise<{ content: string; raw: unknown; requestBody: unknown }> {
    try {
      const result = await this.createDeepSeekClient().chatDebug(input.messages);
      this.pushDebugEntry({
        channel: input.channel,
        source: input.source,
        status: 'success',
        requestMessages: input.messages,
        requestBody: result.requestBody,
        rawResponse: result.raw,
        content: result.content
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushDebugEntry({
        channel: input.channel,
        source: input.source,
        status: 'error',
        requestMessages: input.messages,
        requestBody: getDebugRequestBody(error),
        rawResponse: getDebugResponseBody(error),
        content: '',
        error: message
      });
      throw error;
    }
  }

  private applyCharacterEmotion(characterId: string | undefined, eventType: Parameters<typeof applyEmotionEvent>[1]): void {
    const id = this.db.resolveActiveCompanionId(characterId);
    const state = this.db.getCharacterState(id);
    const nextState = this.db.saveCharacterState({
      ...state,
      emotion: applyEmotionEvent(state.emotion, eventType)
    });
    this.emitFoundationEvent('EmotionChanged', 'character', {
      characterId: nextState.characterId,
      reason: eventType
    });
  }

  private createDeepSeekClient(): DeepSeekClient {
    const stored = this.getStoredAiSettings();
    return new DeepSeekClient({
      apiKey: stored.apiKey || process.env.DEEPSEEK_API_KEY,
      model: normalizeDeepSeekModel(stored.model || getConfiguredModel()),
      endpoint: normalizeDeepSeekEndpoint(stored.endpoint || process.env.DEEPSEEK_ENDPOINT || deepSeekDefaultEndpoint)
    });
  }

  private getCharacterBehaviorSettings(characterId?: string): CharacterBehaviorSettings {
    const id = this.db.resolveActiveCompanionId(characterId);
    const rules = this.db.getCharacterBehaviorRules(id);
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

function toBuffer(value: ArrayBuffer | Uint8Array): Buffer {
  return value instanceof Uint8Array
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    : Buffer.from(value);
}

function validateCompanionPngAsset(definition: CompanionAnimationManifestEntry, bytes: Buffer): void {
  if (bytes.byteLength === 0) throw new Error(`${definition.key} cannot be empty.`);
  if (bytes.byteLength > MAX_COMPANION_ASSET_BYTES) {
    throw new Error(`${definition.key} exceeds the maximum file size.`);
  }
  const dimensions = readPngDimensions(bytes, definition.key);
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error(`${definition.key} has invalid PNG dimensions.`);
  }
  if (dimensions.width > definition.maxFrameSize * definition.maxFrames || dimensions.height > definition.maxFrameSize) {
    throw new Error(`${definition.key} dimensions exceed the maximum allowed size.`);
  }
  if (dimensions.height < definition.minFrameSize || dimensions.height > definition.maxFrameSize) {
    throw new Error(`${definition.key} frame size is outside the allowed range.`);
  }
  if (dimensions.width % dimensions.height !== 0) {
    throw new Error(`${definition.key} has an invalid sprite-sheet width.`);
  }
  const frameCount = dimensions.width / dimensions.height;
  if (frameCount < definition.minFrames || frameCount > definition.maxFrames) {
    throw new Error(`${definition.key} has an invalid sprite-sheet frame count.`);
  }
}

function readPngDimensions(bytes: Buffer, label: string): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 24 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error(`${label} is not a valid PNG.`);
  }
  const chunkType = bytes.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') {
    throw new Error(`${label} is not a valid PNG.`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}
