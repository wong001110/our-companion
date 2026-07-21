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
import { collectWorkspaceStatus, type WorkspaceStatusSnapshot } from './workspaceStatus';
import { generateCuriosityTargets } from '@our-companion/curiosity-engine';
import { assessCuriosity } from '@our-companion/curiosity-engine';
import { DatabaseService } from '@our-companion/database';
import type { CommandAckStatus, CompanionDecision, CompanionCommand, CompanionCommandAck, VisualVisitRendererState } from '@our-companion/shared';
import { generateDailyDiary } from '@our-companion/diary-engine';
import {
  adjustDiscoveryModeWeights,
  buildBoundedDiscoveryContext,
  canStartDiscoveryTrial,
  DEFAULT_DISCOVERY_TRIAL_POLICY,
  classifyDiscoveryAgainstSeen,
  createDiscoverySeenIdentities,
  createExplorationIntent as createAdaptiveExplorationIntent,
  createTopicFingerprint,
  createUnavailableConnector,
  evaluateTopicSaturation,
  findSeenDiscoveryCandidates,
  normalizeDiscoveryUrl,
  normalizeDiscoveryBaseInput,
  selectDiscoveryBasesForExecution,
  selectDiscoveryMode,
  startDiscoveryTrial,
  transitionDiscoveryBase,
  buildCompanionDiscoverySeedPlan,
  buildCompanionDiscoveryProfile,
  buildBootstrapCuriosityTopic,
  buildDefaultDiscoveryChannels,
  buildFallbackDiscoveryResearchPlan,
  enabledDiscoveryChannels,
  getCuratedDiscoveryFeed,
  getDiscoveryPlatformPreset,
  isDiscoveryPlatformId,
  isManagedPlatformSeed,
  isPersonalityGenericSeed,
  listCuratedDiscoveryFeedIds,
  mapV1BaseStateToChannelState,
  parseDiscoverySeedPlanFromAnalysis,
  PERSONALITY_PLATFORM_SEED_MANAGED_BY,
  PERSONALITY_SEED_MANAGED_BY,
  platformIdFromManagedSource,
  DISCOVERY_PLATFORM_BOOTSTRAP_VERSION,
  DEFAULT_DISCOVERY_PLATFORM_PRESETS,
  validateDynamicDiscoveryResearchPlan,
  type CompanionDiscoverySeedPlan,
  type DiscoveryBase,
  type DiscoveryConnector,
  type DiscoveryPlatformId,
  type DynamicDiscoveryResearchPlan,
} from '@our-companion/discovery-engine';
import { synthesizeDiscoveryInsight, generateInsights, selectPrimaryInsight } from '@our-companion/insight-engine';
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
  ActionResult,
  AddDiscoveryBaseInput,
  AddDiscoveryToJourneyInput,
  AddJourneyMilestoneInput,
  AiDebugEntry,
  AiSettings,
  CharacterBehaviorSettings,
  CharacterRuntimeState,
  ChatInput,
  CompanionInsight,
  GeneratedInsight,
  CompanionAppendMessageInput,
  CompanionAnimationName,
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
  CuriosityTarget,
  DebugDataResetInput,
  DeveloperDebugEvent,
  DeveloperDebugEventInput,
  DeveloperDebugEventKind,
  Discovery,
  DiscoveryCandidate,
  DiscoveryAnnouncePayload,
  DiscoveryFeedInput,
  DiscoveryFeedback,
  DiscoveryInspectionRecord,
  DiscoveryBaseState,
  DiscoverySource,
  DiscoveryBootstrapResult,
  CompanionDiscoveryChannel,
  CompanionDiscoveryProfile,
  DiscoveryChannelState,
  EngineProviderMode,
  EngineTrace,
  EngineTraceStatus,
  EngineSnapshotInput,
  ExplorationCycle,
  ExplorationCycleResult,
  ExplorationLoopEvent,
  ExplorationState,
  FoundationEventLogInput,
  MemoryImpactRecomputeReport,
  MemoryImpactReport,
  NormalizedDiscovery,
  PerformanceScript,
  ResearchDeveloperReport,
  ResearchIntent,
  ResearchPlan,
  RuntimeSchedulerReport,
  RuntimeTimeStatus,
  SpeechSettings,
  StartExplorationInput,
  SubmitDiscoveryFeedbackInput,
  SynthesizeDiscoveryInsightInput,
  ToolExecuteInput,
  TranscribeAudioInput,
  UiLang,
  UpdateAiSettingsInput,
  UpdateCharacterBehaviorSettingsInput,
  UpdateCompanionInput,
  UpdateSpeechSettingsInput,
  UpdateMemoryNodeInput,
  WebSearchResult,
} from '@our-companion/shared';
import type { UserProfile, OnlineMode, RegisterUserInput, LoginUserInput } from '@our-companion/shared';
import {
  COMPANION_ANIMATION_MANIFEST,
  COMPANION_CHAT_CONTEXT_LIMIT,
  DebugRuntimeClock,
  SystemRuntimeClock,
  createId,
  nowIso,
  normalizeSemanticText,
  normalizeActionUrl,
  createSemanticFingerprint,
  clampScore,
  redactSecrets,
  createTimer,
  type BaseEvent,
  type CompanionAnimationManifestEntry,
  type RuntimeClock,
} from '@our-companion/shared';
import { detectPatterns } from '@our-companion/pattern-engine';
import { executeActionStep, executeTool, previewTool, type ToolAdapters } from '@our-companion/tool-engine';
import { createElectronToolAdapters } from './platform/electronCommandAdapter';
import { getWhisperStatus, transcribeRecording } from '@our-companion/speech-engine';
import { createEvent, InProcessEventBus, type EventBus } from '@our-companion/event-bus';
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
import { createSmokeFixturePng } from './platform/smokeFixture';
import { assertSmokeTestRuntime } from './platform/smokeRuntime';
import { PngStructureError, validatePngStructure } from './platform/pngValidation';
import {
  FixtureWebPageFetcher,
  ResearchAdapterError,
  SafeWebPageFetcher,
  createDeterministicFixtureSearchProvider,
  type WebPageFetcher,
  type WebSearchProvider,
  type WebSearchProviderDiagnostics,
} from './researchAdapters';
import { getWebSearchProviderDiagnostics, resolveWebSearchProvider } from './browserSearch/resolveWebSearchProvider';
import { ResearchOrchestrator } from './researchOrchestrator';
import { CompanionTurnOrchestrator } from './application/CompanionTurnOrchestrator';
import { SqliteMemoryContextProvider } from './application/MemoryContextProvider';
import { MemoryPolicy } from './runtime/MemoryPolicy';

const DEBUG_LOG_MAX = 100;
const FOUNDATION_EVENT_LOG_MAX = 200;
const PERSONALITY_ANALYSIS_MAX_ENTRIES = 50;
const DISCOVERY_REEVALUATION_BASE_MS = 2 * 60 * 1000;
const DISCOVERY_REEVALUATION_MAX_MS = 30 * 60 * 1000;
const AUTO_MANAGE_DEFAULT_PLATFORMS_KEY = 'discovery.autoManageDefaultPlatforms';
export const MAX_COMPANION_ASSET_BYTES = 20 * 1024 * 1024;
export const MAX_COMPANION_TOTAL_ASSET_BYTES = 200 * 1024 * 1024;

type PersonalityAnalysisRecord = {
  personality: CompanionPersonality;
  description: string;
  expiresAt: number;
  used: boolean;
  discoverySeedPlan?: CompanionDiscoverySeedPlan;
};

function companionDiscoveryPreferencesKey(companionId: string): string {
  return `companion.discovery.${companionId}.platformPreferences`;
}

function companionDiscoveryChannelsKey(companionId: string): string {
  return `companion.discovery.${companionId}.channels`;
}

function companionDiscoveryProfileKey(companionId: string): string {
  return `companion.discovery.${companionId}.profile`;
}

function companionDiscoveryBootstrapKey(companionId: string): string {
  return `companion.discovery.${companionId}.bootstrap`;
}

export interface AppRuntimeDependencies {
  now?: () => Date;
  clock?: RuntimeClock;
  random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  discoveryConnectors?: DiscoveryConnector[];
  webSearchProvider?: WebSearchProvider;
  webPageFetcher?: WebPageFetcher;
  aiProvider?: {
    complete<T = unknown>(request: {
      operation: string;
      messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      input?: Record<string, unknown>;
      correlationId?: string;
    }): Promise<T>;
  };
  speechProvider?: {
    getStatus(userDataRoot: string): Promise<{ ready: boolean; model?: string; error?: string }>;
    transcribe(input: {
      audio: ArrayBuffer;
      mimeType?: string;
      userDataRoot: string;
      language?: string;
      useGpu: boolean;
    }): Promise<{ text: string; language?: string }>;
  };
  toolAdapters?: ToolAdapters;
}

export function toPersistedCompanionInsight(
  insight: GeneratedInsight,
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
  private readonly presentationDiscoveries = new Map<string, Discovery>();
  private readonly presentationDecisions = new Map<string, CompanionDecision>();
  private readonly presentationDecisionReevaluationAt = new Map<string, number>();
  private readonly presentationDecisionAttempts = new Map<string, number>();
  private readonly startedDiscoveryPayloads = new Set<string>();
  private readonly activeExplorations = new Map<string, Promise<ExplorationCycleResult>>();
  private readonly latestDiscoveryInspections = new Map<string, DiscoveryInspectionRecord>();
  private readonly companionRuntime: CompanionRuntime;
  private explorationBroadcaster?: (event: ExplorationLoopEvent) => void;
  private commandBroadcaster?: (command: CompanionCommand) => void;
  private activeCommand: ActiveCommandRecord | null = null;
  private foundationEventBroadcaster?: (event: BaseEvent) => void;
  private foundationEventLog: BaseEvent[] = [];
  private debugFlushPromise?: Promise<{ uploaded: number; failed: number }>;
  private lastSchedulerTick?: string;
  private runtimeStarted = false;
  private readonly personalityAnalyses = new Map<string, PersonalityAnalysisRecord>();
  private readonly discoveryBootstrapByCompanion = new Map<string, DiscoveryBootstrapResult>();
  readonly network: NetworkConnectionService;
  readonly publicCompanions: PublicCompanionService;
  readonly visits: VisitService;
  readonly visualVisits: VisualVisitService;
  private networkStatusBroadcaster?: (status: NetworkStatus) => void;
  private visualVisitBroadcaster?: (state: VisualVisitRendererState) => void;
  private localCompanionAway = false;
  readonly runtimeClock: RuntimeClock;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly discoveryConnectors: DiscoveryConnector[];
  private readonly webSearchProvider: WebSearchProvider;
  private readonly researchOrchestrator: ResearchOrchestrator;
  private readonly manualResearchPageFetcher: SafeWebPageFetcher;
  private readonly researchFixtureEnabled: boolean;
  private readonly aiProvider: AppRuntimeDependencies['aiProvider'];
  private readonly speechProvider: NonNullable<AppRuntimeDependencies['speechProvider']>;
  private readonly toolAdapters: ToolAdapters;
  private readonly turnMemoryPolicy: MemoryPolicy;
  private readonly turnOrchestrator: CompanionTurnOrchestrator;

  get runtime(): CompanionRuntime {
    return this.companionRuntime;
  }

  constructor(
    dbPath = path.join(app.getPath('userData'), 'our-companion.db'),
    readonly eventBus: EventBus = new InProcessEventBus(),
    runtimeDependencies: AppRuntimeDependencies = {}
  ) {
    this.runtimeClock = runtimeDependencies.clock
      ?? (runtimeDependencies.now
        ? { now: runtimeDependencies.now, nowMs: () => runtimeDependencies.now!().getTime() }
        : !app.isPackaged || process.env.OUR_COMPANION_SMOKE_TEST === '1'
          ? new DebugRuntimeClock()
          : new SystemRuntimeClock());
    this.now = () => this.runtimeClock.now();
    this.random = runtimeDependencies.random ?? Math.random;
    this.aiProvider = runtimeDependencies.aiProvider;
    this.speechProvider = runtimeDependencies.speechProvider ?? {
      getStatus: getWhisperStatus,
      transcribe: transcribeRecording
    };
    this.toolAdapters = runtimeDependencies.toolAdapters ?? createElectronToolAdapters();
    this.discoveryConnectors = runtimeDependencies.discoveryConnectors ??
      (['github', 'hackernews', 'reddit', 'youtube'] as DiscoverySource[]).map(createUnavailableConnector);
    this.researchFixtureEnabled = (!app.isPackaged || process.env.OUR_COMPANION_SMOKE_TEST === '1')
      && process.env.OUR_COMPANION_RESEARCH_FIXTURE === '1';
    this.manualResearchPageFetcher = new SafeWebPageFetcher({ now: this.now });
    this.webSearchProvider = runtimeDependencies.webSearchProvider
      ?? resolveWebSearchProvider({
        researchFixtureEnabled: this.researchFixtureEnabled,
        isAppReady: () => app.isReady(),
      });
    this.researchOrchestrator = new ResearchOrchestrator({
      searchProvider: this.webSearchProvider,
      pageFetcher: runtimeDependencies.webPageFetcher
        ?? (this.researchFixtureEnabled ? new FixtureWebPageFetcher(this.now) : new SafeWebPageFetcher({ now: this.now })),
      structuredConnectors: this.discoveryConnectors,
      now: this.now,
      refinePlan: this.aiProvider
        ? async ({ intent, deterministicPlan }) => this.aiProvider!.complete({
          operation: 'research-plan:refine',
          input: {
            intent: {
              topic: intent.topic,
              objective: intent.objective,
              preferredSourceTypes: intent.preferredSourceTypes,
              evidenceRequirements: intent.evidenceRequirements
            },
            deterministicPlan: {
              queries: deterministicPlan.queries,
              selectedCapabilities: deterministicPlan.selectedCapabilities,
              limits: deterministicPlan.limits
            }
          }
        })
        : undefined
    });
    const userDataDir = app.getPath('userData');
    if (userDataDir !== ':memory:') {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    try {
      this.db = new DatabaseService({
        path: dbPath,
        priorAnnHasCustomAssets: () => {
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

    if (this.eventBus instanceof InProcessEventBus) {
      this.eventBus.setErrorReporter((error, event) => {
        const completedAt = this.now().toISOString();
        this.db.insertEngineTrace({
          id: createId('trace'),
          correlationId: event.correlationId ?? createId('corr'),
          causationId: event.id,
          companionId: this.db.tryResolveActiveCompanionId() ?? 'unassigned',
          engine: 'event-bus',
          operation: `handle:${event.type}`,
          providerMode: 'deterministic',
          inputRefs: [event.id],
          outputRefs: [],
          startedAt: event.timestamp,
          completedAt,
          durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(event.timestamp)),
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    this.turnMemoryPolicy = new MemoryPolicy(this.db, { now: () => this.now().getTime() });
    this.turnOrchestrator = new CompanionTurnOrchestrator({
      db: this.db,
      memoryContext: new SqliteMemoryContextProvider(this.db, this.now),
      memoryPolicy: this.turnMemoryPolicy,
      now: this.now,
      getReplyLanguage: () => this.getAiSettings().replyLanguage,
      getSessionId: () => this.companionRuntime?.getActiveSessionId() ?? undefined,
      sendToAi: async ({ messages, source }) => this.sendToAi({ messages, channel: 'turn', source }),
      getPermissions: () => this.db.getActionPermissions(),
      setPermissions: (state) => this.db.setActionPermissions(state),
      executePlan: (plan, permissions) => this.executeActionPlan(plan, permissions),
      onAssistantMessage: ({ companionId, source, message, status }) => {
        this.emitFoundationEvent('CompanionMessageQueued', 'speech', { companionId, source, status, message });
      },
    });

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
        this.tryStartDiscoveryPayload(command);
        return true;
      },
      {
        now: () => this.now().getTime(),
        random: runtimeDependencies.random,
        setTimer: runtimeDependencies.setTimer,
        clearTimer: runtimeDependencies.clearTimer
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
        if (!wasOnline) void this.flushPendingDebugEvents();
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
    for (const companion of this.db.listCompanions()) {
      try {
        this.syncPersonalityDiscoverySeed(companion);
      } catch (error) {
        console.warn(
          `[our-companion] Personality Discovery Source backfill failed for ${companion.id}.`,
          error,
        );
      }
    }
  }

  hasActiveCompanion(): boolean {
    return this.db.tryResolveActiveCompanionId() !== null;
  }

  /** Narrow smoke-only bootstrap: fixed local visual assets, no caller-controlled filesystem input. */
  createSmokeFixtureCompanion(): CompanionProfile {
    assertSmokeTestRuntime();
    const existing = this.db.getPrimaryCompanion();
    if (existing) return existing;
    const personality: CompanionPersonality = { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 };
    let companion = this.db.createCompanion({ name: 'Smoke Companion', personalityDescription: 'A deterministic smoke-test Companion.', personality, personalityAnalysisId: 'smoke-only', assetRoot: '' });
    const animationsDir = this.resolveCompanionAssetPath({ companionId: companion.id, relativePath: path.join('assets', 'animations') }).target;
    fs.mkdirSync(animationsDir, { recursive: true });
    for (const [index, animation] of COMPANION_ANIMATION_MANIFEST.entries()) {
      const color: [number, number, number] = [80 + (index * 29) % 140, 70 + (index * 43) % 150, 120 + (index * 19) % 120];
      // A few non-looping frames give the harness a real, observable Enter/Leave phase.
      fs.writeFileSync(path.join(animationsDir, animation.fileName), createSmokeFixturePng(color, animation.loop ? 1 : 3), { flag: 'wx' });
    }
    companion = this.db.updateCompanion(companion.id, { assetRoot: `companion://${companion.id}/assets` });
    return this.db.setPrimaryCompanion(companion.id);
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
    const now = this.now().getTime();
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

  private getAutoManageDefaultPlatforms(): boolean {
    return this.db.getAppSetting<boolean>(AUTO_MANAGE_DEFAULT_PLATFORMS_KEY) ?? true;
  }

  private setAutoManageDefaultPlatforms(enabled: boolean): boolean {
    this.db.setAppSetting(AUTO_MANAGE_DEFAULT_PLATFORMS_KEY, enabled);
    return enabled;
  }

  private listDiscoveryChannels(companionId: string): CompanionDiscoveryChannel[] {
    const stored = this.db.getAppSetting<CompanionDiscoveryChannel[]>(
      companionDiscoveryChannelsKey(companionId),
    );
    if (stored?.length) return stored;
    // Legacy preferences (enabled/suppressed) from bootstrap v1.
    const legacy = this.db.getAppSetting<Array<{
      companionId: string;
      platformId: string;
      state: string;
      updatedAt: string;
    }>>(companionDiscoveryPreferencesKey(companionId)) ?? [];
    if (!legacy.length) return [];
    return legacy
      .filter((entry) => isDiscoveryPlatformId(entry.platformId))
      .map((entry) => ({
        companionId,
        platformId: entry.platformId as DiscoveryPlatformId,
        state: entry.state === 'suppressed'
          ? 'suppressed'
          : entry.state === 'muted'
            ? 'muted'
            : entry.state === 'blocked'
              ? 'blocked'
              : 'enabled',
        source: 'default' as const,
        updatedAt: entry.updatedAt,
      }));
  }

  private saveDiscoveryChannels(companionId: string, channels: CompanionDiscoveryChannel[]): void {
    this.db.setAppSetting(companionDiscoveryChannelsKey(companionId), channels);
    // Keep legacy preference key in sync for suppression lookups during migration.
    this.db.setAppSetting(
      companionDiscoveryPreferencesKey(companionId),
      channels.map((channel) => ({
        companionId,
        platformId: channel.platformId,
        state: channel.state === 'suppressed' ? 'suppressed' : channel.state,
        updatedAt: channel.updatedAt,
      })),
    );
  }

  private readDiscoveryProfile(companionId: string): CompanionDiscoveryProfile | null {
    return this.db.getAppSetting<CompanionDiscoveryProfile>(companionDiscoveryProfileKey(companionId)) ?? null;
  }

  private saveDiscoveryProfile(profile: CompanionDiscoveryProfile): void {
    this.db.setAppSetting(companionDiscoveryProfileKey(profile.companionId), profile);
  }

  private clearCompanionDiscoveryPreferences(companionId: string): void {
    this.db.setAppSetting(companionDiscoveryPreferencesKey(companionId), []);
    this.db.setAppSetting(companionDiscoveryChannelsKey(companionId), []);
    this.db.setAppSetting(companionDiscoveryProfileKey(companionId), null);
    this.db.setAppSetting(companionDiscoveryBootstrapKey(companionId), null);
    this.discoveryBootstrapByCompanion.delete(companionId);
  }

  private persistBootstrapStatus(companionId: string, result: DiscoveryBootstrapResult): void {
    this.discoveryBootstrapByCompanion.set(companionId, result);
    this.db.setAppSetting(companionDiscoveryBootstrapKey(companionId), result);
  }

  private getBootstrapStatus(companionId?: string): DiscoveryBootstrapResult | null {
    const id = companionId ?? this.db.getPrimaryCompanion()?.id;
    if (!id) return null;
    return this.discoveryBootstrapByCompanion.get(id)
      ?? this.db.getAppSetting<DiscoveryBootstrapResult>(companionDiscoveryBootstrapKey(id))
      ?? null;
  }

  private resolveDiscoverySeedPlan(
    companion: CompanionProfile,
    analysis?: PersonalityAnalysisRecord,
  ): CompanionDiscoverySeedPlan {
    if (analysis?.discoverySeedPlan) return analysis.discoverySeedPlan;
    return buildCompanionDiscoverySeedPlan({ description: companion.personalityDescription });
  }

  /**
   * Persist Discovery Profile + Channel preferences. Does not create permanent
   * platform query DiscoveryBases.
   */
  private syncPersonalityDiscoverySeed(
    companion: CompanionProfile,
    analysis?: PersonalityAnalysisRecord,
  ): string[] {
    this.migrateV1ManagedPlatformQueries(companion);
    const seedPlan = this.resolveDiscoverySeedPlan(companion, analysis);
    const now = this.now().toISOString();
    const normalizedDescription = companion.personalityDescription.trim().replace(/\s+/g, ' ');
    if (!normalizedDescription) return [];
    const revision = createSemanticFingerprint('personality_revision', [normalizedDescription]);
    this.saveDiscoveryProfile(buildCompanionDiscoveryProfile({
      companionId: companion.id,
      personalityRevision: revision,
      seedPlan,
      updatedAt: now,
    }));
    this.reconcileDiscoveryChannels(companion.id, now);
    return [];
  }

  private reconcileDiscoveryChannels(companionId: string, now: string): CompanionDiscoveryChannel[] {
    const existing = this.listDiscoveryChannels(companionId);
    const next = buildDefaultDiscoveryChannels({
      companionId,
      updatedAt: now,
      existing,
      autoManage: this.getAutoManageDefaultPlatforms(),
    });
    // Preserve suppressed/muted/blocked; only add genuinely missing defaults.
    const merged = next.map((channel) => {
      const prior = existing.find((entry) => entry.platformId === channel.platformId);
      return prior ?? channel;
    });
    for (const prior of existing) {
      if (!merged.some((channel) => channel.platformId === prior.platformId)) {
        merged.push(prior);
      }
    }
    this.saveDiscoveryChannels(companionId, merged);
    return merged;
  }

  private updateDiscoveryChannelState(
    companionId: string,
    platformId: DiscoveryPlatformId,
    state: DiscoveryChannelState,
  ): CompanionDiscoveryChannel {
    const now = this.now().toISOString();
    const channels = this.reconcileDiscoveryChannels(companionId, now);
    const existing = channels.find((channel) => channel.platformId === platformId);
    const next: CompanionDiscoveryChannel = existing
      ? { ...existing, state, source: 'user', updatedAt: now }
      : {
        companionId,
        platformId,
        state,
        source: 'user',
        updatedAt: now,
      };
    const saved = [
      ...channels.filter((channel) => channel.platformId !== platformId),
      next,
    ];
    this.saveDiscoveryChannels(companionId, saved);
    return next;
  }

  private migrateV1ManagedPlatformQueries(companion: CompanionProfile): void {
    const now = this.now().toISOString();
    const bases = this.db.listDiscoveryBases(companion.id, undefined, 1_000);
    const channels = this.listDiscoveryChannels(companion.id);
    const byPlatform = new Map(channels.map((channel) => [channel.platformId, channel]));
    let channelsChanged = false;

    for (const base of bases) {
      if (!isManagedPlatformSeed(base.data)) continue;
      const platformId = platformIdFromManagedSource(base.data);
      if (!platformId || platformId === 'generic-web') continue;
      const existing = byPlatform.get(platformId);
      if (!existing || existing.state === 'enabled') {
        const mapped = mapV1BaseStateToChannelState(base.state);
        byPlatform.set(platformId, {
          companionId: companion.id,
          platformId,
          state: mapped,
          source: existing?.source ?? 'default',
          updatedAt: now,
          lastUsedAt: existing?.lastUsedAt,
          lastPlanningReason: existing?.lastPlanningReason,
        });
        channelsChanged = true;
      }
      this.db.deleteDiscoveryBase(base.id, companion.id);
    }

    // Migrate generic personality seed into profile interests, then remove the base
    // unless the user explicitly modified it (preserve as pinned query).
    for (const base of bases) {
      if (!isPersonalityGenericSeed(base.data) && !(base.origin === 'personality' && !isManagedPlatformSeed(base.data) && !base.data.curatedFeedId)) {
        continue;
      }
      if (base.data.curatedFeedId) continue;
      if (base.scope !== 'query') continue;
      if (base.data.userModifiedAt) {
        this.db.updateDiscoveryBase({
          ...base,
          origin: 'user',
          data: {
            ...base.data,
            managedBy: undefined,
            label: typeof base.data.label === 'string' ? base.data.label : 'Pinned personality topic',
          },
          updatedAt: now,
        });
        continue;
      }
      this.db.deleteDiscoveryBase(base.id, companion.id);
    }

    if (channelsChanged || channels.length === 0) {
      const merged = buildDefaultDiscoveryChannels({
        companionId: companion.id,
        updatedAt: now,
        existing: [...byPlatform.values()],
        autoManage: this.getAutoManageDefaultPlatforms(),
      }).map((channel) => byPlatform.get(channel.platformId) ?? channel);
      for (const channel of byPlatform.values()) {
        if (!merged.some((entry) => entry.platformId === channel.platformId)) {
          merged.push(channel);
        }
      }
      this.saveDiscoveryChannels(companion.id, merged);
    }
  }

  private async ensureCuratedFeedSources(
    companion: CompanionProfile,
    seedPlan: CompanionDiscoverySeedPlan,
  ): Promise<string[]> {
    const changed: string[] = [];
    const now = this.now().toISOString();
    const revision = createSemanticFingerprint('personality_revision', [
      companion.personalityDescription.trim().replace(/\s+/g, ' '),
    ]);
    for (const feedId of seedPlan.curatedFeedIds) {
      const feed = getCuratedDiscoveryFeed(feedId);
      if (!feed) continue;
      const existingBases = this.db.listDiscoveryBases(companion.id, undefined, 1_000);
      const existing = existingBases.find((base) =>
        base.connectorId === 'rss'
        && base.data.managedBy === PERSONALITY_PLATFORM_SEED_MANAGED_BY
        && base.data.curatedFeedId === feedId
      );
      if (existing) continue;
      const conflicting = this.db.getDiscoveryBaseByLocator(companion.id, 'rss', 'feed', feed.url);
      if (conflicting) continue;
      try {
        await this.probeDiscoveryFeed(feed.url, companion.id);
      } catch (error) {
        this.persistBootstrapStatus(companion.id, {
          attempted: true,
          executedSourceIds: [],
          status: 'deferred',
          reason: `curated_feed_probe_failed:${feedId}:${error instanceof Error ? error.message : 'unknown'}`,
        });
        continue;
      }
      const id = createSemanticFingerprint('discovery_base', [
        companion.id,
        'rss',
        PERSONALITY_PLATFORM_SEED_MANAGED_BY,
        feedId,
      ]);
      this.db.upsertDiscoveryBase(startDiscoveryTrial({
        base: {
          id,
          companionId: companion.id,
          connectorId: 'rss',
          scope: 'feed',
          locator: feed.url,
          data: {
            managedBy: PERSONALITY_PLATFORM_SEED_MANAGED_BY,
            curatedFeedId: feedId,
            label: feed.label,
            platformLabel: 'RSS',
            bootstrapVersion: DISCOVERY_PLATFORM_BOOTSTRAP_VERSION,
            personalityRevision: revision,
            topicKeys: seedPlan.interests,
          },
          origin: 'personality',
          discoveredAt: now,
        },
        now,
      }));
      changed.push(id);
    }
    return changed;
  }

  private async planDynamicDiscoveryResearch(input: {
    companion: CompanionProfile;
    curiosityTopic: string;
    profile: CompanionDiscoveryProfile | null;
    forcedPlatformId?: DiscoveryPlatformId;
  }): Promise<DynamicDiscoveryResearchPlan> {
    const channels = enabledDiscoveryChannels(this.listDiscoveryChannels(input.companion.id));
    const enabledPlatformIds = channels.map((channel) => channel.platformId);
    if (input.forcedPlatformId && !enabledPlatformIds.includes(input.forcedPlatformId)) {
      return {
        plannerMode: 'unavailable',
        plannerReason: 'Forced channel is not enabled.',
        tasks: [],
        skippedChannels: [{ platformId: input.forcedPlatformId, reason: 'Channel is not enabled.' }],
      };
    }
    if (enabledPlatformIds.length === 0) {
      return {
        plannerMode: 'unavailable',
        plannerReason: 'No discovery channels are enabled.',
        tasks: [],
        skippedChannels: [],
      };
    }

    const language = this.getAiSettings().replyLanguage === 'zh-CN' ? 'zh-CN' : 'en';
    if (!this.getAiSettings().apiKeyConfigured) {
      return buildFallbackDiscoveryResearchPlan({
        curiosityTopic: input.curiosityTopic,
        enabledPlatformIds,
        forcedPlatformId: input.forcedPlatformId,
        language,
        reason: 'AI provider unavailable',
      });
    }

    try {
      const { content } = await this.sendToAi({
        channel: 'discovery_research_plan',
        source: 'discovery',
        messages: [{
          role: 'user',
          content: [
            'Plan a bounded Discovery research cycle.',
            'Return JSON only: { "tasks": [{ "platformId", "query", "rationale", "language?" }] }',
            'Rules:',
            '- Choose at most 3 unique platforms from the enabled list',
            '- query must be plain semantic search text (no URLs, no site: operators)',
            '- Do not invent domains or feeds',
            `Enabled platforms: ${enabledPlatformIds.join(', ')}`,
            `Interests: ${(input.profile?.interests ?? []).join(', ') || '(none)'}`,
            `Preferred content: ${(input.profile?.preferredContentTypes ?? []).join(', ') || '(none)'}`,
            `Curiosity target: ${input.curiosityTopic}`,
            input.forcedPlatformId ? `Force exactly this platform: ${input.forcedPlatformId}` : '',
            `Language preference: ${language}`,
          ].filter(Boolean).join('\n'),
        }],
      });
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        return buildFallbackDiscoveryResearchPlan({
          curiosityTopic: input.curiosityTopic,
          enabledPlatformIds,
          forcedPlatformId: input.forcedPlatformId,
          language,
          reason: 'AI planner returned invalid JSON',
        });
      }
      const validated = validateDynamicDiscoveryResearchPlan({
        candidate: JSON.parse(match[0]),
        enabledPlatformIds,
        forcedPlatformId: input.forcedPlatformId,
      });
      if (!validated) {
        return buildFallbackDiscoveryResearchPlan({
          curiosityTopic: input.curiosityTopic,
          enabledPlatformIds,
          forcedPlatformId: input.forcedPlatformId,
          language,
          reason: 'AI planner output failed validation',
        });
      }
      return validated;
    } catch (error) {
      return buildFallbackDiscoveryResearchPlan({
        curiosityTopic: input.curiosityTopic,
        enabledPlatformIds,
        forcedPlatformId: input.forcedPlatformId,
        language,
        reason: error instanceof Error ? error.message : 'AI planner failed',
      });
    }
  }

  private async runInitialDiscoveryBootstrap(
    companion: CompanionProfile,
  ): Promise<DiscoveryBootstrapResult> {
    if (this.webSearchProvider.mode === 'unavailable') {
      const result: DiscoveryBootstrapResult = {
        attempted: true,
        executedSourceIds: [],
        executedPlatformIds: [],
        status: 'provider_unavailable',
        reason: 'Search provider is not configured.',
        plannerMode: 'unavailable',
      };
      this.persistBootstrapStatus(companion.id, result);
      return result;
    }

    try {
      const exploration = await this.runAutonomousExploration(
        { companionId: companion.id, trigger: 'manual' },
      );
      const inspection = this.latestDiscoveryInspections.get(companion.id);
      const executedPlatformIds = (inspection?.selectedChannels ?? []).map((entry) => entry.platformId as DiscoveryPlatformId);
      const result: DiscoveryBootstrapResult = {
        attempted: true,
        executedSourceIds: (inspection?.executedBases ?? []).map((base) => base.id),
        executedPlatformIds,
        status: inspection?.plannerMode === 'unavailable'
          ? 'planner_unavailable'
          : exploration.discoveryCandidates.length > 0
            ? 'completed'
            : 'no_candidates',
        reason: inspection?.plannerReason
          ?? (exploration.discoveryCandidates.length > 0 ? undefined : 'No discovery candidates were found.'),
        plannerMode: inspection?.plannerMode,
      };
      this.persistBootstrapStatus(companion.id, result);
      return result;
    } catch (error) {
      const result: DiscoveryBootstrapResult = {
        attempted: true,
        executedSourceIds: [],
        executedPlatformIds: [],
        status: 'provider_unavailable',
        reason: error instanceof Error ? error.message : 'Initial discovery bootstrap failed.',
        plannerMode: 'unavailable',
      };
      this.persistBootstrapStatus(companion.id, result);
      return result;
    }
  }

  private async probeDiscoveryFeed(locator: string, companionId: string): Promise<void> {
    const probeId = createId('feed_probe');
    const evidence = await this.manualResearchPageFetcher.fetchPage({
      searchResult: {
        id: probeId,
        query: locator,
        title: new URL(locator).hostname,
        url: locator,
        domain: new URL(locator).hostname.toLowerCase(),
        rank: 1,
        provider: 'discovery-source-probe',
      },
      userId: 'local',
      companionId,
      cycleId: probeId,
      researchIntentId: probeId,
      researchPlanId: probeId,
      sourceType: 'rss',
    });
    const feedContentTypes = new Set([
      'application/rss+xml',
      'application/atom+xml',
      'application/xml',
      'text/xml',
    ]);
    if (
      evidence.sourceType !== 'rss'
      || typeof evidence.contentType !== 'string'
      || !feedContentTypes.has(evidence.contentType.toLowerCase())
      || !Array.isArray(evidence.feedItems)
      || evidence.feedItems.length === 0
    ) {
      throw new Error('DISCOVERY_SOURCE_FEED_FORMAT_INVALID');
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
      return this.companionRuntime.updatePosition(input.characterId, { x: input.x, y: input.y });
    },
    triggerBehavior: async (input: { characterId?: string; event: string }) => {
      return this.companionRuntime.triggerBehavior(input.characterId, input.event);
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
      if (!analysis || analysis.used || analysis.expiresAt <= this.now().getTime() || analysis.description !== description) {
        throw new Error('AI personality analysis is invalid, expired, or already used. Analyze the description again.');
      }
      const assets = input.assets ?? [];
      if (new Set(assets.map((asset) => asset.animationKey)).size !== assets.length) {
        throw new Error('Duplicate Companion animation assets are not allowed.');
      }
      const assetsByKey = new Map(assets.map((asset) => [asset.animationKey, asset]));
      const requiredAssets = COMPANION_ANIMATION_MANIFEST.filter((entry) => entry.requiredForCreation);
      const missingRequiredAssets = requiredAssets
        .filter((entry) => !assetsByKey.has(entry.key))
        .map((entry) => entry.key);
      if (missingRequiredAssets.length) {
        throw new Error(`Missing required Companion animations: ${missingRequiredAssets.join(', ')}`);
      }
      const manifestByKey = new Map(COMPANION_ANIMATION_MANIFEST.map((entry) => [entry.key, entry]));
      const validatedAssets = new Map<CompanionAnimationName, Buffer>();
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
      let stagingDir: string | undefined;
      try {
        const shouldBecomePrimary = !this.db.getPrimaryCompanion();
        companion = this.db.createCompanion({ ...input, name, personalityDescription: description, personality: analysis.personality });
        companionDir = this.resolveCompanionRoot(companion.id);
        stagingDir = `${companionDir}.staging-${createId('assets')}`;
        const stagingAnimationsDir = path.join(stagingDir, 'assets', 'animations');
        fs.mkdirSync(stagingAnimationsDir, { recursive: true });
        for (const entry of COMPANION_ANIMATION_MANIFEST) {
          const bytes = validatedAssets.get(entry.key);
          if (!bytes) continue;
          fs.writeFileSync(path.join(stagingAnimationsDir, entry.fileName), bytes);
        }
        const expectedFiles = [...validatedAssets.keys()]
          .map((key) => manifestByKey.get(key)!.fileName)
          .sort();
        const actualFiles = fs.readdirSync(stagingAnimationsDir).sort();
        if (
          expectedFiles.length !== actualFiles.length
          || expectedFiles.some((fileName, index) => fileName !== actualFiles[index])
        ) {
          throw new Error('Companion animation asset verification failed.');
        }
        for (const [key, expectedBytes] of validatedAssets) {
          const definition = manifestByKey.get(key)!;
          const persistedBytes = fs.readFileSync(path.join(stagingAnimationsDir, definition.fileName));
          if (!persistedBytes.equals(expectedBytes)) {
            throw new Error(`Companion animation asset verification failed: ${definition.key}`);
          }
        }
        fs.mkdirSync(path.dirname(companionDir), { recursive: true });
        if (fs.existsSync(companionDir)) {
          throw new Error('Companion asset destination already exists.');
        }
        fs.renameSync(stagingDir, companionDir);
        stagingDir = undefined;
        companion = this.db.updateCompanion(companion.id, { assetRoot: `companion://${companion.id}/assets` });
        if (shouldBecomePrimary) companion = this.db.setPrimaryCompanion(companion.id);
        const seedPlan = this.resolveDiscoverySeedPlan(companion, analysis);
        this.syncPersonalityDiscoverySeed(companion, analysis);
        await this.ensureCuratedFeedSources(companion, seedPlan);
        this.personalityAnalyses.delete(input.personalityAnalysisId);
        try {
          await this.runInitialDiscoveryBootstrap(companion);
        } catch {
          this.persistBootstrapStatus(companion.id, {
            attempted: true,
            executedSourceIds: [],
            executedPlatformIds: [],
            status: 'provider_unavailable',
            reason: 'Initial discovery bootstrap failed after Companion creation.',
            plannerMode: 'unavailable',
          });
        }
        return companion;
      } catch (error) {
        analysis.used = false;
        if (companion) this.db.rollbackCompanionCreation(companion.id);
        if (stagingDir && fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
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
      const name = rest.name?.trim();
      if (rest.name !== undefined && !name) throw new Error('Companion name is required.');
      const description = rest.personalityDescription?.trim() ?? current.personalityDescription;
      const personalityChanged = rest.personality !== undefined || description !== current.personalityDescription;
      let consumedAnalysis: { used: boolean } | undefined;
      let consumedAnalysisId: string | undefined;
      if (personalityChanged) {
        const analysis = rest.personalityAnalysisId ? this.personalityAnalyses.get(rest.personalityAnalysisId) : undefined;
        if (!analysis || analysis.used || analysis.expiresAt <= this.now().getTime() || analysis.description !== description) {
          throw new Error('A current AI personality analysis is required to update personality.');
        }
        consumedAnalysis = analysis;
        consumedAnalysisId = rest.personalityAnalysisId;
        rest.personality = analysis.personality;
        rest.personalityDescription = description;
      }
      const replacements = rest.assets ?? [];
      const deleteAnimationKeys = rest.deleteAnimationKeys ?? [];
      if (new Set(replacements.map((asset) => asset.animationKey)).size !== replacements.length) {
        throw new Error('Duplicate Companion animation assets are not allowed.');
      }
      if (new Set(deleteAnimationKeys).size !== deleteAnimationKeys.length) {
        throw new Error('Duplicate Companion animation deletions are not allowed.');
      }
      const manifestByKey = new Map(COMPANION_ANIMATION_MANIFEST.map((entry) => [entry.key, entry]));
      const replacementsByKey = new Map<CompanionAnimationName, Buffer>();
      for (const replacement of replacements) {
        const definition = manifestByKey.get(replacement.animationKey);
        if (!definition) throw new Error(`${replacement.animationKey} is not a supported Companion animation.`);
        const bytes = toBuffer(replacement.buffer);
        validateCompanionPngAsset(definition, bytes);
        replacementsByKey.set(definition.key, bytes);
      }
      for (const key of deleteAnimationKeys) {
        const definition = manifestByKey.get(key);
        if (!definition) throw new Error(`${key} is not a supported Companion animation.`);
        if (definition.requiredForCreation && !replacementsByKey.has(key)) {
          throw new Error(`Required Companion animation cannot be deleted: ${key}`);
        }
      }
      const hasAssetChanges = replacements.length > 0 || deleteAnimationKeys.length > 0;
      const companionDir = this.resolveCompanionRoot(id);
      let stagingDir: string | undefined;
      let backupDir: string | undefined;
      let assetsPromoted = false;
      if (hasAssetChanges) {
        stagingDir = `${companionDir}.edit-staging-${createId('assets')}`;
        backupDir = `${companionDir}.edit-backup-${createId('assets')}`;
        if (fs.existsSync(companionDir)) {
          fs.cpSync(companionDir, stagingDir, { recursive: true, errorOnExist: true });
        } else {
          fs.mkdirSync(stagingDir, { recursive: true });
        }
        try {
          const animationsDir = path.join(stagingDir, 'assets', 'animations');
          fs.mkdirSync(animationsDir, { recursive: true });
          for (const key of deleteAnimationKeys) {
            const definition = manifestByKey.get(key)!;
            const target = path.join(animationsDir, definition.fileName);
            if (fs.existsSync(target)) fs.unlinkSync(target);
          }
          for (const [key, bytes] of replacementsByKey) {
            fs.writeFileSync(path.join(animationsDir, manifestByKey.get(key)!.fileName), bytes);
          }
          const missingRequired = COMPANION_ANIMATION_MANIFEST
            .filter((entry) => entry.requiredForCreation && !fs.existsSync(path.join(animationsDir, entry.fileName)))
            .map((entry) => entry.key);
          if (missingRequired.length) {
            throw new Error(`Missing required Companion animations: ${missingRequired.join(', ')}`);
          }
          let totalBytes = 0;
          for (const definition of COMPANION_ANIMATION_MANIFEST) {
            const target = path.join(animationsDir, definition.fileName);
            if (!fs.existsSync(target)) continue;
            if (!fs.lstatSync(target).isFile()) {
              throw new Error(`Companion animation is not a regular file: ${definition.key}`);
            }
            const bytes = fs.readFileSync(target);
            validateCompanionPngAsset(definition, bytes);
            totalBytes += bytes.byteLength;
            if (totalBytes > MAX_COMPANION_TOTAL_ASSET_BYTES) {
              throw new Error('Companion animation assets exceed the maximum total size.');
            }
          }
          if (fs.existsSync(companionDir)) fs.renameSync(companionDir, backupDir);
          fs.renameSync(stagingDir, companionDir);
          stagingDir = undefined;
          assetsPromoted = true;
        } catch (error) {
          if (stagingDir && fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
          if (backupDir && fs.existsSync(backupDir) && !fs.existsSync(companionDir)) {
            fs.renameSync(backupDir, companionDir);
          }
          throw error;
        }
      }
      const {
        personalityAnalysisId: _analysisId,
        assets: _assets,
        deleteAnimationKeys: _deleteAnimationKeys,
        assetRoot: _assetRoot,
        ...profileInput
      } = rest;
      try {
        if (consumedAnalysis) consumedAnalysis.used = true;
        const updated = this.db.updateCompanion(id, {
          ...profileInput,
          name: name ?? current.name,
        });
        if (personalityChanged) {
          const analysisForSeed = consumedAnalysisId
            ? this.personalityAnalyses.get(consumedAnalysisId)
            : undefined;
          const seedPlan = this.resolveDiscoverySeedPlan(updated, analysisForSeed);
          this.syncPersonalityDiscoverySeed(updated, analysisForSeed);
          void this.ensureCuratedFeedSources(updated, seedPlan).then(async () => {
            if (this.webSearchProvider.mode === 'unavailable') return;
            try {
              await this.runAutonomousExploration({ companionId: updated.id, trigger: 'manual' });
            } catch {
              // Bounded refresh must not fail the personality edit.
            }
          });
        }
        if (consumedAnalysisId) this.personalityAnalyses.delete(consumedAnalysisId);
        return updated;
      } catch (error) {
        if (consumedAnalysis) consumedAnalysis.used = false;
        if (assetsPromoted) {
          if (fs.existsSync(companionDir)) fs.rmSync(companionDir, { recursive: true, force: true });
          if (backupDir && fs.existsSync(backupDir)) fs.renameSync(backupDir, companionDir);
        }
        try {
          this.db.updateCompanion(id, {
            name: current.name,
            personalityDescription: current.personalityDescription,
            personality: current.personality,
            assetRoot: current.assetRoot,
          });
          if (personalityChanged) this.syncPersonalityDiscoverySeed(current);
        } catch {
          // Preserve the original update failure; rollback is best-effort after
          // both the database and file snapshot have been restored.
        }
        throw error;
      } finally {
        try {
          if (stagingDir && fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch {
          // Cleanup failure must not reverse a successfully committed edit.
        }
        try {
          if (backupDir && fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
        } catch {
          // The backup is outside the active companion path and can be cleaned
          // up on a later maintenance pass without invalidating the edit.
        }
      }
    },
    delete: async (id: string): Promise<{ id: string; deleted: true }> => {
      const companion = this.db.getCompanion(id);
      if (!companion) throw new Error(`Companion not found: ${id}`);
      if (this.db.listCompanions().length <= 1) throw new Error('Create another Companion before deleting your only Companion.');
      if (companion.isPrimary) throw new Error('Choose another primary Companion before deleting this Companion.');
      const result = this.db.deleteCompanion(id);
      this.clearCompanionDiscoveryPreferences(id);
      const companionDir = path.join(app.getPath('userData'), 'companions', id);
      if (fs.existsSync(companionDir)) fs.rmSync(companionDir, { recursive: true, force: true });
      return result;
    },
    setPrimary: async (id: string): Promise<CompanionProfile> => {
      this.cancelCommandForCompanionSwitch(id);
      const companion = this.db.setPrimaryCompanion(id);
      this.syncPersonalityDiscoverySeed(companion);
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
      const temporaryPath = `${filePath}.tmp-${createId('asset')}`;
      try {
        fs.writeFileSync(temporaryPath, buf);
        fs.renameSync(temporaryPath, filePath);
      } finally {
        if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
      }
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
      const animationDefinition = input.subfolder === 'animations'
        ? COMPANION_ANIMATION_MANIFEST.find((entry) => entry.fileName === input.fileName)
        : undefined;
      if (animationDefinition?.requiredForCreation) {
        throw new Error(`Required Companion animation cannot be deleted: ${animationDefinition.key}`);
      }
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
    getFeed: async (input: DiscoveryFeedInput = {}) => {
      const companionId = this.db.resolveActiveCompanionId();
      return this.db.listDiscoveries({ ...input, companionId });
    },
    refresh: async (input: { sources?: DiscoverySource[] } = {}) => {
      const result = await this.runDiscoveryRefresh(input.sources);
      return result.discoveries;
    },
    markInterested: async (discoveryId: string) => {
      const companionId = this.db.resolveActiveCompanionId();
      const ownedDiscovery = this.db.getDiscovery(discoveryId);
      if (!ownedDiscovery || ownedDiscovery.companionId !== companionId) {
        throw new Error('Discovery not found for the active Companion.');
      }
      const discovery = this.db.transitionDiscoveryStatus(discoveryId, 'saved');
      this.applyCharacterEmotion(companionId, 'user_accepts_discovery');
      return discovery;
    },
    markNotInterested: async (discoveryId: string) => {
      const companionId = this.db.resolveActiveCompanionId();
      const ownedDiscovery = this.db.getDiscovery(discoveryId);
      if (!ownedDiscovery || ownedDiscovery.companionId !== companionId) {
        throw new Error('Discovery not found for the active Companion.');
      }
      const discovery = this.db.transitionDiscoveryStatus(discoveryId, 'rejected');
      this.applyCharacterEmotion(companionId, 'user_rejects_discovery');
      return discovery;
    },
    addToJourney: async (input: AddDiscoveryToJourneyInput) => {
      const discovery = this.db.getDiscovery(input.discoveryId);
      if (!discovery) throw new Error(`Discovery not found: ${input.discoveryId}`);
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      if (discovery.companionId && discovery.companionId !== companionId) {
        throw new Error('Discovery belongs to a different Companion.');
      }

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
          sourceUrl: discovery.url,
          companionId
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
      this.db.transitionDiscoveryStatus(discovery.id, 'saved');
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
    listBases: async (): Promise<DiscoveryBase[]> => {
      const companion = this.requireActiveCompanion();
      this.syncPersonalityDiscoverySeed(companion);
      const now = this.now().toISOString();
      for (const persistedBase of this.db.listDiscoveryBases(companion.id, 'trial', 1_000)) {
        const transitioned = transitionDiscoveryBase({
          base: {
            ...persistedBase,
            origin: persistedBase.origin as DiscoveryBase['origin'],
          },
          feedback: 'none',
          now,
        });
        if (transitioned.state !== persistedBase.state) {
          this.db.upsertDiscoveryBase(transitioned);
        }
      }
      return this.db.listDiscoveryBases(companion.id, undefined, 1_000).map((base) => ({
        ...base,
        origin: base.origin as DiscoveryBase['origin'],
      }));
    },
    addBase: async (input: AddDiscoveryBaseInput): Promise<DiscoveryBase> => {
      const companionId = this.db.resolveActiveCompanionId();
      const normalized = normalizeDiscoveryBaseInput(input);
      const existing = this.db.getDiscoveryBaseByLocator(
        companionId,
        normalized.connectorId,
        normalized.scope,
        normalized.locator,
      );
      if (existing) return { ...existing, origin: existing.origin as DiscoveryBase['origin'] };
      if (normalized.scope === 'feed') {
        await this.probeDiscoveryFeed(normalized.locator, companionId);
      }
      const now = this.now().toISOString();
      const owned = this.db.listDiscoveryBases(companionId, undefined, 1_000)
        .map((base) => ({ ...base, origin: base.origin as DiscoveryBase['origin'] }));
      const allowance = canStartDiscoveryTrial({
        companionId,
        bases: owned,
        now,
        policy: {
          ...DEFAULT_DISCOVERY_TRIAL_POLICY,
          // The daily cap protects automatic source growth. Explicit user
          // additions remain bounded by the total Trial/Active limits.
          maxNewTrialsPerDay: Number.MAX_SAFE_INTEGER,
        },
      });
      if (!allowance.allowed) throw new Error(`DISCOVERY_SOURCE_LIMIT:${allowance.reason}`);
      const trial = startDiscoveryTrial({
        base: {
          id: createSemanticFingerprint('discovery_base', [
            companionId,
            normalized.connectorId,
            normalized.scope,
            normalized.locator,
          ]),
          companionId,
          connectorId: normalized.connectorId,
          scope: normalized.scope,
          locator: normalized.locator,
          data: normalized.label ? { label: normalized.label } : {},
          origin: 'user',
          discoveredAt: now,
        },
        now,
      });
      const persisted = this.db.upsertDiscoveryBase(
        normalized.initialState === 'active' ? { ...trial, state: 'active' } : trial,
      );
      return { ...persisted, origin: persisted.origin as DiscoveryBase['origin'] };
    },
    updateBaseState: async (input: { baseId: string; state: DiscoveryBaseState }): Promise<DiscoveryBase> => {
      const companionId = this.db.resolveActiveCompanionId();
      const base = this.db.getDiscoveryBase(input.baseId, companionId);
      if (!base) throw new Error('DISCOVERY_SOURCE_NOT_FOUND');
      const allowedStates = new Set<DiscoveryBaseState>([
        'trial',
        'active',
        'expired',
        'muted',
        'blocked',
        'rejected',
      ]);
      if (!allowedStates.has(input.state)) throw new Error('DISCOVERY_SOURCE_STATE_INVALID');
      const now = this.now().toISOString();
      const next = input.state === 'trial' && !base.trialStartedAt
        ? startDiscoveryTrial({
          base: {
            ...base,
            origin: base.origin as DiscoveryBase['origin'],
          },
          now,
        })
        : { ...base, state: input.state, updatedAt: now };
      const persisted = this.db.upsertDiscoveryBase(next);
      return { ...persisted, origin: persisted.origin as DiscoveryBase['origin'] };
    },
    deleteBase: async (baseId: string): Promise<{ deleted: true }> => {
      const companionId = this.db.resolveActiveCompanionId();
      const existing = this.db.getDiscoveryBase(baseId, companionId);
      if (!existing) throw new Error('DISCOVERY_SOURCE_NOT_FOUND');
      // Deleting a pinned/user Source does not suppress Discovery Channels.
      if (!this.db.deleteDiscoveryBase(baseId, companionId)) throw new Error('DISCOVERY_SOURCE_DELETE_FAILED');
      return { deleted: true };
    },
    listChannels: async (): Promise<CompanionDiscoveryChannel[]> => {
      const companion = this.requireActiveCompanion();
      this.migrateV1ManagedPlatformQueries(companion);
      return this.reconcileDiscoveryChannels(companion.id, this.now().toISOString());
    },
    updateChannelState: async (input: {
      platformId: DiscoveryPlatformId;
      state: DiscoveryChannelState;
    }): Promise<CompanionDiscoveryChannel> => {
      const companion = this.requireActiveCompanion();
      if (!isDiscoveryPlatformId(input.platformId)) throw new Error('DISCOVERY_PLATFORM_UNKNOWN');
      if (!['enabled', 'muted', 'blocked', 'suppressed'].includes(input.state)) {
        throw new Error('DISCOVERY_CHANNEL_STATE_INVALID');
      }
      return this.updateDiscoveryChannelState(companion.id, input.platformId, input.state);
    },
    exploreChannelNow: async (platformId: DiscoveryPlatformId): Promise<ExplorationCycleResult> => {
      const companion = this.requireActiveCompanion();
      if (!isDiscoveryPlatformId(platformId)) throw new Error('DISCOVERY_PLATFORM_UNKNOWN');
      const channel = this.listDiscoveryChannels(companion.id).find((entry) => entry.platformId === platformId);
      if (!channel || channel.state !== 'enabled') throw new Error('DISCOVERY_CHANNEL_NOT_ENABLED');
      return this.runAutonomousExploration(
        { companionId: companion.id, trigger: 'manual' },
        undefined,
        platformId,
      );
    },
    listSuppressedPlatforms: async (): Promise<CompanionDiscoveryChannel[]> => {
      const companion = this.requireActiveCompanion();
      return this.listDiscoveryChannels(companion.id).filter((channel) => channel.state === 'suppressed');
    },
    restoreManagedPlatform: async (platformId: DiscoveryPlatformId): Promise<CompanionDiscoveryChannel> => {
      if (!isDiscoveryPlatformId(platformId)) throw new Error('DISCOVERY_PLATFORM_UNKNOWN');
      const companion = this.requireActiveCompanion();
      return this.updateDiscoveryChannelState(companion.id, platformId, 'enabled');
    },
    getDiscoveryProfile: async (): Promise<CompanionDiscoveryProfile | null> => {
      const companion = this.requireActiveCompanion();
      this.syncPersonalityDiscoverySeed(companion);
      return this.readDiscoveryProfile(companion.id);
    },
    getAutoManageDefaultPlatforms: async (): Promise<boolean> => this.getAutoManageDefaultPlatforms(),
    setAutoManageDefaultPlatforms: async (enabled: boolean): Promise<boolean> => {
      return this.setAutoManageDefaultPlatforms(Boolean(enabled));
    },
    getBootstrapStatus: async (): Promise<DiscoveryBootstrapResult | null> => this.getBootstrapStatus(),
    getWebSearchDiagnostics: async (): Promise<WebSearchProviderDiagnostics> =>
      getWebSearchProviderDiagnostics(this.webSearchProvider),
    runBaseNow: async (baseId: string): Promise<ExplorationCycleResult> => {
      const companionId = this.db.resolveActiveCompanionId();
      const base = this.db.getDiscoveryBase(baseId, companionId);
      if (!base) throw new Error('DISCOVERY_SOURCE_NOT_FOUND');
      if (base.state !== 'trial' && base.state !== 'active') {
        throw new Error('DISCOVERY_SOURCE_NOT_RUNNABLE');
      }
      const result = await this.runAutonomousExploration(
        { companionId, trigger: 'manual' },
        baseId,
      );
      const inspection = this.latestDiscoveryInspections.get(companionId);
      const refreshed = this.db.getDiscoveryBase(baseId, companionId);
      const executed = inspection?.executedBases.some((item) => item.id === baseId) ?? false;
      if (refreshed) {
        this.db.updateDiscoveryBase({
          ...refreshed,
          data: {
            ...refreshed.data,
            lastResult: executed
              ? inspection?.materialUpdateCount
                ? 'material_update'
                : inspection?.newCount
                  ? 'new'
                  : inspection?.duplicateCount
                    ? 'duplicate'
                    : 'completed'
              : 'not_executed',
          },
          updatedAt: this.now().toISOString(),
        });
      }
      if (!executed) throw new Error('DISCOVERY_SOURCE_NOT_EXECUTED');
      return result;
    },
    generateNow: async () => {
      const result = await this.runDiscoveryRefresh();
      return result.discoveries;
    },
    presentNext: async () => {
      const companionId = this.db.resolveActiveCompanionId();
      const oldest = this.db.getOldestQueuedDiscovery(companionId);
      if (!oldest) return false;
      this.requestDiscoveryPresentation(oldest);
      return true;
    },
    resetLifecycle: async () => {
      this.db.clearAnnouncedDiscoveryIds();
      const discoveries = this.db.listDiscoveries({ limit: 200 });
      for (const d of discoveries) {
        if (d.status === 'queued' || d.status === 'presenting') {
          this.db.transitionDiscoveryStatus(d.id, 'eligible', {
            reason: 'developer_lifecycle_reset'
          });
        }
      }
      return { reset: true };
    },
    countPendingAnnouncements: async () => {
      return { count: this.db.listQueuedOrEligible(200).length };
    },
    resetAnnouncementHistory: async () => {
      this.db.clearAnnouncedDiscoveryIds();
      return { count: this.db.listQueuedOrEligible(200).length };
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
    getCurrentCycle: async () => this.db.getCurrentExplorationCycleForCompanion(this.db.resolveActiveCompanionId()),
    getCycleHistory: async (input: { limit?: number } = {}) => {
      const companionId = this.db.resolveActiveCompanionId();
      return this.db.listExplorationCycles(100).filter((cycle) => cycle.companionId === companionId).slice(0, input.limit ?? 20);
    },
    submitFeedback: async (input: SubmitDiscoveryFeedbackInput) => this.submitDiscoveryFeedback(input)
  };

  memory = {
    createNode: async (input: CreateMemoryNodeInput) => {
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      const memory = this.db.insertMemoryNode(createMemoryNode({ ...input, companionId }));
      await this.recomputeMemoryImpact({ id: memory.id, companionId });
      return memory;
    },
    getNode: async (id: string) => {
      const companionId = this.db.resolveActiveCompanionId();
      return this.db.getMemoryNode(id, companionId);
    },
    updateNode: async (input: UpdateMemoryNodeInput) => {
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      const existing = this.db.getMemoryNode(input.id, companionId);
      if (!existing) throw new Error(`Memory node not found: ${input.id}`);
      const memory = this.db.updateMemoryNode(updateMemoryNodePure(existing, { ...input, companionId }));
      await this.recomputeMemoryImpact({ id: memory.id, companionId });
      return memory;
    },
    deleteNode: async (id: string) => {
      const companionId = this.db.resolveActiveCompanionId();
      const existing = this.db.getMemoryNode(id, companionId);
      if (!existing) throw new Error(`Memory node not found: ${id}`);
      this.db.deleteMemoryNode(id);
      this.reconcileDeletedMemoryTombstones(
        companionId,
        existing.userId ?? 'default',
        this.runtimeClock.now().toISOString(),
      );
      return { id, deleted: true as const };
    },
    createEdge: async (input: CreateMemoryEdgeInput) => {
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      if (
        !this.db.getMemoryNode(input.fromNodeId, companionId) ||
        !this.db.getMemoryNode(input.toNodeId, companionId)
      ) {
        throw new Error('Memory edge endpoints must belong to the active Companion.');
      }
      return this.db.insertMemoryEdge(createMemoryEdge(input));
    },
    getGraph: async (input: { query?: string; companionId?: string } = {}) => {
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      return graphFromMemory(
        this.db.listMemoryNodes(companionId),
        this.db.listMemoryEdges(companionId),
        input.query
      );
    },
    search: async (input: { query: string; companionId?: string }) => {
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      return searchMemory(this.db.listMemoryNodes(companionId), input.query);
    },
    inspectImpact: async (id: string) => this.inspectMemoryImpact(id),
    recomputeImpact: async (input: { id: string; explore?: boolean }) => this.recomputeMemoryImpact(input),
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
    getEntries: async (input: { characterId?: string; type?: 'daily' | 'weekly' | 'milestone'; limit?: number } = {}) => {
      const characterId = this.db.resolveActiveCompanionId(input.characterId);
      return this.db.listDiaryEntries({ ...input, characterId });
    },
    generateDaily: async (input: { characterId?: string } = {}) => {
      const correlationId = createId('corr');
      const characterId = this.db.resolveActiveCompanionId(input.characterId);
      this.emitFoundationEvent('ReflectionRequested', 'reflection', {
        characterId
      }, correlationId);
      const entry = generateDailyDiary({
        characterId,
        milestones: this.db.listMilestones().slice(0, 10),
        savedDiscoveries: this.db
          .listDiscoveries({ status: 'saved', limit: 100 })
          .filter((discovery) => discovery.companionId === characterId)
          .slice(0, 10) as Discovery[],
        completedTasks: [],
        memoryChanges: this.db.listMemoryNodes(characterId).slice(0, 10),
        generatedAt: this.runtimeClock.now().toISOString(),
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
      const result = await executeTool(input, this.toolAdapters);
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
      const hasAi = aiSettings.apiKeyConfigured || Boolean(this.aiProvider);
      let llmDeps = undefined;
      if (hasAi) {
        llmDeps = {
          completeJson: async <T>(messages: Array<{ role: 'system' | 'user'; content: string }>) => {
            if (this.aiProvider) {
              return this.aiProvider.complete<T>({
                operation: 'action_plan',
                messages
              });
            }
            const result = await this.createDeepSeekClient().chat(
              messages.map((m) => ({ ...m, role: m.role as 'system' | 'user' | 'assistant' }))
            );
            return result as T;
          },
          validateActionPlan: (raw: string) => validateActionPlan(raw),
        };
      }
      return planAction(text, llmDeps);
    },
    executePlan: async (plan: ActionPlan) => {
      return this.executeActionPlan(plan, this.db.getActionPermissions());
    },
    getPermissions: async (): Promise<ActionPermissionState> => this.db.getActionPermissions(),
    updatePermissions: async (state: ActionPermissionState): Promise<ActionPermissionState> => this.db.setActionPermissions(state),
  };

  private async executeActionPlan(
    plan: ActionPlan,
    permissions: ActionPermissionState,
  ): Promise<ActionResult> {
    const correlationId = createId('corr');
    this.emitFoundationEvent('ActionRequested', 'action', { planId: plan.id, intentId: plan.intentId }, correlationId);
    const orchDeps: ActionOrchestratorDeps = {
      executeStep: (toolName: string, args: Record<string, unknown>) =>
        executeActionStep(toolName, args, this.toolAdapters),
      emitEvent: (type: string, payload?: Record<string, unknown>, cid?: string) =>
        this.emitFoundationEvent(type, 'action', payload, cid ?? correlationId),
      getPermissions: () => permissions,
      directPerformance: (actionId: string, outcome: 'success' | 'failure') =>
        directPerformance(actionId, outcome),
      broadcastPerformance: (script: PerformanceScript) => {
        for (const listener of this.onPerformanceListeners) listener(script);
      },
    };
    return runActionPlan(plan, orchDeps, correlationId);
  }

  private recordAiDeveloperEvent(input: {
    channel: string;
    source: string;
    status: 'success' | 'error';
    requestMessages: Array<{ role: string; content: string }>;
    requestBody?: unknown;
    rawResponse?: unknown;
    content: string;
    error?: string;
    durationMs: number;
    provider?: string;
    companionId?: string;
    correlationId?: string;
    cycleId?: string;
    turnId?: string;
  }): void {
    this.pushDeveloperDebugEvent({
      kind: 'ai_call',
      operation: input.channel,
      status: input.status,
      provider: input.provider ?? (this.aiProvider ? 'injected' : 'deepseek'),
      source: input.source,
      companionId: input.companionId,
      correlationId: input.correlationId,
      cycleId: input.cycleId,
      turnId: input.turnId,
      summary: input.content || input.error || '',
      errorMessage: input.error,
      payload: redactSecrets({
        channel: input.channel,
        source: input.source,
        requestMessages: input.requestMessages,
        requestBody: input.requestBody,
        rawResponse: input.rawResponse,
        durationMs: input.durationMs,
      }) as Record<string, unknown>,
    });
  }

  private pushDeveloperDebugEvent(input: DeveloperDebugEventInput): DeveloperDebugEvent {
    const event: DeveloperDebugEvent = {
      ...input,
      id: createId('devent'),
      createdAt: nowIso(),
      syncStatus: 'pending',
      syncAttemptCount: 0,
    };
    const inserted = this.db.insertDeveloperDebugEvent(event);
    void this.flushPendingDebugEvents();
    return inserted;
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
      const result = await this.companion.turn({
        characterId: input.characterId,
        message: input.message,
        source: 'panel_text',
      });
      return { message: result.message };
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
    getDebugLog: async (): Promise<AiDebugEntry[]> => {
      const events = this.db.listDeveloperDebugEvents({ kind: 'ai_call', limit: 100 });
      return events.map((e) => ({
        id: e.id,
        channel: (e.operation ?? 'chat') as AiDebugEntry['channel'],
        source: (e.payload as Record<string, unknown>)?.source as string ?? '',
        status: (e.status ?? 'success') as 'success' | 'error',
        requestMessages: ((e.payload as Record<string, unknown>)?.requestMessages as Array<{ role: string; content: string }>) ?? [],
        requestBody: (e.payload as Record<string, unknown>)?.requestBody,
        rawResponse: (e.payload as Record<string, unknown>)?.rawResponse,
        content: e.summary ?? '',
        error: e.errorMessage,
        createdAt: e.createdAt,
      }));
    }
  };

  debugEvents = {
    listEvents: async (options?: { kind?: DeveloperDebugEventKind; limit?: number; offset?: number }): Promise<DeveloperDebugEvent[]> =>
      this.db.listDeveloperDebugEvents(options),
    countEvents: async (options?: { kind?: DeveloperDebugEventKind }): Promise<number> =>
      this.db.countDeveloperDebugEvents(options),
  };

  developer = {
    getUploadSetting: async (): Promise<boolean> =>
      this.db.getAppSetting<boolean>('developer.debugUploadEnabled') ?? false,
    setUploadSetting: async (enabled: boolean): Promise<void> => {
      this.db.setAppSetting('developer.debugUploadEnabled', enabled);
      if (enabled) void this.flushPendingDebugEvents();
    },
    flushDebugEvents: async (): Promise<{ uploaded: number; failed: number }> => this.flushPendingDebugEvents(),
    getUploadStatus: async () => {
      const networkStatus = this.network.getStatusSnapshot();
      return {
        isDevBuild: !app.isPackaged,
        onlineModeEnabled: networkStatus.onlineModeEnabled,
        networkState: networkStatus.state,
        authenticated: !!networkStatus.account,
        uploadSettingEnabled: this.db.getAppSetting<boolean>('developer.debugUploadEnabled') ?? false,
        pendingEvents: this.db.countDeveloperDebugEvents({ syncStatus: 'pending' }),
        lastUploadAt: this.db.getAppSetting<string>('developer.lastUploadAt'),
        lastUploadError: this.db.getAppSetting<string>('developer.lastUploadError'),
      };
    },
  };

  private async flushPendingDebugEvents(): Promise<{ uploaded: number; failed: number }> {
    if (app.isPackaged) return { uploaded: 0, failed: 0 };
    if (this.debugFlushPromise) return this.debugFlushPromise;
    this.debugFlushPromise = this.doFlushPendingDebugEvents();
    try { return await this.debugFlushPromise; } finally { this.debugFlushPromise = undefined; }
  }

  private async doFlushPendingDebugEvents(): Promise<{ uploaded: number; failed: number }> {
    const networkStatus = this.network.getStatusSnapshot();
    if (!networkStatus.onlineModeEnabled || networkStatus.state !== 'online') return { uploaded: 0, failed: 0 };
    if (!networkStatus.account) return { uploaded: 0, failed: 0 };
    const uploadEnabled = this.db.getAppSetting<boolean>('developer.debugUploadEnabled') ?? false;
    if (!uploadEnabled) return { uploaded: 0, failed: 0 };
    const pending = this.db.listDeveloperDebugEvents({ syncStatus: 'pending', limit: 50 });
    if (pending.length === 0) return { uploaded: 0, failed: 0 };
    const batch = pending.map((event) => ({
      clientEventId: event.id,
      kind: event.kind,
      operation: event.operation,
      status: event.status,
      provider: event.provider,
      model: event.model,
      companionId: event.companionId,
      correlationId: event.correlationId,
      cycleId: event.cycleId,
      turnId: event.turnId,
      summary: event.summary,
      payload: redactSecrets(event.payload ?? {}),
      errorCode: event.errorCode,
      clientCreatedAt: event.createdAt,
    }));
    try {
      this.db.markDeveloperDebugEventsUploading(pending.map((e) => e.id));
      await this.network.postBatchDebugEvents(batch);
      this.db.markDeveloperDebugEventsUploaded(pending.map((e) => e.id));
      this.db.setAppSetting('developer.lastUploadAt', nowIso());
      this.db.setAppSetting('developer.lastUploadError', undefined);
      return { uploaded: pending.length, failed: 0 };
    } catch (error) {
      this.db.markDeveloperDebugEventsPending(pending.map((e) => e.id));
      const msg = error instanceof Error ? error.message : String(error);
      this.db.setAppSetting('developer.lastUploadError', msg);
      return { uploaded: 0, failed: pending.length };
    }
  }

  speech = {
    getStatus: async () => {
      const status = await this.speechProvider.getStatus(app.getPath('userData'));
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
        const result = await this.speechProvider.transcribe({
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
      const result = await this.turnOrchestrator.handle(input);
      if (input.source === 'voice') {
        this.applyCharacterEmotion(input.characterId, 'expertise_topic_match');
      }
      return result;
    },
    resolveTurnPermission: async (input: import('@our-companion/shared').ResolveCompanionTurnPermissionInput) =>
      this.turnOrchestrator.resolvePermission(input),
    undoRememberedMemory: async (undoToken: string) =>
      this.turnMemoryPolicy.undo(undoToken, this.db.resolveActiveCompanionId()),
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
      const previousMode = this.db.getAppSetting<'available' | 'focused' | 'do_not_disturb'>('attention_mode') ?? 'available';
      this.db.setAppSetting('attention_mode', mode);
      this.companionRuntime.setExplicitMode(mode);
      if (previousMode !== 'available' && mode === 'available') {
        this.companionRuntime.reevaluatePendingActions();
      }
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
      if (record.command.expiresAt && Date.parse(record.command.expiresAt) <= this.now().getTime()) {
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
    this.activeCommand = { command, latestStatus: 'issued', updatedAt: this.now().toISOString(), terminal: false };
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
    if (record.command.discoveryId) {
      this.shareOrchestrator?.acknowledge(record.command.id, nextStatus, input.reason);
    }
    this.emitFoundationEvent('CompanionCommandAck', 'companion', {
      commandId: record.command.id,
      companionId: record.command.companionId,
      status: nextStatus,
      reason: input.reason,
      failedStep: input.failedStep,
    });
    if (record.terminal) {
      if (record.command.discoveryId) {
        this.startedDiscoveryPayloads.delete(record.command.discoveryId);
        this.presentationDecisions.delete(record.command.discoveryId);
        this.presentationDecisionReevaluationAt.delete(record.command.discoveryId);
        this.presentationDecisionAttempts.delete(record.command.discoveryId);
        this.presentationDiscoveries.delete(record.command.discoveryId);
      }
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
    getEngineSnapshot: async (input: EngineSnapshotInput = {}) => {
      const companionId = this.db.tryResolveActiveCompanionId() ?? undefined;
      return {
        ...buildEngineSnapshot(this.db, input, companionId, this.shareOrchestrator, this.researchOrchestrator.getCapabilities()),
        discoveryInspection: companionId ? this.latestDiscoveryInspections.get(companionId) : undefined,
        turnInspections: this.turnOrchestrator.getInspections(companionId),
      };
    },
    getRuntimeTime: async () => this.getRuntimeTimeStatus(),
    advanceRuntimeTime: async (input: { milliseconds: number; runScheduledTick?: boolean }) => this.advanceRuntimeTime(input),
    resetRuntimeTime: async () => this.resetRuntimeTime(),
    runScheduledTick: async () => this.runRuntimeScheduledTick(),
    runFixtureResearch: async (input: { topic: string }) => this.runFixtureResearch(input.topic),
    researchFromUrl: async (input: { url: string }) => this.researchFromUrl(input.url),
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
    if (this.activeCommand) this.tryStartDiscoveryPayload(this.activeCommand.command);
  }

  settleDiscoveryPresentationCommand(
    command: CompanionCommand,
    status: Extract<CommandAckStatus, 'cancelled' | 'failed'>,
    reason: string
  ): boolean {
    return this.transitionActiveCommand(status, {
      commandId: command.id,
      companionId: command.companionId,
      reason
    });
  }

  attachNetworkStatusBroadcaster(broadcaster: (status: NetworkStatus) => void): void {
    this.networkStatusBroadcaster = broadcaster;
  }

  attachVisualVisitBroadcaster(broadcaster: (state: VisualVisitRendererState) => void): void {
    this.visualVisitBroadcaster = broadcaster;
  }

  requestDiscoveryPresentation(discovery: Discovery): CompanionDecision {
    const activeCompanionId = this.db.resolveActiveCompanionId();
    if (discovery.companionId !== activeCompanionId) {
      return {
        id: createId('decision'),
        action: 'stay_silent',
        priority: 'low',
        timing: 'later',
        reason: 'discovery_companion_mismatch',
        displayHint: 'stay_silent',
        createdAt: this.now().toISOString()
      };
    }
    const existingDecision = this.presentationDecisions.get(discovery.id);
    const reevaluateAt = this.presentationDecisionReevaluationAt.get(discovery.id);
    if (existingDecision && (reevaluateAt === undefined || this.now().getTime() < reevaluateAt)) {
      return existingDecision;
    }
    if (existingDecision) {
      this.presentationDecisions.delete(discovery.id);
      this.presentationDecisionReevaluationAt.delete(discovery.id);
    }
    const eligibleDiscovery = discovery.status === 'candidate'
      ? this.db.transitionDiscoveryStatus(discovery.id, 'eligible', {
          companionId: discovery.companionId ?? this.db.resolveActiveCompanionId(),
          cycleId: discovery.cycleId,
          reason: 'candidate_selected_for_decision'
        })
      : discovery;
    this.presentationDiscoveries.set(eligibleDiscovery.id, eligibleDiscovery);
    const decision = this.companionRuntime.decideForDiscovery(
      eligibleDiscovery,
      this.companionSessionPhase !== 'inactive' && this.companionSessionPhase !== 'idle',
      this.companionDragging
    );
    this.presentationDecisions.set(eligibleDiscovery.id, decision);
    const deferred = decision.timing === 'next_idle';
    if (this.companionRuntime.shouldPresentNow(decision) || deferred) {
      const queuedDiscovery = this.db.transitionDiscoveryStatus(eligibleDiscovery.id, 'queued', {
        companionId: eligibleDiscovery.companionId ?? this.db.resolveActiveCompanionId(),
        cycleId: eligibleDiscovery.cycleId,
        reason: deferred ? 'decision_deferred_until_idle' : 'decision_approved'
      });
      this.presentationDiscoveries.set(queuedDiscovery.id, queuedDiscovery);
      this.presentationDecisionReevaluationAt.delete(eligibleDiscovery.id);
      this.presentationDecisionAttempts.delete(eligibleDiscovery.id);
    } else {
      this.presentationDiscoveries.delete(eligibleDiscovery.id);
      const attempt = (this.presentationDecisionAttempts.get(eligibleDiscovery.id) ?? 0) + 1;
      const delayMs = Math.min(
        DISCOVERY_REEVALUATION_BASE_MS * (2 ** Math.min(attempt - 1, 8)),
        DISCOVERY_REEVALUATION_MAX_MS
      );
      this.presentationDecisionAttempts.set(eligibleDiscovery.id, attempt);
      this.presentationDecisionReevaluationAt.set(
        eligibleDiscovery.id,
        this.now().getTime() + delayMs
      );
      this.db.transitionDiscoveryStatus(eligibleDiscovery.id, 'eligible', {
        companionId: eligibleDiscovery.companionId,
        cycleId: eligibleDiscovery.cycleId,
        reason: decision.reason
      });
    }
    return decision;
  }

  isDiscoveryPresentationBusy(): boolean {
    return this.shareOrchestrator?.isBusy() ?? false;
  }

  hasPendingDiscoveryPresentation(): boolean {
    return this.presentationDiscoveries.size > 0 || (this.shareOrchestrator?.hasPending() ?? false);
  }

  private tryStartDiscoveryPayload(command: CompanionCommand): void {
    if (
      !this.shareOrchestrator ||
      !command.discoveryId ||
      !this.companionRuntime.shouldPresentNow(command.decision) ||
      this.startedDiscoveryPayloads.has(command.discoveryId)
    ) return;
    const discovery = this.presentationDiscoveries.get(command.discoveryId) ?? this.db.getDiscovery(command.discoveryId);
    if (!discovery) return;
    if (this.shareOrchestrator.enqueue(command, discovery)) {
      this.startedDiscoveryPayloads.add(discovery.id);
      this.presentationDiscoveries.delete(discovery.id);
    }
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
    companionId: string,
    coreState: CharacterRuntimeState['coreState'],
    intent: CharacterRuntimeState['intent'],
    animationIntent?: string
  ): CharacterRuntimeState {
    return this.companionRuntime.advanceWithIntent(companionId, coreState, intent, animationIntent);
  }

  private requireCompanionName(companionId: string): string {
    const companion = this.db.getCompanion(companionId);
    if (!companion) throw new Error(`Companion not found: ${companionId}`);
    return companion.name;
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
      createdAt: this.runtimeClock.now().toISOString()
    });
    this.explorationBroadcaster?.(event);
    this.emitFoundationEvent('DiscoveryCreated', 'discovery', {
      cycleId: cycle.id,
      state,
      message
    });
    return event;
  }

  private saveCycleState(
    cycle: ExplorationCycle,
    state: ExplorationState,
    patch: Partial<ExplorationCycle> = {},
    event?: { message: string; metadata?: Record<string, unknown> },
  ): ExplorationCycle {
    const next = this.db.insertExplorationCycle({
      ...cycle,
      ...patch,
      state
    });
    this.recordExplorationEvent(
      next,
      state,
      event?.message ?? this.messageForExplorationState(state, next.companionId),
      event?.metadata,
    );
    return next;
  }

  private messageForExplorationState(state: ExplorationState, companionId: string): string {
    const name = this.requireCompanionName(companionId);
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

  private recordEngineTrace(input: {
    correlationId: string;
    causationId?: string;
    cycleId?: string;
    companionId: string;
    engine: string;
    operation: string;
    providerMode?: EngineProviderMode;
    inputRefs?: string[];
    outputRefs?: string[];
    status: EngineTraceStatus;
    startedAt?: string;
    skipReason?: string;
    error?: string;
  }): EngineTrace {
    const completedAt = this.now().toISOString();
    const startedAt = input.startedAt ?? completedAt;
    const trace = this.db.insertEngineTrace({
      id: createId('trace'),
      correlationId: input.correlationId,
      causationId: input.causationId,
      cycleId: input.cycleId,
      companionId: input.companionId,
      engine: input.engine,
      operation: input.operation,
      providerMode: input.providerMode ?? 'deterministic',
      inputRefs: input.inputRefs ?? [],
      outputRefs: input.outputRefs ?? [],
      startedAt,
      completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
      status: input.status,
      skipReason: input.skipReason,
      error: input.error
    });
    this.emitFoundationEvent('EngineTraceRecorded', 'trace', {
      traceId: trace.id,
      correlationId: trace.correlationId,
      cycleId: trace.cycleId,
      engine: trace.engine,
      operation: trace.operation,
      status: trace.status
    }, trace.correlationId);
    return trace;
  }

  private async runAutonomousExploration(
    input: StartExplorationInput = {},
    prioritizedDiscoveryBaseId?: string,
    forcedPlatformId?: DiscoveryPlatformId,
  ): Promise<ExplorationCycleResult> {
    const companionId = this.db.resolveActiveCompanionId(input.companionId);
    if (this.localCompanionAway) throw new Error('EXPLORATION_ALREADY_RUNNING');
    const active = this.activeExplorations.get(companionId);
    if (active) {
      if (prioritizedDiscoveryBaseId || forcedPlatformId) throw new Error('EXPLORATION_ALREADY_RUNNING');
      return active;
    }
    const operation = this.runAutonomousExplorationCycle(
      { ...input, companionId },
      prioritizedDiscoveryBaseId,
      forcedPlatformId,
    )
      .catch((error) => {
        const current = this.db.getCurrentExplorationCycleForCompanion(companionId);
        if (current) {
          const recovered = this.saveCycleState(current, 'returning');
          this.saveCycleState(recovered, 'reflecting', { completedAt: this.runtimeClock.now().toISOString() }, {
            message: 'Exploration failed, but Companion returned safely.',
            metadata: { outcome: 'failure' },
          });
        }
        this.companionRuntime.settleDiscoveryPresentation(companionId);
        throw error;
      })
      .finally(() => {
        this.activeExplorations.delete(companionId);
      });
    this.activeExplorations.set(companionId, operation);
    return operation;
  }

  private reconcileDeletedMemoryTombstones(
    companionId: string,
    fallbackUserId: string,
    evaluatedAt: string,
  ): {
    deletedMemoryIds: string[];
    deletedPatternIds: string[];
    removedInterestNodeIds: string[];
    closedCuriosityTargetIds: string[];
  } {
    const tombstones = this.db.listDirtyMemoryProcessing(companionId, 10_000)
      .filter((state) => Boolean(state.deletedAt));
    const deletedMemoryIds = tombstones.map((state) => state.memoryId);
    const report = {
      deletedMemoryIds,
      deletedPatternIds: [] as string[],
      removedInterestNodeIds: [] as string[],
      closedCuriosityTargetIds: [] as string[],
    };
    if (deletedMemoryIds.length === 0) return report;

    const memoryNodes = this.db.listMemoryNodes(companionId);
    const discoveries = this.db.listDiscoveries({ limit: 10_000, companionId });
    const feedback = this.db.listDiscoveryFeedback(10_000, undefined, companionId);
    for (const userId of this.db.listCognitiveUserIds(companionId, fallbackUserId)) {
      const patternCleanup = this.db.pruneDeletedMemoryPatternEvidence(
        userId,
        companionId,
        deletedMemoryIds,
        evaluatedAt,
      );
      report.deletedPatternIds.push(...patternCleanup.deletedPatternIds);
      const patterns = this.db.listPatterns(userId, 10_000, companionId);
      const interestGraph = buildInterestGraph({
        userId: `${userId}:${companionId}`,
        memoryNodes,
        patterns,
        discoveries,
        feedback,
      });
      const graphReplacement = this.db.replaceInterestGraph(interestGraph);
      report.removedInterestNodeIds.push(...graphReplacement.removedNodeIds);
      const curiosityCleanup = this.db.reconcileCuriositySources({
        userId,
        companionId,
        validMemoryIds: memoryNodes.map((memory) => memory.id),
        validPatternIds: patterns.map((pattern) => pattern.id),
        validInterestNodeIds: interestGraph.nodes.map((node) => node.id),
        updatedAt: evaluatedAt,
      });
      report.closedCuriosityTargetIds.push(...curiosityCleanup.closedTargetIds);
    }
    this.db.markDeletedMemoriesProcessed(deletedMemoryIds, evaluatedAt);
    return report;
  }

  private async runAutonomousExplorationCycle(
    input: StartExplorationInput = {},
    prioritizedDiscoveryBaseId?: string,
    forcedPlatformId?: DiscoveryPlatformId,
  ): Promise<ExplorationCycleResult> {
    const userId = input.userId ?? 'default';
    const companionId = this.db.resolveActiveCompanionId(input.companionId);
    const trigger = input.trigger ?? 'manual';
    const cycleId = createId('cycle');
    const correlationId = createId('corr');
    let causationId: string | undefined;
    const trace = (
      engine: string,
      operation: string,
      status: EngineTraceStatus,
      inputRefs: string[],
      outputRefs: string[],
      extra: Partial<Pick<EngineTrace, 'providerMode' | 'skipReason' | 'error' | 'startedAt'>> = {}
    ) => {
      const recorded = this.recordEngineTrace({
        correlationId,
        causationId,
        cycleId,
        companionId,
        engine,
        operation,
        status,
        inputRefs,
        outputRefs,
        ...extra
      });
      causationId = recorded.id;
      return recorded;
    };
    const evaluatedAt = this.runtimeClock.now().toISOString();
    const requestedDiscoveryBase = prioritizedDiscoveryBaseId
      ? this.db.getDiscoveryBase(prioritizedDiscoveryBaseId, companionId)
      : undefined;
    if (
      prioritizedDiscoveryBaseId
      && (!requestedDiscoveryBase
        || (requestedDiscoveryBase.state !== 'trial' && requestedDiscoveryBase.state !== 'active'))
    ) {
      throw new Error('DISCOVERY_SOURCE_NOT_RUNNABLE');
    }
    const deletionCleanup = this.reconcileDeletedMemoryTombstones(companionId, userId, evaluatedAt);
    if (deletionCleanup.deletedMemoryIds.length > 0) {
      trace(
        'memory',
        'consume-deletion-tombstones',
        'completed',
        deletionCleanup.deletedMemoryIds,
        [
          ...deletionCleanup.deletedPatternIds,
          ...deletionCleanup.removedInterestNodeIds,
          ...deletionCleanup.closedCuriosityTargetIds,
        ],
      );
    }
    const characterState = this.db.getCharacterState(companionId);
    const characterProfile = this.db.getActiveCharacters().find((character) => character.id === companionId);
    const memoryNodes = this.db.listCognitionMemoryCandidates(companionId, undefined, 30);
    const journeyMilestones = this.db.listMilestones();
    const discoveryHistory = this.db.listDiscoveries({ limit: 100, companionId });
    const feedbackHistory = this.db.listDiscoveryFeedback(100, undefined, companionId);
    const discoveryContext = buildBoundedDiscoveryContext({
      items: this.db.loadBoundedDiscoveryContext(companionId, 40),
      maximumItems: 40,
      maximumSummaryCharacters: 500,
    });
    trace(
      'memory',
      'load-context',
      memoryNodes.length === 0 ? 'empty' : 'completed',
      [companionId, userId],
      memoryNodes.map((memory) => memory.id)
    );

    const detectedPatterns = detectPatterns({
      userId,
      companionId,
      evaluatedAt,
      memoryNodes,
      journeyMilestones,
      discoveryHistory,
      feedbackHistory
    });
    const persistedPatterns = [];
    for (const pattern of detectedPatterns) {
      const result = this.db.upsertPattern(pattern);
      persistedPatterns.push(result.record);
      if (result.outcome !== 'created') {
        trace(
          'pattern',
          result.outcome === 'updated' ? 'pattern:updated' : 'pattern:deduplicated',
          'completed',
          pattern.evidence.map((item) => item.sourceId).filter((id): id is string => Boolean(id)),
          [result.record.id],
        );
      }
    }
    trace(
      'pattern',
      'detect',
      detectedPatterns.length === 0 ? 'empty' : 'completed',
      memoryNodes.map((memory) => memory.id),
      persistedPatterns.map((pattern) => pattern.id)
    );

    const interestGraph = buildInterestGraph({
      userId: `${userId}:${companionId}`,
      memoryNodes,
      patterns: persistedPatterns,
      discoveries: discoveryHistory,
      feedback: feedbackHistory
    });
    this.db.upsertInterestGraph(interestGraph);
    trace(
      'memory',
      'build-interest-graph',
      interestGraph.nodes.length === 0 ? 'empty' : 'completed',
      [...memoryNodes.map((memory) => memory.id), ...persistedPatterns.map((pattern) => pattern.id)],
      [...interestGraph.nodes.map((node) => node.id), ...interestGraph.edges.map((edge) => edge.id)]
    );

    const curiosityTargets = generateCuriosityTargets({
      userId,
      companionId,
      characterState,
      characterProfile,
      memoryNodes,
      journeySummaries: journeyMilestones.map((milestone) => milestone.summary ?? milestone.title),
      patterns: persistedPatterns,
      interestGraph,
      recentFeedback: feedbackHistory,
      generatedAt: evaluatedAt,
    });
    const persistedCuriosityTargets = [];
    for (const target of curiosityTargets) {
      const result = this.db.upsertCuriosityTarget(target, evaluatedAt);
      if (result.outcome !== 'cooldown') persistedCuriosityTargets.push(result.record);
      if (result.outcome !== 'created') {
        trace(
          'curiosity',
          result.outcome === 'reopened'
            ? 'curiosity:reopened'
            : result.outcome === 'cooldown'
              ? 'curiosity:cooldown'
              : 'curiosity:deduplicated',
          result.outcome === 'cooldown' ? 'skipped' : 'completed',
          target.generatedFromIds ?? [],
          [result.record.id],
          result.outcome === 'cooldown' ? { skipReason: 'cooldown_active' } : {},
        );
      }
    }
    if (requestedDiscoveryBase) {
      const topic = requestedDiscoveryBase.scope === 'domain'
        ? requestedDiscoveryBase.locator
        : requestedDiscoveryBase.scope === 'page' || requestedDiscoveryBase.scope === 'feed'
          ? new URL(requestedDiscoveryBase.locator).hostname
          : requestedDiscoveryBase.locator;
      const forcedTarget: CuriosityTarget = {
        id: createSemanticFingerprint('run_now_curiosity', [cycleId, requestedDiscoveryBase.id]),
        userId,
        companionId,
        topic,
        topicFingerprint: createTopicFingerprint([topic]),
        sourceFingerprint: requestedDiscoveryBase.id,
        generatedFromIds: [requestedDiscoveryBase.id],
        description: `Run the selected Discovery Source: ${requestedDiscoveryBase.locator}`,
        source: 'character_trigger',
        explorationType: 'deepening',
        priority: 1,
        confidence: 1,
        reason: 'The user asked to run this Discovery Source now.',
        expectedValue: `Check ${requestedDiscoveryBase.locator} for reliable new or materially updated information.`,
        status: 'open',
        createdAt: evaluatedAt,
        updatedAt: evaluatedAt,
      };
      persistedCuriosityTargets.unshift(
        this.db.upsertCuriosityTarget(forcedTarget, evaluatedAt).record,
      );
    }
    trace(
      'curiosity',
      'generate-targets',
      curiosityTargets.length === 0 ? 'empty' : 'completed',
      [...memoryNodes.map((memory) => memory.id), ...persistedPatterns.map((pattern) => pattern.id)],
      persistedCuriosityTargets.map((target) => target.id)
    );
    this.db.markMemoriesProcessed(memoryNodes.map((memory) => memory.id), evaluatedAt);

    const rankedCuriosityTargets = persistedCuriosityTargets
      .filter((target) => target.status === 'open' || target.status === 'exploring')
      .sort((left, right) => right.priority - left.priority);
    const topicSaturationHistory = discoveryHistory.map((discovery) => ({
      topicFingerprint: createTopicFingerprint(
        discovery.tags.length ? discovery.tags : [discovery.title],
      ) ?? createSemanticFingerprint('discovery_topic', [discovery.title]),
      eventKey: discovery.fingerprint,
      disposition: discovery.status === 'saved'
        ? 'saved' as const
        : discovery.status === 'rejected' || discovery.status === 'dismissed'
          ? 'ignored' as const
          : 'presented' as const,
      occurredAt: discovery.updatedAt ?? discovery.createdAt,
    }));
    let selectedCuriosityTarget: typeof rankedCuriosityTargets[number] | undefined = requestedDiscoveryBase
      ? rankedCuriosityTargets.find((target) => target.sourceFingerprint === requestedDiscoveryBase.id)
      : undefined;
    let selectedTopicSaturation: ReturnType<typeof evaluateTopicSaturation> | undefined;
    let savedTopicProbe: {
      target: typeof rankedCuriosityTargets[number];
      saturation: ReturnType<typeof evaluateTopicSaturation>;
    } | undefined;
    let saturationStopReason: ReturnType<typeof evaluateTopicSaturation>['reason'];
    for (const target of selectedCuriosityTarget ? [] : rankedCuriosityTargets) {
      const targetTopicFingerprint = createTopicFingerprint([target.topic])
        ?? createSemanticFingerprint('discovery_topic', [target.topic]);
      const targetSaturation = evaluateTopicSaturation({
        topicFingerprint: targetTopicFingerprint,
        history: topicSaturationHistory,
        now: evaluatedAt,
      });
      if (!targetSaturation.blocked) {
        selectedCuriosityTarget = target;
        selectedTopicSaturation = targetSaturation;
        break;
      }
      saturationStopReason ??= targetSaturation.reason;
      if (targetSaturation.reason === 'saved_requires_material_update' && !savedTopicProbe) {
        savedTopicProbe = { target, saturation: targetSaturation };
      }
    }
    // A saved topic may be researched only as a bounded material-update probe.
    // Candidate-level saturation must still reject anything that is not a
    // verified material update.
    const requiresMaterialUpdate = !requestedDiscoveryBase
      && !selectedCuriosityTarget
      && Boolean(savedTopicProbe);
    if (!selectedCuriosityTarget && savedTopicProbe) {
      selectedCuriosityTarget = savedTopicProbe.target;
      selectedTopicSaturation = savedTopicProbe.saturation;
    }
    let bootstrapCuriosity = false;
    if (
      !selectedCuriosityTarget
      && rankedCuriosityTargets.length === 0
      && !savedTopicProbe
      && (input.trigger === 'manual' || input.trigger === undefined)
    ) {
      const companion = this.db.getCompanion(companionId);
      if (companion) {
        this.syncPersonalityDiscoverySeed(companion);
        const profile = this.readDiscoveryProfile(companionId);
        if (profile?.interests.length) {
          const topic = buildBootstrapCuriosityTopic(profile);
          bootstrapCuriosity = true;
          selectedCuriosityTarget = {
            id: createId('curiosity'),
            userId,
            companionId,
            topic,
            description: topic,
            source: 'character_trigger',
            explorationType: 'practical',
            priority: 0.5 as never,
            confidence: 0.5 as never,
            reason: 'Bootstrap curiosity from Discovery Profile interests.',
            sourceFingerprint: createSemanticFingerprint('bootstrap_curiosity', [companionId, profile.personalityRevision]),
            expectedValue: `Explore public ideas related to ${profile.interests.slice(0, 3).join(', ')}.`,
            status: 'exploring',
            createdAt: evaluatedAt,
            updatedAt: evaluatedAt,
          } as typeof rankedCuriosityTargets[number];
        }
      }
    }
    if (selectedCuriosityTarget && !bootstrapCuriosity) {
      this.db.setCuriosityTargetStatus(selectedCuriosityTarget.id, 'exploring', evaluatedAt);
    }
    const companionName = this.requireCompanionName(companionId);
    let cycle = this.db.insertExplorationCycle({
      id: cycleId,
      userId,
      companionId,
      trigger,
      state: 'curious',
      curiosityTargetIds: persistedCuriosityTargets.map((target) => target.id),
      selectedCuriosityTargetId: selectedCuriosityTarget?.id,
      discoveryCandidateIds: [],
      insightIds: [],
      startedAt: this.now().toISOString()
    });
    this.recordExplorationEvent(cycle, 'curious', selectedCuriosityTarget?.reason ?? `${companionName} became curious.`);
    this.setAutonomyCharacterState(companionId, 'thinking', 'reviewing_memory');

    if (!selectedCuriosityTarget) {
      for (const [engine, operation] of [
        ['discovery', 'plan'],
        ['discovery', 'provider-search'],
        ['insight', 'generate'],
        ['decision', 'evaluate'],
        ['presentation', 'enqueue']
      ] as const) {
        trace(engine, operation, 'skipped', [], [], {
          skipReason: saturationStopReason ?? 'no_curiosity_target',
        });
      }
      cycle = this.saveCycleState(cycle, 'returning');
      this.setAutonomyCharacterState(companionId, 'returning', 'sharing_discovery');
      cycle = this.saveCycleState(cycle, 'reflecting', { completedAt: this.now().toISOString() }, {
        message: saturationStopReason
          ? 'I switched away from a saturated topic, but no eligible direction remained.'
          : 'I could not find enough reliable information this time.',
        metadata: {
          outcome: 'empty',
          ...(saturationStopReason ? { saturationReason: saturationStopReason } : {}),
        },
      });
      this.companionRuntime.settleDiscoveryPresentation(companionId);
      return { cycle, curiosityTargets: persistedCuriosityTargets, discoveryCandidates: [], insights: [] };
    }

    const topicFingerprint = createTopicFingerprint([selectedCuriosityTarget.topic])
      ?? createSemanticFingerprint('discovery_topic', [selectedCuriosityTarget.topic]);
    const saturation = selectedTopicSaturation
      ?? evaluateTopicSaturation({
        topicFingerprint,
        history: topicSaturationHistory,
        now: evaluatedAt,
      });
    const companionProfile = this.db.getCompanion(companionId);
    const personalityBias = companionProfile
      ? {
        core: (companionProfile.personality.diligence - 0.5) * 0.08,
        adjacent: (companionProfile.personality.curiosity - 0.5) * 0.05,
        wildcard: (companionProfile.personality.playfulness - 0.5) * 0.08,
        challenge: (companionProfile.personality.confidence - 0.5) * 0.05,
      }
      : undefined;
    const modeWeights = adjustDiscoveryModeWeights({
      base: saturation.modeWeights,
      personalityBias,
      saturationPenalty: saturation.penalty,
    });
    const discoveryMode = requiresMaterialUpdate
      ? 'core'
      : selectDiscoveryMode(this.random(), modeWeights);
    const adaptiveIntent = createAdaptiveExplorationIntent({
      mode: discoveryMode,
      topic: selectedCuriosityTarget.topic,
      expectedValue: selectedCuriosityTarget.expectedValue,
      freshness: discoveryMode === 'core' ? 'recent' : 'any',
      trustRequirement: discoveryMode === 'wildcard' ? 'open' : 'corroborated',
      languages: [this.getAiSettings().replyLanguage === 'zh-CN' ? 'zh-CN' : 'en'],
      searchTasks: [
        discoveryMode === 'core'
          ? `${selectedCuriosityTarget.topic} recent developments evidence`
          : discoveryMode === 'adjacent'
            ? `${selectedCuriosityTarget.topic} adjacent approaches`
            : discoveryMode === 'wildcard'
              ? `${selectedCuriosityTarget.topic} unexpected cross-domain ideas`
              : `${selectedCuriosityTarget.topic} credible contrarian evidence`,
      ],
      createdAt: evaluatedAt,
    });
    for (const persistedBase of this.db.listDiscoveryBases(companionId, 'trial', 32)) {
      const transitioned = transitionDiscoveryBase({
        base: {
          ...persistedBase,
          origin: persistedBase.origin as DiscoveryBase['origin'],
        },
        feedback: 'none',
        now: evaluatedAt,
      });
      if (transitioned.state !== persistedBase.state) {
        this.db.upsertDiscoveryBase(transitioned);
      }
    }
    const executableDiscoveryBases = this.db.listDiscoveryBasesForExecution(companionId, 32).map((base) => ({
        ...base,
        origin: base.origin as DiscoveryBase['origin'],
      }));
    const prioritizedDiscoveryBase = prioritizedDiscoveryBaseId
      ? executableDiscoveryBases.find((base) => base.id === prioritizedDiscoveryBaseId)
      : undefined;
    if (prioritizedDiscoveryBaseId && !prioritizedDiscoveryBase) {
      throw new Error('DISCOVERY_SOURCE_NOT_RUNNABLE');
    }
    const scheduledDiscoveryBases = selectDiscoveryBasesForExecution({
      bases: executableDiscoveryBases.filter((base) => base.id !== prioritizedDiscoveryBaseId),
      intent: adaptiveIntent,
      limit: prioritizedDiscoveryBase ? 2 : 3,
    });
    const selectedDiscoveryBases = prioritizedDiscoveryBase
      ? [prioritizedDiscoveryBase, ...scheduledDiscoveryBases]
      : scheduledDiscoveryBases;
    const discoveryInspection: DiscoveryInspectionRecord = {
      cycleId,
      companionId,
      mode: discoveryMode,
      intentQuestion: adaptiveIntent.question,
      expectedValue: adaptiveIntent.expectedValue,
      freshness: adaptiveIntent.freshness,
      trustRequirement: adaptiveIntent.trustRequirement,
      languages: [...adaptiveIntent.languages],
      regions: [...adaptiveIntent.regions],
      contextCount: discoveryContext.count,
      connectorCapabilities: this.researchOrchestrator.getCapabilities().map((capability) => ({
        id: capability.id,
        mode: capability.mode,
        available: capability.available,
      })),
      selectedBases: selectedDiscoveryBases.map((base) => ({
          id: base.id,
          connectorId: base.connectorId,
          state: base.state,
          locator: base.locator,
        })),
      executedBases: [],
      candidatesAccepted: [],
      candidatesRejected: [],
      dedupHits: {},
      duplicateCount: 0,
      revivalCount: 0,
      materialUpdateCount: 0,
      newCount: 0,
      saturationPenalty: saturation.penalty,
      createdAt: evaluatedAt,
    };
    this.latestDiscoveryInspections.set(companionId, discoveryInspection);

    cycle = this.saveCycleState(cycle, 'planning');
    this.setAutonomyCharacterState(companionId, 'discovering', 'sharing_discovery');

    const discoveryProfile = companionProfile
      ? (this.readDiscoveryProfile(companionId) ?? (
        this.syncPersonalityDiscoverySeed(companionProfile),
        this.readDiscoveryProfile(companionId)
      ))
      : null;
    const dynamicPlan = companionProfile
      ? await this.planDynamicDiscoveryResearch({
        companion: companionProfile,
        curiosityTopic: selectedCuriosityTarget.topic,
        profile: discoveryProfile,
        forcedPlatformId,
      })
      : {
        plannerMode: 'unavailable' as const,
        plannerReason: 'Companion profile missing',
        tasks: [],
        skippedChannels: [],
      };
    discoveryInspection.plannerMode = dynamicPlan.plannerMode;
    discoveryInspection.plannerReason = dynamicPlan.plannerReason;
    discoveryInspection.enabledChannels = this.listDiscoveryChannels(companionId)
      .filter((channel) => channel.state === 'enabled')
      .map((channel) => channel.platformId);
    discoveryInspection.selectedChannels = dynamicPlan.tasks.map((task) => ({
      platformId: task.platformId,
      query: task.query,
      rationale: task.rationale,
    }));
    discoveryInspection.skippedChannels = dynamicPlan.skippedChannels;
    if (dynamicPlan.tasks.length > 0) {
      const now = this.now().toISOString();
      const channels = this.listDiscoveryChannels(companionId).map((channel) => {
        const task = dynamicPlan.tasks.find((entry) => entry.platformId === channel.platformId);
        if (!task) return channel;
        return {
          ...channel,
          lastUsedAt: now,
          lastPlanningReason: task.rationale,
          updatedAt: now,
        };
      });
      this.saveDiscoveryChannels(companionId, channels);
    }

    cycle = this.saveCycleState(cycle, 'exploring');
    const research = await this.researchOrchestrator.run({
      userId,
      companionId,
      cycleId,
      curiosityTarget: selectedCuriosityTarget,
      explorationIntent: adaptiveIntent,
      discoveryBases: selectedDiscoveryBases,
      dynamicPlatformTasks: dynamicPlan.tasks,
      seenCanonicalUrls: new Set(discoveryHistory.map((discovery) => discovery.canonicalUrl ?? discovery.url).filter(Boolean) as string[]),
      materialUpdateProbe: requiresMaterialUpdate,
      onTrace: (event) => trace(
        'research',
        event.operation,
        event.status,
        event.inputRefs ?? [],
        event.outputRefs ?? [],
        {
          providerMode: event.providerMode,
          skipReason: event.skipReason,
          error: event.error
        }
      ),
      onDebugEvent: (event) => this.pushDeveloperDebugEvent({
        ...event,
        companionId,
        cycleId,
        correlationId,
      }),
    });
    const executedBaseIds = new Set(research.usedBaseIds);
    discoveryInspection.executedBases = selectedDiscoveryBases
      .filter((base) => executedBaseIds.has(base.id))
      .map((base) => ({
        id: base.id,
        connectorId: base.connectorId,
        state: base.state,
        locator: base.locator,
      }));
    for (const base of selectedDiscoveryBases) {
      if (!executedBaseIds.has(base.id)) continue;
      this.db.upsertDiscoveryBase({
        ...base,
        lastCheckedAt: evaluatedAt,
        updatedAt: evaluatedAt,
      });
    }
    this.db.insertResearchIntent(research.intent);
    this.db.insertResearchPlan(research.plan);
    for (const record of research.searchRecords) this.db.insertResearchSearchRecord({
      id: record.id,
      userId,
      companionId,
      cycleId,
      researchIntentId: research.intent.id,
      researchPlanId: research.plan.id,
      query: record.query,
      provider: record.provider,
      mode: record.providerMode as 'live' | 'fixture' | 'unavailable',
      status: record.status,
      resultCount: record.resultCount,
      errorCode: record.error,
      createdAt: this.now().toISOString()
    });
    for (const evidence of research.evidence) {
      this.db.insertWebPageEvidence(evidence);
      if (evidence.sourceType === 'rss') {
        const existingBases = this.db.listDiscoveryBases(companionId, undefined, 32);
        const alreadyKnown = existingBases.some((base) =>
          base.connectorId === 'rss' && base.scope === 'feed' && base.locator === evidence.canonicalUrl
        );
        const trialCheck = canStartDiscoveryTrial({
          companionId,
          bases: existingBases.map((base) => ({
            ...base,
            origin: base.origin as DiscoveryBase['origin'],
          })),
          now: evaluatedAt,
        });
        if (!alreadyKnown && trialCheck.allowed) {
          const trial = startDiscoveryTrial({
            base: {
              id: createSemanticFingerprint('discovery_base', [companionId, 'rss', evidence.canonicalUrl]),
              companionId,
              connectorId: 'rss',
              scope: 'feed',
              locator: evidence.canonicalUrl,
              data: { title: evidence.title, contentType: evidence.contentType },
              origin: 'feed_detection',
              discoveredAt: evaluatedAt,
            },
            now: evaluatedAt,
          });
          this.db.upsertDiscoveryBase(trial);
        }
      }
    }
    cycle = this.saveCycleState(cycle, 'planning', {
      researchIntentId: research.intent.id,
      researchPlanId: research.plan.id
    });
    const discoveryCandidates: DiscoveryCandidate[] = [];
    const persistedSeen = this.db.listDiscoverySeenIdentities(companionId, 1_000);
    const durableTargetCache = new Map<string, boolean>();
    const durableSeen = persistedSeen.filter((seen) => {
      if (!seen.discoveryId) return false;
      const cached = durableTargetCache.get(seen.discoveryId);
      if (cached !== undefined) return cached;
      const durableCandidate = this.db.getDiscoveryCandidate(seen.discoveryId);
      const durableDiscovery = durableCandidate ? undefined : this.db.getDiscovery(seen.discoveryId);
      const durable = durableCandidate?.companionId === companionId
        || durableDiscovery?.companionId === companionId;
      durableTargetCache.set(seen.discoveryId, durable);
      if (!durable) this.db.clearDiscoverySeenIdentityTarget(seen.id, companionId);
      return durable;
    });
    for (const candidate of research.candidates) {
      let rawEvidence: Record<string, unknown> = {};
      try {
        rawEvidence = candidate.rawEvidence ? JSON.parse(candidate.rawEvidence) as Record<string, unknown> : {};
      } catch {
        rawEvidence = {};
      }
      const pageEvidence = research.evidence.find((evidence) =>
        evidence.canonicalUrl === candidate.sourceUrl || evidence.url === candidate.sourceUrl
      );
      const materialFacts = candidate.summary
        .split(/[.!?。！？]+/)
        .map((fact) => fact.trim())
        .filter((fact) => fact.length >= 12)
        .slice(0, 5);
      const identityCandidate = {
        connectorId: candidate.sourceName,
        externalId: typeof rawEvidence.externalId === 'string' ? rawEvidence.externalId : undefined,
        canonicalUrl: candidate.sourceUrl,
        contentHash: pageEvidence?.contentHash
          ?? (typeof rawEvidence.contentHash === 'string' ? rawEvidence.contentHash : undefined),
        eventKey: typeof rawEvidence.eventKey === 'string' ? rawEvidence.eventKey : undefined,
        title: candidate.title,
        topics: [selectedCuriosityTarget.topic],
        publishedAt: pageEvidence?.publishedAt
          ?? (typeof rawEvidence.publishedAt === 'string' ? rawEvidence.publishedAt : undefined),
        observedAt: candidate.collectedAt,
        materialFacts,
        version: typeof rawEvidence.version === 'string' ? rawEvidence.version : undefined,
      };
      const identities = createDiscoverySeenIdentities(identityCandidate);
      const existing = findSeenDiscoveryCandidates({
        candidateIdentities: identities,
        topicFingerprint,
        persisted: durableSeen,
      });
      const dedup = classifyDiscoveryAgainstSeen({
        candidate: identityCandidate,
        existing,
      });
      if (dedup.layer) {
        discoveryInspection.dedupHits[dedup.layer] =
          (discoveryInspection.dedupHits[dedup.layer] ?? 0) + 1;
      }
      if (dedup.outcome === 'duplicate') discoveryInspection.duplicateCount += 1;
      else if (dedup.outcome === 'revival') discoveryInspection.revivalCount += 1;
      else if (dedup.outcome === 'material_update') discoveryInspection.materialUpdateCount += 1;
      else discoveryInspection.newCount += 1;

      const candidateSaturation = evaluateTopicSaturation({
        topicFingerprint,
        eventKey: identityCandidate.eventKey ?? candidate.fingerprint,
        materialUpdate: dedup.outcome === 'material_update',
        history: topicSaturationHistory,
        now: evaluatedAt,
      });
      const accepted = dedup.outcome !== 'duplicate'
        && !candidateSaturation.blocked
        && (!requiresMaterialUpdate || dedup.outcome === 'material_update')
        && discoveryCandidates.length < 3;
      const durableIdentityTargetId = accepted ? candidate.id : dedup.existingDiscoveryId;
      if (accepted) {
        // Persist the durable artifact before any Seen identity can point at it.
        this.db.insertDiscoveryCandidate(candidate);
        discoveryCandidates.push(candidate);
        discoveryInspection.candidatesAccepted.push(candidate.id);
      } else {
        discoveryInspection.candidatesRejected.push({
          candidateId: candidate.id,
          reason: dedup.outcome === 'duplicate'
            ? `${dedup.reason}${dedup.attachEvidenceOnly ? ':evidence_attached' : ''}`
            : candidateSaturation.reason
              ?? (requiresMaterialUpdate ? 'saved_requires_material_update' : 'candidate_limit_reached'),
        });
      }
      // A cap- or saturation-rejected new artifact remains eligible next cycle.
      // Genuine duplicates may refresh aliases/evidence, but only against an
      // already durable Candidate or final Discovery target.
      if (durableIdentityTargetId && (accepted || dedup.outcome === 'duplicate')) {
        for (const identity of identities) {
          const persistedIdentity = this.db.upsertDiscoverySeenIdentity({
            id: createSemanticFingerprint('discovery_seen_identity', [
              companionId,
              identity.type,
              identity.hash,
            ]),
            companionId,
            type: identity.type,
            hash: identity.hash,
            discoveryId: durableIdentityTargetId,
            firstSeenAt: candidate.collectedAt,
            lastSeenAt: candidate.collectedAt,
            metadata: {
              normalizedValue: identity.normalizedValue,
              contentHash: identityCandidate.contentHash,
              materialFacts,
              publishedAt: identityCandidate.publishedAt,
              version: identityCandidate.version,
              topicFingerprint,
              outcome: dedup.outcome,
              attachEvidenceOnly: dedup.attachEvidenceOnly,
              durableTargetKind: accepted ? 'candidate' : 'existing',
            },
          });
          const existingSeenIndex = durableSeen.findIndex(
            (seen) => seen.type === persistedIdentity.type && seen.hash === persistedIdentity.hash
          );
          if (existingSeenIndex >= 0) durableSeen[existingSeenIndex] = persistedIdentity;
          else durableSeen.push(persistedIdentity);
        }
      }
    }
    trace(
      'discovery',
      'collect-candidates',
      discoveryCandidates.length === 0 ? 'empty' : 'completed',
      [research.plan.id],
      discoveryCandidates.map((candidate) => candidate.id)
    );

    cycle = this.saveCycleState(cycle, 'collecting', {
      discoveryCandidateIds: discoveryCandidates.map((candidate) => candidate.id)
    });

    if (discoveryCandidates.length === 0) {
      trace('insight', 'generate', 'skipped', [], [], { skipReason: 'no_valid_discoveries' });
      trace('decision', 'evaluate', 'skipped', [], [], { skipReason: 'no_insight' });
      trace('presentation', 'enqueue', 'skipped', [], [], { skipReason: 'no_decision' });
      this.db.setCuriosityTargetStatus(selectedCuriosityTarget.id, 'completed', this.runtimeClock.now().toISOString());
      cycle = this.saveCycleState(cycle, 'returning');
      this.setAutonomyCharacterState(companionId, 'returning', 'sharing_discovery');
      const noProvider = research.plan.outcome?.stopReason === 'no_compatible_capability'
        || research.plan.outcome?.stopReason === 'RESEARCH_NO_DISCOVERY_PROVIDER';
      cycle = this.saveCycleState(cycle, 'reflecting', { completedAt: this.now().toISOString() }, {
        message: noProvider
          ? 'No discovery provider is currently available.'
          : 'I could not find enough reliable information this time.',
        metadata: { outcome: noProvider ? 'no_provider' : 'empty' },
      });
      this.companionRuntime.settleDiscoveryPresentation(companionId);
      return {
        cycle,
        curiosityTargets: persistedCuriosityTargets,
        selectedCuriosityTarget,
        researchIntent: research.intent,
        researchPlan: research.plan,
        webPageEvidence: research.evidence,
        discoveryCandidates,
        insights: []
      };
    }

    cycle = this.saveCycleState(cycle, 'synthesizing');

    const synthesisInput: SynthesizeDiscoveryInsightInput = {
      evidence: research.evidence.map((e) => ({
        id: e.id,
        title: e.title,
        canonicalUrl: e.canonicalUrl,
        domain: e.domain,
        excerpt: e.excerpt,
        extractedText: e.extractedText,
        publishedAt: e.publishedAt,
        contentHash: e.contentHash,
      })),
      candidates: discoveryCandidates,
      context: {
        userId,
        companionId,
        characterState,
        characterProfile,
        memoryNodes,
        patterns: detectedPatterns,
        interestGraph,
        curiosityTarget: selectedCuriosityTarget,
      },
    };

    const hasAi = Boolean(this.aiProvider) || this.getAiSettings().apiKeyConfigured;
    const synthesisResult = await synthesizeDiscoveryInsight(
      synthesisInput,
      hasAi
        ? async (prompt) => {
            const { content } = await this.sendToAi({
              messages: [{ role: 'user', content: prompt }],
              channel: 'discovery_evidence_synthesis',
              source: 'evidence_synthesis',
              companionId,
              correlationId,
              cycleId,
            });
            return content;
          }
        : undefined,
    );

    this.pushDeveloperDebugEvent({
      kind: 'evidence_synthesis',
      operation: 'discovery_evidence_synthesis',
      status: synthesisResult.usedFallback ? 'fallback' : 'completed',
      companionId,
      correlationId,
      cycleId,
      summary: synthesisResult.usedFallback ? 'Used deterministic fallback' : 'AI synthesis succeeded',
      payload: {
        evidenceCount: synthesisResult.debugMetadata?.evidenceCount,
        inputCharacterCount: synthesisResult.debugMetadata?.inputCharacterCount,
        validated: synthesisResult.debugMetadata?.validated,
        rejectionReason: synthesisResult.debugMetadata?.rejectionReason,
        usedFallback: synthesisResult.usedFallback,
        insightId: synthesisResult.insight.id,
      },
    });

    const insights = [synthesisResult.insight];
    for (const insight of insights) {
      this.db.insertCompanionInsight(toPersistedCompanionInsight(insight, companionId, selectedCuriosityTarget.reason, discoveryCandidates.map((candidate) => candidate.id)));
    }
    trace(
      'insight',
      'generate',
      insights.length === 0 ? 'empty' : 'completed',
      discoveryCandidates.map((candidate) => candidate.id),
      insights.map((insight) => insight.id)
    );
    const selectedInsight = selectPrimaryInsight(insights);
    cycle = this.saveCycleState(cycle, 'returning', {
      insightIds: insights.map((insight) => insight.id),
      selectedInsightId: selectedInsight?.id
    });
    this.setAutonomyCharacterState(companionId, 'returning', 'sharing_discovery');

    cycle = this.saveCycleState(cycle, 'sharing', { completedAt: this.runtimeClock.now().toISOString() });
    if (selectedInsight) {
      const createdAt = this.now().toISOString();
      const sourceCandidate = [...discoveryCandidates].sort(
        (left, right) =>
          right.relevanceScore + right.noveltyScore + right.usefulnessScore
          - (left.relevanceScore + left.noveltyScore + left.usefulnessScore)
      )[0];
      let sourceRaw: Record<string, unknown> = {};
      try {
        sourceRaw = sourceCandidate?.rawEvidence
          ? JSON.parse(sourceCandidate.rawEvidence) as Record<string, unknown>
          : {};
      } catch {
        sourceRaw = {};
      }
      const source: DiscoverySource = sourceCandidate?.sourceName === 'github'
        || sourceCandidate?.sourceName === 'rss'
        || sourceCandidate?.sourceName === 'youtube'
        || sourceCandidate?.sourceName === 'reddit'
        || sourceCandidate?.sourceName === 'hackernews'
        ? sourceCandidate.sourceName
        : sourceCandidate?.sourceType === 'github'
          ? 'github'
          : sourceCandidate?.sourceType === 'video'
            ? 'youtube'
            : sourceCandidate?.sourceType === 'community_discussion'
              ? 'community'
              : 'internet';
      const sourceEvidence = sourceCandidate?.evidenceIds?.length
        ? research.evidence.find((evidence) => sourceCandidate.evidenceIds?.includes(evidence.id))
        : undefined;
      const discoveryPayload: Discovery = {
        id: selectedInsight.id,
        source,
        externalId: typeof sourceRaw.externalId === 'string' ? sourceRaw.externalId : undefined,
        title: selectedInsight.title,
        summary: selectedInsight.summary,
        url: sourceCandidate?.sourceUrl,
        canonicalUrl: normalizeDiscoveryUrl(sourceCandidate?.sourceUrl),
        tags: [selectedCuriosityTarget.topic],
        publishedAt: sourceEvidence?.publishedAt
          ?? (typeof sourceRaw.publishedAt === 'string' ? sourceRaw.publishedAt : undefined),
        raw: {
          candidateId: sourceCandidate?.id,
          candidateIds: discoveryCandidates.map((candidate) => candidate.id),
          evidenceIds: sourceCandidate?.evidenceIds ?? [],
          researchPlanId: sourceCandidate?.researchPlanId,
          sourceName: sourceCandidate?.sourceName,
          sourceType: sourceCandidate?.sourceType,
          contentHash: typeof sourceRaw.contentHash === 'string' ? sourceRaw.contentHash : undefined,
          version: typeof sourceRaw.version === 'string' ? sourceRaw.version : undefined,
          eventKey: typeof sourceRaw.eventKey === 'string' ? sourceRaw.eventKey : undefined,
          discoveryBaseIds: Array.isArray(sourceRaw.discoveryBaseIds)
            ? sourceRaw.discoveryBaseIds
            : [],
        },
        fingerprint: sourceCandidate?.fingerprint,
        userInterestScore: 0.5,
        userHistoryScore: 0.5,
        characterExpertiseScore: 0.5,
        noveltyScore: selectedInsight.novelty,
        usefulnessScore: selectedInsight.importance,
        finalScore: selectedInsight.confidence,
        companionId,
        cycleId: cycle.id,
        status: 'eligible',
        eligibleAt: createdAt,
        createdAt,
        updatedAt: createdAt
      };
      this.db.insertDiscovery(discoveryPayload);
      if (sourceCandidate) {
        for (const seen of this.db.listDiscoverySeenIdentities(companionId, 1_000)) {
          if (seen.discoveryId !== sourceCandidate.id) continue;
          this.db.upsertDiscoverySeenIdentity({
            ...seen,
            discoveryId: discoveryPayload.id,
            metadata: {
              ...seen.metadata,
              durableTargetKind: 'discovery',
              candidateId: sourceCandidate.id,
              finalDiscoveryId: discoveryPayload.id,
            },
          });
        }
      }
      const decision = this.requestDiscoveryPresentation(discoveryPayload);
      if (decision.reason === 'discovery_companion_mismatch') {
        this.companionRuntime.settleDiscoveryPresentation(companionId);
      }
      trace(
        'decision',
        'evaluate',
        'completed',
        [selectedInsight.id],
        [decision.id]
      );
      trace(
        'presentation',
        'enqueue',
        this.companionRuntime.shouldPresentNow(decision) || decision.timing === 'next_idle'
          ? 'completed'
          : 'skipped',
        [decision.id],
        this.companionRuntime.shouldPresentNow(decision) || decision.timing === 'next_idle'
          ? [discoveryPayload.id]
          : [],
        this.companionRuntime.shouldPresentNow(decision) || decision.timing === 'next_idle'
          ? {}
          : { skipReason: decision.reason }
      );
      this.emitFoundationEvent('DiscoveryPresentationEvaluated', 'decision', {
        discoveryId: selectedInsight.id,
        cycleId: cycle.id,
        gated: !this.companionRuntime.shouldPresentNow(decision),
      });
    } else {
      trace('decision', 'evaluate', 'skipped', [], [], { skipReason: 'no_selected_insight' });
      trace('presentation', 'enqueue', 'skipped', [], [], { skipReason: 'no_decision' });
    }
    this.db.setCuriosityTargetStatus(selectedCuriosityTarget.id, 'completed', this.runtimeClock.now().toISOString());

    return {
      cycle,
      curiosityTargets: persistedCuriosityTargets,
      selectedCuriosityTarget,
      researchIntent: research.intent,
      researchPlan: research.plan,
      webPageEvidence: research.evidence,
      discoveryCandidates,
      insights,
      selectedInsight
    };
  }

  private async submitDiscoveryFeedback(input: SubmitDiscoveryFeedbackInput): Promise<DiscoveryFeedback> {
    const cycle = this.db.getExplorationCycle(input.cycleId);
    if (!cycle) throw new Error(`Exploration cycle not found: ${input.cycleId}`);
    const cycleTraces = this.db.listEngineTraces({ cycleId: cycle.id, limit: 1_000 });
    const correlationId = cycleTraces[0]?.correlationId ?? createId('corr');
    let causationId = cycleTraces.at(-1)?.id;
    const trace = (
      engine: string,
      operation: string,
      status: EngineTraceStatus,
      inputRefs: string[],
      outputRefs: string[],
      skipReason?: string
    ) => {
      const recorded = this.recordEngineTrace({
        correlationId,
        causationId,
        cycleId: cycle.id,
        companionId: cycle.companionId,
        engine,
        operation,
        status,
        inputRefs,
        outputRefs,
        skipReason
      });
      causationId = recorded.id;
    };
    const insightId = input.insightId ?? cycle.selectedInsightId;
    const persistedInsight = insightId ? this.db.getCompanionInsight(insightId) : undefined;
    if (
      insightId &&
      (
        !persistedInsight ||
        persistedInsight.companionId !== cycle.companionId ||
        !cycle.insightIds.includes(insightId)
      )
    ) {
      throw new Error(`Insight ${insightId} does not belong to exploration cycle ${cycle.id}`);
    }
    const companionName = this.requireCompanionName(cycle.companionId);
    const existingFeedback = this.db.listDiscoveryFeedback(1_000, undefined, cycle.companionId).find((item) =>
      item.cycleId === cycle.id &&
      item.insightId === insightId &&
      item.discoveryCandidateId === input.discoveryCandidateId &&
      item.value === input.value
    );
    if (existingFeedback) return existingFeedback;

    const feedback: DiscoveryFeedback = this.db.insertDiscoveryFeedback({
      id: createId('feedback'),
      userId: cycle.userId,
      companionId: cycle.companionId,
      cycleId: cycle.id,
      insightId,
      discoveryCandidateId: input.discoveryCandidateId,
      value: input.value,
      note: input.note,
      feedbackDomain: this.companionRuntime.feedbackDomainForValue(input.value),
      createdAt: this.runtimeClock.now().toISOString()
    });
    trace('feedback', 'record', 'completed', [cycle.id, ...(insightId ? [insightId] : [])], [feedback.id]);
    const candidateIdsForBaseFeedback = input.discoveryCandidateId
      ? [input.discoveryCandidateId]
      : persistedInsight?.supportingCandidateIds ?? [];
    const discoveryBaseIds = new Set<string>();
    for (const candidateId of candidateIdsForBaseFeedback) {
      const candidate = this.db.getDiscoveryCandidate(candidateId);
      if (!candidate?.rawEvidence) continue;
      try {
        const raw = JSON.parse(candidate.rawEvidence) as Record<string, unknown>;
        if (!Array.isArray(raw.discoveryBaseIds)) continue;
        for (const baseId of raw.discoveryBaseIds) {
          if (typeof baseId === 'string') discoveryBaseIds.add(baseId);
        }
      } catch {
        // Invalid legacy evidence has no durable base lineage to update.
      }
    }
    const baseTransitionFeedback = input.value === 'saved'
      ? 'saved' as const
      : input.value === 'opened_evidence' || input.value === 'talk_about_this'
        ? 'useful' as const
        : input.value === 'mute_source'
          ? 'mute' as const
          : input.value === 'block_source'
            ? 'block' as const
          : 'none' as const;
    for (const baseId of discoveryBaseIds) {
      const base = this.db.listDiscoveryBases(cycle.companionId, undefined, 32)
        .find((item) => item.id === baseId);
      if (!base) continue;
      this.db.insertDiscoveryBaseFeedback({
        id: createId('discovery_base_feedback'),
        companionId: cycle.companionId,
        discoveryBaseId: base.id,
        value: input.value,
        note: input.note,
        createdAt: feedback.createdAt,
      });
      const lowQualityFeedbackCount = this.db.listDiscoveryBaseFeedback(
        cycle.companionId,
        base.id,
        100,
      ).filter((item) => item.value === 'not_interested').length;
      const transitioned = transitionDiscoveryBase({
        base: {
          ...base,
          origin: base.origin as DiscoveryBase['origin'],
        },
        feedback: input.value === 'not_interested' && lowQualityFeedbackCount >= 2
          ? 'disliked'
          : baseTransitionFeedback,
        now: feedback.createdAt,
      });
      this.db.upsertDiscoveryBase(transitioned);
      trace(
        'discovery',
        'update-base-feedback',
        'completed',
        [feedback.id, base.id],
        [transitioned.id, transitioned.state],
      );
    }

    const insight = feedback.insightId ? (this.db.getCompanionInsight(feedback.insightId) as unknown as GeneratedInsight | undefined) : undefined;
    const reflected = this.db.insertExplorationCycle({
      ...cycle,
      state: 'reflecting',
      completedAt: this.runtimeClock.now().toISOString()
    });
    this.recordExplorationEvent(reflected, 'reflecting', `${companionName} recorded what happened after sharing the insight.`, {
      feedback: feedback.value
    });
    if (cycle.selectedCuriosityTargetId && input.value === 'not_interested') {
      this.db.setCuriosityTargetStatus(
        cycle.selectedCuriosityTargetId,
        'ignored',
        this.runtimeClock.now().toISOString(),
      );
    }

    if (input.value === 'saved' && insight) {
      const memory = this.db.insertMemoryNode({
        ...createMemoryNode({
          type: 'discovery',
          title: insight.title,
          summary: insight.summary,
          content: insight.explanation,
          source: 'autonomous_exploration'
        }),
        companionId: cycle.companionId,
        userId: cycle.userId,
        memoryType: 'conversation_episode',
        metadata: {
          ownerCompanionId: cycle.companionId,
          ownerUserId: cycle.userId,
          sourceType: 'discovery',
          confidence: insight.confidence,
          sensitivity: 'normal',
          scope: 'companion',
          createdAt: nowIso()
        }
      });
      trace('memory', 'save-feedback-memory', 'completed', [feedback.id, insight.id], [memory.id]);
      const activeJourney = this.db.listActiveJourneys()[0] ?? this.db.insertJourney(
        createJourney({ title: `Explore ${insight.title}`, description: insight.summary })
      );
      const milestone = this.db.insertMilestone(
        createJourneyMilestone({
          journeyId: activeJourney.id,
          title: `${companionName} saved an insight: ${insight.title}`,
          summary: insight.summary,
          type: 'discovery_saved'
        })
      );
      trace('journey', 'save-feedback-milestone', 'completed', [feedback.id, memory.id], [activeJourney.id, milestone.id]);
      const diary = this.db.insertDiary({
        id: createId('diary'),
        characterId: cycle.companionId,
        type: 'milestone',
        title: `${companionName} brought something back`,
        content: `I explored ${insight.title} and the user wanted to keep it. I added it to memory ${memory.id} so I can connect it to future curiosity.`,
        relatedJourneyId: activeJourney.id,
        createdAt: nowIso()
      });
      trace('diary', 'record-feedback-reflection', 'completed', [feedback.id, milestone.id], [diary.id]);
      this.applyCharacterEmotion(cycle.companionId, 'user_accepts_discovery');
    } else if (input.value === 'talk_about_this' && insight) {
      this.db.insertCompanionMessage({
        characterId: cycle.companionId,
        role: 'assistant',
        content: insight.summary,
        source: 'companion_text',
        metadata: { cycleId: cycle.id, insightId: insight.id }
      });
      trace('memory', 'save-feedback-memory', 'skipped', [feedback.id], [], 'feedback_did_not_request_save');
      trace('journey', 'save-feedback-milestone', 'skipped', [feedback.id], [], 'feedback_did_not_request_save');
      trace('diary', 'record-feedback-reflection', 'skipped', [feedback.id], [], 'feedback_did_not_request_save');
    } else {
      trace('memory', 'save-feedback-memory', 'skipped', [feedback.id], [], 'feedback_did_not_request_save');
      trace('journey', 'save-feedback-milestone', 'skipped', [feedback.id], [], 'feedback_did_not_request_save');
      trace('diary', 'record-feedback-reflection', 'skipped', [feedback.id], [], 'feedback_did_not_request_save');
    }

    const relationshipSignal = this.companionRuntime.relationshipSignalForFeedback(input.value);
    if (relationshipSignal) {
      this.companionRuntime.applyRelationshipSignal(cycle.companionId, relationshipSignal);
      trace('relationship', 'apply-feedback-signal', 'completed', [feedback.id], [relationshipSignal]);
    } else {
      trace('relationship', 'apply-feedback-signal', 'skipped', [feedback.id], [], 'no_relationship_signal');
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

  async runDiscoveryRefresh(_sources?: DiscoverySource[]): Promise<DiscoveryRefreshResult> {
    // Scheduled refresh uses the same owner-captured ResearchOrchestrator path as
    // manual autonomy. Source selection is determined by ResearchIntent and the
    // Source Router, never by executing every fixed connector.
    const companionId = this.db.resolveActiveCompanionId();
    const before = new Set(this.db.listDiscoveries({ companionId, limit: 500 }).map((discovery) => discovery.id));
    await this.runAutonomousExploration({ companionId, trigger: 'scheduled' });
    if (this.db.resolveActiveCompanionId() !== companionId) return { discoveries: [], newlyInserted: [] };
    const discoveries = this.db.listDiscoveries({ companionId, limit: 500 });
    return {
      discoveries,
      newlyInserted: discoveries.filter((discovery) => !before.has(discovery.id))
    };
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
    const today = this.now().toISOString().slice(0, 10);
    return this.db
      .listExplorationCycles(100)
      .filter((cycle) => cycle.trigger !== 'manual' && cycle.startedAt.startsWith(today)).length;
  }

  private createDeveloperCuriosityTarget(topic: string, companionId: string, at: string): CuriosityTarget {
    const normalizedTopic = normalizeSemanticText(topic);
    return {
      id: createId('curiosity'),
      userId: 'default',
      companionId,
      topic,
      topicFingerprint: createSemanticFingerprint('curiosity_topic', [normalizedTopic]),
      sourceFingerprint: createSemanticFingerprint('curiosity_source', ['character_trigger', normalizedTopic]),
      generatedFromIds: [],
      description: `Developer-requested research for ${topic}.`,
      source: 'character_trigger',
      explorationType: 'practical',
      priority: 0.9,
      confidence: 1,
      reason: 'Explicit Developer Tool request.',
      expectedValue: 'Deterministic validation of the research pipeline.',
      status: 'open',
      lastGeneratedAt: at,
      generationCount: 1,
      ignoreCount: 0,
      createdAt: at,
      updatedAt: at,
    };
  }

  private async runFixtureResearch(topic: string): Promise<ResearchDeveloperReport> {
    if (!this.researchFixtureEnabled) throw new Error('RESEARCH_FIXTURE_DISABLED');
    const trimmed = topic.trim();
    if (!trimmed) throw new Error('RESEARCH_FIXTURE_DISABLED');
    const companionId = this.db.resolveActiveCompanionId();
    const at = this.runtimeClock.now().toISOString();
    const target = this.db.upsertCuriosityTarget(this.createDeveloperCuriosityTarget(trimmed, companionId, at), at).record;
    const cycleId = createId('cycle');
    const correlationId = createId('corr');
    let cycle = this.db.insertExplorationCycle({
      id: cycleId,
      userId: 'default',
      companionId,
      trigger: 'manual',
      state: 'curious',
      curiosityTargetIds: [target.id],
      selectedCuriosityTargetId: target.id,
      discoveryCandidateIds: [],
      insightIds: [],
      startedAt: at,
    });
    this.recordExplorationEvent(cycle, 'curious', `Fixture research: ${trimmed}`, { mode: 'fixture' });
    cycle = this.saveCycleState(cycle, 'planning');
    cycle = this.saveCycleState(cycle, 'exploring');
    const research = await this.researchOrchestrator.run({
      userId: 'default',
      companionId,
      cycleId,
      curiosityTarget: target,
      onTrace: (event) => this.recordEngineTrace({
        correlationId,
        cycleId,
        companionId,
        engine: 'research',
        operation: event.operation,
        status: event.status,
        providerMode: event.providerMode,
        inputRefs: event.inputRefs,
        outputRefs: event.outputRefs,
        skipReason: event.skipReason,
        error: event.error,
      }),
      onDebugEvent: (event) => this.pushDeveloperDebugEvent({
        ...event,
        companionId,
        cycleId,
        correlationId,
      }),
    });
    this.db.insertResearchIntent(research.intent);
    this.db.insertResearchPlan(research.plan);
    for (const evidence of research.evidence) this.db.insertWebPageEvidence(evidence);
    for (const candidate of research.candidates) this.db.insertDiscoveryCandidate(candidate);
    const characterState = this.db.getCharacterState(companionId);
    const characterProfile = this.db.getActiveCharacters().find((character) => character.id === companionId);
    const patterns = this.db.listPatterns('default', 100, companionId);
    const insights = generateInsights({
      userId: 'default',
      companionId,
      characterState,
      characterProfile,
      memoryNodes: this.db.listMemoryNodes(companionId),
      patterns,
      interestGraph: this.db.getInterestGraph(`default:${companionId}`),
      curiosityTarget: target,
      discoveryCandidates: research.candidates,
    });
    for (const insight of insights) {
      this.db.insertCompanionInsight(toPersistedCompanionInsight(
        insight,
        companionId,
        target.reason,
        research.candidates.map((candidate) => candidate.id),
      ));
    }
    cycle = this.saveCycleState(cycle, 'returning', {
      researchIntentId: research.intent.id,
      researchPlanId: research.plan.id,
      discoveryCandidateIds: research.candidates.map((candidate) => candidate.id),
      insightIds: insights.map((insight) => insight.id),
    });
    cycle = this.saveCycleState(
      cycle,
      research.candidates.length ? 'sharing' : 'reflecting',
      { completedAt: this.runtimeClock.now().toISOString() },
      {
        message: research.candidates.length
          ? 'Fixture research completed with deterministic evidence.'
          : 'I could not find enough reliable information this time.',
        metadata: { mode: 'fixture', outcome: research.candidates.length ? 'success' : 'empty' },
      },
    );
    this.db.setCuriosityTargetStatus(target.id, 'completed', this.runtimeClock.now().toISOString());
    return {
      mode: 'fixture',
      researchIntentId: research.intent.id,
      researchPlanId: research.plan.id,
      queries: research.plan.queries,
      capabilitiesSelected: research.plan.selectedCapabilities,
      pagesFetched: research.evidence.length,
      evidenceAccepted: research.evidence.length,
      evidenceRejected: 0,
      candidatesCreated: research.candidates.length,
      duplicatesSkipped: 0,
      insightsGenerated: insights.length,
      stopReason: research.stopReason,
      correlationId,
    };
  }

  private async researchFromUrl(rawUrl: string): Promise<ResearchDeveloperReport> {
    const normalizedUrl = normalizeActionUrl(rawUrl);
    if (!normalizedUrl) throw new Error('RESEARCH_MANUAL_URL_INVALID');
    const companionId = this.db.resolveActiveCompanionId();
    const userId = 'default';
    const at = this.runtimeClock.now().toISOString();
    const correlationId = createId('corr');
    const cycleId = createId('cycle');
    const target = this.db.upsertCuriosityTarget(
      this.createDeveloperCuriosityTarget(new URL(normalizedUrl).hostname, companionId, at),
      at,
    ).record;
    const intent: ResearchIntent = {
      id: createId('research_intent'),
      userId,
      companionId,
      cycleId,
      curiosityTargetId: target.id,
      topic: target.topic,
      objective: 'find_official_information',
      preferredSourceTypes: ['official', 'technical_article'],
      evidenceRequirements: { minimumSources: 1 },
      createdAt: at,
    };
    const plan: ResearchPlan = {
      id: createId('research_plan'),
      userId,
      companionId,
      cycleId,
      researchIntentId: intent.id,
      queries: [normalizedUrl],
      selectedCapabilities: ['safe-web-page-fetcher'],
      limits: {
        maxQueries: 0,
        maxSearchResultsPerQuery: 1,
        maxPagesToRead: 1,
        maxLinkDepth: 0,
        maxTotalCharacters: 50_000,
        timeoutMs: 10_000,
      },
      createdAt: at,
    };
    const searchResult: WebSearchResult = {
      id: createId('manual_url'),
      query: normalizedUrl,
      title: new URL(normalizedUrl).hostname,
      url: normalizedUrl,
      domain: new URL(normalizedUrl).hostname.toLowerCase(),
      rank: 1,
      provider: 'manual-url',
    };
    this.emitFoundationEvent('research:manual-url-started', 'research', { cycleId, companionId }, correlationId);
    let evidence;
    try {
      evidence = await this.manualResearchPageFetcher.fetchPage({
        searchResult,
        userId,
        companionId,
        cycleId,
        researchIntentId: intent.id,
        researchPlanId: plan.id,
        sourceType: 'official',
      });
    } catch (error) {
      if (error instanceof ResearchAdapterError
        && ['blocked_private_address', 'blocked_hostname', 'credentials_not_allowed'].includes(error.code)) {
        throw new Error('RESEARCH_MANUAL_URL_BLOCKED');
      }
      throw error;
    }
    const completedPlan: ResearchPlan = {
      ...plan,
      outcome: { stopReason: 'manual_url_completed', additionalPasses: 0, completedAt: this.runtimeClock.now().toISOString() },
    };
    this.db.insertResearchIntent(intent);
    this.db.insertResearchPlan(completedPlan);
    this.db.insertWebPageEvidence(evidence);
    const candidate = {
      id: createId('candidate'),
      userId,
      companionId,
      title: evidence.title,
      summary: evidence.excerpt,
      sourceType: 'article' as const,
      sourceUrl: evidence.canonicalUrl,
      sourceName: evidence.domain,
      agentType: 'research' as const,
      relatedCuriosityTargetId: target.id,
      relevanceScore: 0.8,
      noveltyScore: 0.7,
      evidenceScore: 0.9,
      usefulnessScore: 0.8,
      researchPlanId: plan.id,
      evidenceIds: [evidence.id],
      collectedAt: at,
    };
    this.db.insertDiscoveryCandidate(candidate);
    const characterState = this.db.getCharacterState(companionId);
    const characterProfile = this.db.getActiveCharacters().find((character) => character.id === companionId);
    const insights = generateInsights({
      userId,
      companionId,
      characterState,
      characterProfile,
      memoryNodes: this.db.listMemoryNodes(companionId),
      patterns: this.db.listPatterns(userId, 100, companionId),
      interestGraph: this.db.getInterestGraph(`${userId}:${companionId}`),
      curiosityTarget: target,
      discoveryCandidates: [candidate],
    });
    for (const insight of insights) {
      this.db.insertCompanionInsight(toPersistedCompanionInsight(insight, companionId, target.reason, [candidate.id]));
    }
    return {
      mode: 'manual_url',
      researchIntentId: intent.id,
      researchPlanId: plan.id,
      queries: [normalizedUrl],
      capabilitiesSelected: ['safe-web-page-fetcher'],
      pagesFetched: 1,
      evidenceAccepted: 1,
      evidenceRejected: 0,
      candidatesCreated: 1,
      duplicatesSkipped: 0,
      insightsGenerated: insights.length,
      stopReason: 'manual_url_completed',
      correlationId,
    };
  }

  private getRuntimeTimeStatus(): RuntimeTimeStatus {
    return {
      realTime: new Date().toISOString(),
      runtimeTime: this.runtimeClock.now().toISOString(),
      offsetMs: this.runtimeClock instanceof DebugRuntimeClock ? this.runtimeClock.getOffsetMs() : 0,
      debugAvailable: this.runtimeClock instanceof DebugRuntimeClock && this.runtimeClock.enabled,
      lastSchedulerTick: this.lastSchedulerTick,
    };
  }

  private async advanceRuntimeTime(
    input: { milliseconds: number; runScheduledTick?: boolean },
  ): Promise<RuntimeSchedulerReport> {
    if (!(this.runtimeClock instanceof DebugRuntimeClock)) throw new Error('DEBUG_CLOCK_UNAVAILABLE');
    const previousRuntimeTime = this.runtimeClock.now().toISOString();
    this.runtimeClock.advance(input.milliseconds);
    const newRuntimeTime = this.runtimeClock.now().toISOString();
    this.emitFoundationEvent('runtime-clock:advanced', 'runtime-clock', {
      previousRuntimeTime,
      newRuntimeTime,
      offsetMs: this.runtimeClock.getOffsetMs(),
    });
    if (input.runScheduledTick) {
      const report = await this.runRuntimeScheduledTick();
      return { ...report, previousRuntimeTime, newRuntimeTime };
    }
    return {
      previousRuntimeTime,
      newRuntimeTime,
      schedulersExecuted: [],
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      cooldownsExpired: 0,
      errors: [],
    };
  }

  private resetRuntimeTime(): RuntimeTimeStatus {
    if (!(this.runtimeClock instanceof DebugRuntimeClock)) throw new Error('DEBUG_CLOCK_UNAVAILABLE');
    const previousRuntimeTime = this.runtimeClock.now().toISOString();
    this.runtimeClock.reset();
    const status = this.getRuntimeTimeStatus();
    this.emitFoundationEvent('runtime-clock:reset', 'runtime-clock', {
      previousRuntimeTime,
      runtimeTime: status.runtimeTime,
    });
    return status;
  }

  private async runRuntimeScheduledTick(): Promise<RuntimeSchedulerReport> {
    const previousRuntimeTime = this.runtimeClock.now().toISOString();
    const companionId = this.db.resolveActiveCompanionId();
    const userId = 'default';
    const nowMs = this.runtimeClock.nowMs();
    const cooldownsExpired = this.db.listCuriosityTargets(userId, 10_000, companionId)
      .filter((target) => target.cooldownUntil && Date.parse(target.cooldownUntil) <= nowMs).length;
    const memory = this.db.listMemoryNodes(companionId)[0];
    const report = memory
      ? await this.recomputeMemoryImpact({ id: memory.id })
      : undefined;
    const errors = [...(report?.errors ?? [])];
    let discoveryRecords = 0;
    let diaryRecords = 0;
    try {
      discoveryRecords = (await this.runDiscoveryRefresh()).discoveries.length;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    try {
      await this.diary.generateDaily({ characterId: companionId });
      diaryRecords = 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    this.lastSchedulerTick = this.runtimeClock.now().toISOString();
    return {
      previousRuntimeTime,
      newRuntimeTime: this.lastSchedulerTick,
      schedulersExecuted: [
        'pattern-reevaluation',
        'curiosity-reevaluation',
        'discovery-scheduler',
        'diary-scheduler',
        'memory-lifecycle',
      ],
      recordsCreated: (report?.patternsCreated ?? 0) + (report?.curiosityTargetsCreated ?? 0)
        + (report?.interestNodesAdded ?? 0) + discoveryRecords + diaryRecords,
      recordsUpdated: (report?.patternsUpdated ?? 0) + (report?.curiosityTargetsUpdated ?? 0) + (report?.interestNodesUpdated ?? 0),
      recordsSkipped: report?.duplicatesSkipped ?? 0,
      cooldownsExpired,
      errors,
    };
  }

  private inspectMemoryImpact(id: string): MemoryImpactReport {
    const companionId = this.db.resolveActiveCompanionId();
    const memory = this.db.getMemoryNode(id, companionId);
    if (!memory) throw new Error('MEMORY_IMPACT_NOT_FOUND');
    const userId = memory.userId ?? 'default';
    const normalizedTopics = normalizeSemanticText(`${memory.title} ${memory.summary ?? ''}`)
      .split(' ')
      .filter((topic) => topic.length > 2);
    const patterns = this.db.listPatterns(userId, 10_000, companionId)
      .filter((pattern) => pattern.evidence.some((evidence) => evidence.sourceType === 'memory' && evidence.sourceId === memory.id));
    const patternIds = new Set(patterns.map((pattern) => pattern.id));
    const curiosityTargets = this.db.listCuriosityTargets(userId, 10_000, companionId)
      .filter((target) => target.relatedMemoryIds?.includes(memory.id)
        || target.relatedPatternIds?.some((patternId) => patternIds.has(patternId)));
    const curiosityIds = new Set(curiosityTargets.map((target) => target.id));
    const researchIntents = this.db.listResearchIntents({ companionId, limit: 10_000 })
      .filter((intent) => curiosityIds.has(intent.curiosityTargetId));
    const researchIntentIds = new Set(researchIntents.map((intent) => intent.id));
    const cycles = this.db.listExplorationCycles(10_000)
      .filter((cycle) => cycle.companionId === companionId
        && (cycle.curiosityTargetIds.some((targetId) => curiosityIds.has(targetId))
          || (cycle.researchIntentId ? researchIntentIds.has(cycle.researchIntentId) : false)));
    const cycleIds = new Set(cycles.map((cycle) => cycle.id));
    const cycleCandidateIds = new Set(cycles.flatMap((cycle) => cycle.discoveryCandidateIds));
    const candidates = this.db.listDiscoveryCandidates(userId, 10_000, companionId)
      .filter((candidate) => cycleCandidateIds.has(candidate.id));
    const insights = this.db.listCompanionInsights(userId, 10_000, companionId)
      .filter((insight) => insight.relatedMemoryIds?.includes(memory.id)
        || insight.relatedPatternIds?.some((patternId) => patternIds.has(patternId)));
    const interestGraph = this.db.getInterestGraph(`${userId}:${companionId}`);
    const normalizedMemoryTitle = normalizeSemanticText(memory.title);
    const interestNodeIds = interestGraph.nodes
      .filter((node) => {
        const normalizedLabel = normalizeSemanticText(node.label);
        return normalizedLabel === normalizedMemoryTitle
          || normalizedTopics.some((topic) => normalizedLabel.split(' ').includes(topic));
      })
      .map((node) => node.id);
    const evaluations = [
      ...patterns.map((pattern) => pattern.lastObservedAt ?? pattern.updatedAt),
      ...curiosityTargets.map((target) => target.updatedAt ?? target.createdAt),
    ].filter(Boolean).sort();
    return {
      memory,
      normalizedTopics,
      interestNodeIds,
      patternIds: [...patternIds],
      curiosityTargetIds: [...curiosityIds],
      researchIntentIds: [...researchIntentIds],
      explorationCycleIds: [...cycleIds],
      discoveryCandidateIds: candidates.map((candidate) => candidate.id),
      insightIds: insights.map((insight) => insight.id),
      lastCognitiveEvaluation: evaluations.at(-1),
    };
  }

  private async recomputeMemoryImpact(
    input: { id: string; explore?: boolean; companionId?: string },
  ): Promise<MemoryImpactRecomputeReport> {
    const companionId = this.db.resolveActiveCompanionId(input.companionId);
    const memory = this.db.getMemoryNode(input.id, companionId);
    if (!memory) throw new Error('MEMORY_IMPACT_NOT_FOUND');
    const userId = memory.userId ?? 'default';
    const evaluatedAt = this.runtimeClock.now().toISOString();
    this.reconcileDeletedMemoryTombstones(companionId, userId, evaluatedAt);
    const correlationId = createId('corr');
    this.emitFoundationEvent('memory-impact:evaluate', 'memory', { memoryId: memory.id, companionId }, correlationId);
    const report: MemoryImpactRecomputeReport = {
      memoryId: memory.id,
      interestNodesAdded: 0,
      interestNodesUpdated: 0,
      patternsCreated: 0,
      patternsUpdated: 0,
      curiosityTargetsCreated: 0,
      curiosityTargetsUpdated: 0,
      duplicatesSkipped: 0,
      researchCyclesStarted: 0,
      errors: [],
      evaluatedAt,
    };
    try {
      const memoryNodes = this.db.listCognitionMemoryCandidates(companionId, memory.id, 30);
      const journeyMilestones = this.db.listMilestones();
      const discoveryHistory = this.db.listDiscoveries({ limit: 100, companionId });
      const feedbackHistory = this.db.listDiscoveryFeedback(100, undefined, companionId);
      const patterns = detectPatterns({
        userId,
        companionId,
        evaluatedAt,
        memoryNodes,
        journeyMilestones,
        discoveryHistory,
        feedbackHistory,
      });
      const persistedPatterns = patterns.map((pattern) => {
        const result = this.db.upsertPattern(pattern);
        if (result.outcome === 'created') report.patternsCreated += 1;
        else if (result.outcome === 'updated') report.patternsUpdated += 1;
        else report.duplicatesSkipped += 1;
        return result.record;
      });
      const scopeId = `${userId}:${companionId}`;
      const beforeGraph = this.db.getInterestGraph(scopeId);
      const graph = buildInterestGraph({
        userId: scopeId,
        memoryNodes,
        patterns: persistedPatterns,
        discoveries: discoveryHistory,
        feedback: feedbackHistory,
      });
      this.db.upsertInterestGraph(graph);
      const beforeIds = new Set(beforeGraph.nodes.map((node) => node.id));
      report.interestNodesAdded = graph.nodes.filter((node) => !beforeIds.has(node.id)).length;
      report.interestNodesUpdated = graph.nodes.length - report.interestNodesAdded;
      const characterState = this.db.getCharacterState(companionId);
      const characterProfile = this.db.getActiveCharacters().find((character) => character.id === companionId);
      for (const target of generateCuriosityTargets({
        userId,
        companionId,
        characterState,
        characterProfile,
        memoryNodes,
        journeySummaries: journeyMilestones.map((milestone) => milestone.summary ?? milestone.title),
        patterns: persistedPatterns,
        interestGraph: graph,
        recentFeedback: feedbackHistory,
        generatedAt: evaluatedAt,
      })) {
        const result = this.db.upsertCuriosityTarget(target, evaluatedAt);
        if (result.outcome === 'created') report.curiosityTargetsCreated += 1;
        else if (result.outcome === 'cooldown' || result.outcome === 'deduplicated') report.duplicatesSkipped += 1;
        else report.curiosityTargetsUpdated += 1;
      }
      this.db.markMemoriesProcessed(memoryNodes.map((item) => item.id), evaluatedAt);
      if (input.explore) {
        await this.runAutonomousExploration({ companionId, userId, trigger: 'memory_updated' });
        report.researchCyclesStarted = 1;
      }
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : String(error));
    }
    this.emitFoundationEvent('memory-impact:completed', 'memory', {
      memoryId: memory.id,
      companionId,
      patternsCreated: report.patternsCreated,
      patternsUpdated: report.patternsUpdated,
      curiosityTargetsCreated: report.curiosityTargetsCreated,
      curiosityTargetsUpdated: report.curiosityTargetsUpdated,
      duplicatesSkipped: report.duplicatesSkipped,
    }, correlationId);
    return report;
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
    const knownFeedIds = listCuratedDiscoveryFeedIds();
    const { content } = await this.sendToAi({
      channel: 'personality_analysis',
      source: 'creation',
      messages: [{
        role: 'user',
        content: [
          'Analyze this Companion personality description.',
          'Return JSON only with:',
          '1) integer values from 0 to 100 for exactly: energy, curiosity, sociability, diligence, playfulness, confidence, calmness, shyness',
          '2) interests: an array of 3 to 5 concise interest phrases (no duplicates, avoid overly broad words)',
          '3) preferredContentTypes: subset of articles, discussion, video, code, feeds',
          '4) platformAffinities: optional object mapping generic-web|reddit|youtube|github|bilibili to 0..1',
          '5) curatedFeedIds: feed IDs chosen only from the provided registry IDs (may be empty). Never invent RSS URLs or permanent site: queries.',
          `Known curated feed IDs: ${knownFeedIds.join(', ') || '(none)'}`,
          `Description: ${trimmed}`,
        ].join('\n'),
      }],
    });
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI personality analysis did not return valid JSON.');
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const keys: Array<keyof CompanionPersonality> = ['energy', 'curiosity', 'sociability', 'diligence', 'playfulness', 'confidence', 'calmness', 'shyness'];
    const personality = {} as CompanionPersonality;
    for (const key of keys) {
      const value = raw[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 100) {
        throw new Error(`AI personality analysis returned an invalid ${key} value.`);
      }
      personality[key] = value;
    }
    const discoverySeedPlan = parseDiscoverySeedPlanFromAnalysis(trimmed, raw);
    const analysisId = createId('personality_analysis');
    const expiresAt = this.now().getTime() + 10 * 60 * 1000;
    this.personalityAnalyses.set(analysisId, {
      personality,
      description: trimmed,
      expiresAt,
      used: false,
      discoverySeedPlan,
    });
    this.prunePersonalityAnalyses();
    return {
      analysisId,
      personality,
      description: trimmed,
      expiresAt: new Date(expiresAt).toISOString(),
      discoverySeedPlan,
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

  private async sendToAi(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    channel: 'chat' | 'turn' | 'discovery_reason' | 'personality_analysis' | 'discovery_research_plan' | 'discovery_evidence_synthesis';
    source: string;
    companionId?: string;
    correlationId?: string;
    cycleId?: string;
    turnId?: string;
  }): Promise<{ content: string; raw: unknown; requestBody: unknown; durationMs: number }> {
    const timer = createTimer();
    try {
      const result = this.aiProvider
        ? await this.completeWithInjectedAi(input)
        : await this.createDeepSeekClient().chatDebug(input.messages);
      const durationMs = timer.stop();
      this.recordAiDeveloperEvent({
        channel: input.channel,
        source: input.source,
        status: 'success',
        requestMessages: input.messages,
        requestBody: result.requestBody,
        rawResponse: result.raw,
        content: result.content,
        durationMs,
        companionId: input.companionId,
        correlationId: input.correlationId,
        cycleId: input.cycleId,
        turnId: input.turnId,
      });
      return { ...result, durationMs };
    } catch (error) {
      const durationMs = timer.stop();
      const message = error instanceof Error ? error.message : String(error);
      this.recordAiDeveloperEvent({
        channel: input.channel,
        source: input.source,
        status: 'error',
        requestMessages: input.messages,
        requestBody: getDebugRequestBody(error),
        rawResponse: getDebugResponseBody(error),
        content: '',
        error: message,
        durationMs,
        companionId: input.companionId,
        correlationId: input.correlationId,
        cycleId: input.cycleId,
        turnId: input.turnId,
      });
      throw error;
    }
  }

  private async completeWithInjectedAi(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    channel: 'chat' | 'turn' | 'discovery_reason' | 'personality_analysis' | 'discovery_research_plan' | 'discovery_evidence_synthesis';
    source: string;
  }): Promise<{ content: string; raw: unknown; requestBody: unknown }> {
    const requestBody = {
      operation: input.channel,
      messages: input.messages,
      input: { source: input.source }
    };
    const raw = await this.aiProvider!.complete<unknown>(requestBody);
    const content = typeof raw === 'string'
      ? raw
      : typeof raw === 'object' && raw !== null && 'content' in raw
        ? String((raw as { content: unknown }).content)
        : JSON.stringify(raw);
    return { content, raw, requestBody };
  }

  private applyCharacterEmotion(
    characterId: string | undefined,
    eventType: Parameters<CompanionRuntime['applyEmotion']>[1]
  ): void {
    const nextState = this.companionRuntime.applyEmotion(characterId, eventType);
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
  let dimensions: { width: number; height: number };
  try {
    dimensions = validatePngStructure(bytes);
  } catch (error) {
    if (error instanceof PngStructureError && error.code === 'invalid_dimensions') {
      throw new Error(`${definition.key} has invalid PNG dimensions.`);
    }
    throw new Error(`${definition.key} is not a valid PNG.`);
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
