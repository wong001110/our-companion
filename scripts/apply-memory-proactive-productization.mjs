import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(path, before, after, label) {
  const source = read(path);
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  write(path, source.replace(before, after));
}
function replaceRegexOnce(path, regex, replacement, label) {
  const source = read(path);
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`${label}: expected one match, found ${matches.length}`);
  write(path, source.replace(regex, replacement));
}
function appendOnce(path, marker, content) {
  const source = read(path);
  if (source.includes(marker)) return;
  write(path, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

const shared = 'packages/shared/src/index.ts';
{
  let source = read(shared);
  source = source.replace(/export type MemoryStatus =([\s\S]*?);/, (block) => block.includes("'review_pending'") ? block : block.replace(';', "\n  | 'review_pending';"));
  source = source.replace(/export interface MemoryMetadata \{[\s\S]*?\n\}/, (block) => {
    if (block.includes('reviewState?: MemoryReviewState')) return block;
    return block.replace(
      '  sourceMessageIds?: string[];\n}',
      "  sourceMessageIds?: string[];\n  reviewState?: MemoryReviewState;\n  reviewNote?: string;\n  reviewedAt?: string;\n}",
    );
  });
  const typeMarker = 'export interface OurCompanionApi {';
  if (!source.includes('export type MemoryReviewState =')) {
    const types = `export type MemoryReviewState = 'unreviewed' | 'confirmed' | 'needs_confirmation' | 'user_disputed';

export interface MemoryReviewItem {
  id: string;
  title: string;
  summary?: string;
  memoryType?: TypedMemoryType;
  nodeType: MemoryNodeType;
  status: MemoryStatus;
  reviewState: MemoryReviewState;
  reviewNote?: string;
  confidence: number;
  importance: number;
  sensitivity: MemorySensitivity;
  sourceType?: MemoryMetadata['sourceType'];
  canonicalSource?: MemoryMetadata['canonicalSource'];
  sourceUrl?: string;
  isPinned: boolean;
  observationCount: number;
  sourceMessageCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface MemoryReviewQuery {
  search?: string;
  memoryTypes?: TypedMemoryType[];
  reviewStates?: MemoryReviewState[];
  statuses?: MemoryStatus[];
  limit?: number;
}

export interface MemoryReviewUpdateInput {
  id: string;
  state: MemoryReviewState;
  note?: string;
}

export type MemoryVectorProductState = 'not_installed' | 'installing' | 'indexing' | 'ready' | 'degraded' | 'error';
export interface MemoryVectorProductStatus {
  state: MemoryVectorProductState;
  modelId: string;
  dimensions: number;
  indexedCount: number;
  eligibleCount: number;
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  runtimeReady: boolean;
  manifestValid: boolean;
  offlineVerified: boolean;
  localOnly: true;
  lexicalFallbackAvailable: true;
  message: string;
  lastError?: string;
}

export type ProactiveCompanionMode = 'off' | 'quiet' | 'balanced' | 'active';
export interface ProactiveCompanionSettings {
  mode: ProactiveCompanionMode;
  unfinishedTopicFollowUps: boolean;
  goalCheckIns: boolean;
  journeyReflections: boolean;
  quietPresence: boolean;
}

export interface CompanionProactivePrompt {
  id: string;
  companionId: string;
  type: 'unfinished_topic' | 'goal_check_in' | 'journey_reflection' | 'quiet_presence';
  message: string;
  createdAt: string;
}

`;
    source = source.replace(typeMarker, types + typeMarker);
  }
  source = source.replace(
    `    inspectImpact(id: string): Promise<MemoryImpactReport>;\n    recomputeImpact(input: { id: string; explore?: boolean }): Promise<MemoryImpactRecomputeReport>;`,
    `    inspectImpact(id: string): Promise<MemoryImpactReport>;\n    recomputeImpact(input: { id: string; explore?: boolean }): Promise<MemoryImpactRecomputeReport>;\n    listReview(input?: MemoryReviewQuery): Promise<MemoryReviewItem[]>;\n    updateReview(input: MemoryReviewUpdateInput): Promise<MemoryReviewItem>;\n    getVectorStatus(): Promise<MemoryVectorProductStatus>;\n    installVectorModel(): Promise<{ completed: number; failed: number }>;\n    rebuildVectorIndex(): Promise<{\n      mode: 'full_rebuild'; vectorsDeleted: number; mappingsReset: number; jobsQueued: number;\n      completed: number; failed: number;\n      healthBefore: { available: boolean; indexedCount: number };\n      healthAfter: { available: boolean; indexedCount: number };\n    }>;`,
  );
  source = source.replace(
    `    setAttentionMode(mode: 'available' | 'focused' | 'do_not_disturb'): Promise<void>;\n    listPendingActions(): Promise<PendingCompanionAction[]>;`,
    `    setAttentionMode(mode: 'available' | 'focused' | 'do_not_disturb'): Promise<void>;\n    getProactiveSettings(): Promise<ProactiveCompanionSettings>;\n    updateProactiveSettings(input: ProactiveCompanionSettings): Promise<ProactiveCompanionSettings>;\n    listPendingActions(): Promise<PendingCompanionAction[]>;`,
  );
  source = source.replace(
    `    reportCommandAck(ack: CompanionCommandAck): Promise<void>;\n    getHistory(input?: CompanionHistoryInput): Promise<CompanionMessage[]>;`,
    `    reportCommandAck(ack: CompanionCommandAck): Promise<void>;\n    onProactivePrompt(listener: (prompt: CompanionProactivePrompt) => void): () => void;\n    getHistory(input?: CompanionHistoryInput): Promise<CompanionMessage[]>;`,
  );
  write(shared, source);
}

const database = 'packages/database/src/index.ts';
replaceOnce(
  database,
  `  updateConversationSessionPhase(sessionId: string, phase: ConversationPhase): ConversationSessionRecord {`,
  `  getLatestUnfinishedTopic(companionId: string, userId = 'local'): string | undefined {\n    const row = this.db.prepare(\n      \`SELECT unfinished_topic FROM conversation_sessions\n       WHERE companion_id = ? AND user_id = ? AND unfinished_topic IS NOT NULL AND unfinished_topic != ''\n       ORDER BY updated_at DESC LIMIT 1\`\n    ).get(companionId, userId) as { unfinished_topic?: string } | undefined;\n    return row?.unfinished_topic ? String(row.unfinished_topic) : undefined;\n  }\n\n  updateConversationSessionPhase(sessionId: string, phase: ConversationPhase): ConversationSessionRecord {`,
  'database unfinished topic reader',
);

const preload = 'apps/desktop/electron/preload/index.ts';
replaceOnce(
  preload,
  `    ,recomputeImpact: (input: { id: string; explore?: boolean }) => invoke('memory:recomputeImpact', input)\n  },`,
  `    ,recomputeImpact: (input: { id: string; explore?: boolean }) => invoke('memory:recomputeImpact', input)\n    ,listReview: (input) => invoke('memory:listReview', input)\n    ,updateReview: (input) => invoke('memory:updateReview', input)\n    ,getVectorStatus: () => invoke('memory:getVectorStatus')\n    ,installVectorModel: () => invoke('memory:installVectorModel')\n    ,rebuildVectorIndex: () => invoke('memory:rebuildVectorIndex')\n  },`,
  'preload memory product APIs',
);
replaceOnce(
  preload,
  `    setAttentionMode: (mode: 'available' | 'focused' | 'do_not_disturb') => invoke('companion:setAttentionMode', mode),\n    listPendingActions: () => invoke('companion:listPendingActions'),`,
  `    setAttentionMode: (mode: 'available' | 'focused' | 'do_not_disturb') => invoke('companion:setAttentionMode', mode),\n    getProactiveSettings: () => invoke('companion:getProactiveSettings'),\n    updateProactiveSettings: (input) => invoke('companion:updateProactiveSettings', input),\n    listPendingActions: () => invoke('companion:listPendingActions'),`,
  'preload proactive settings APIs',
);
replaceOnce(
  preload,
  `    reportCommandAck: (ack: import('@our-companion/shared').CompanionCommandAck) =>\n      invoke('companion:reportCommandAck', ack),\n    onCommand:`,
  `    reportCommandAck: (ack: import('@our-companion/shared').CompanionCommandAck) =>\n      invoke('companion:reportCommandAck', ack),\n    onProactivePrompt: (listener: (prompt: import('@our-companion/shared').CompanionProactivePrompt) => void) => {\n      const channel = 'companion:proactivePrompt';\n      const handler = (_event: Electron.IpcRendererEvent, prompt: import('@our-companion/shared').CompanionProactivePrompt) => listener(prompt);\n      ipcRenderer.on(channel, handler);\n      return () => ipcRenderer.removeListener(channel, handler);\n    },\n    onCommand:`,
  'preload proactive prompt event',
);

const index = 'apps/desktop/electron/main/index.ts';
replaceOnce(
  index,
  `    'memory:recomputeImpact': services.memory.recomputeImpact,`,
  `    'memory:recomputeImpact': services.memory.recomputeImpact,\n    'memory:listReview': services.memory.listReview,\n    'memory:updateReview': services.memory.updateReview,\n    'memory:getVectorStatus': services.memory.getVectorStatus,\n    'memory:installVectorModel': services.memory.installVectorModel,\n    'memory:rebuildVectorIndex': services.memory.rebuildVectorIndex,`,
  'main memory routes',
);
replaceOnce(
  index,
  `    'companion:setAttentionMode': services.companion.setAttentionMode,`,
  `    'companion:setAttentionMode': services.companion.setAttentionMode,\n    'companion:getProactiveSettings': services.companion.getProactiveSettings,\n    'companion:updateProactiveSettings': services.companion.updateProactiveSettings,`,
  'main proactive routes',
);
replaceOnce(
  index,
  `    services.attachNetworkStatusBroadcaster((status) => {`,
  `    services.attachProactivePromptBroadcaster((prompt) => {\n      if (companionWindow && !companionWindow.isDestroyed()) companionWindow.webContents.send('companion:proactivePrompt', prompt);\n    });\n    services.attachNetworkStatusBroadcaster((status) => {`,
  'main proactive broadcaster',
);

const services = 'apps/desktop/electron/main/services.ts';
{
  let source = read(services);
  source = source.replace(
    `  MemoryImpactRecomputeReport,\n  MemoryImpactReport,`,
    `  MemoryImpactRecomputeReport,\n  MemoryImpactReport,\n  MemoryReviewQuery,\n  MemoryReviewUpdateInput,\n  MemoryVectorProductStatus,\n  CompanionProactivePrompt,\n  ProactiveCompanionSettings,`,
  );
  source = source.replace(
    `import { VectorMaintenanceCoordinator } from './memory/vectorMaintenanceCoordinator';`,
    `import { VectorMaintenanceCoordinator } from './memory/vectorMaintenanceCoordinator';\nimport { applyMemoryReviewUpdate, filterMemoryReviewItems, toMemoryReviewItem } from './memory/memoryReview';\nimport { buildMemoryVectorProductStatus } from './memory/vectorProductStatus';`,
  );
  source = source.replace(
    `  private foundationEventBroadcaster?: (event: BaseEvent) => void;`,
    `  private foundationEventBroadcaster?: (event: BaseEvent) => void;\n  private proactivePromptBroadcaster?: (prompt: CompanionProactivePrompt) => void;`,
  );
  source = source.replace(
    `        setTimer: runtimeDependencies.setTimer,\n        clearTimer: runtimeDependencies.clearTimer`,
    `        setTimer: runtimeDependencies.setTimer,\n        clearTimer: runtimeDependencies.clearTimer,\n        emitProactivePrompt: (prompt) => {\n          this.proactivePromptBroadcaster?.(prompt);\n          this.emitFoundationEvent('CompanionProactivePrompt', 'companion', { type: prompt.type, companionId: prompt.companionId });\n        }`,
  );
  source = source.replace(
    `  attachAutonomyBroadcasters(callbacks: {`,
    `  attachProactivePromptBroadcaster(broadcaster: (prompt: CompanionProactivePrompt) => void): void {\n    this.proactivePromptBroadcaster = broadcaster;\n  }\n\n  attachAutonomyBroadcasters(callbacks: {`,
  );
  source = source.replace(/  memory = \{[\s\S]*?\n  \};\n\n  journey = \{/, `  memory = {
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
      if (!existing) throw new Error(\`Memory node not found: \${input.id}\`);
      const memory = this.db.updateMemoryNode(updateMemoryNodePure(existing, { ...input, companionId }));
      await this.recomputeMemoryImpact({ id: memory.id, companionId });
      return memory;
    },
    deleteNode: async (id: string) => {
      const companionId = this.db.resolveActiveCompanionId();
      const existing = this.db.getMemoryNode(id, companionId);
      if (!existing) throw new Error(\`Memory node not found: \${id}\`);
      this.db.deleteMemoryNode(id);
      this.reconcileDeletedMemoryTombstones(companionId, existing.userId ?? 'default', this.runtimeClock.now().toISOString());
      return { id, deleted: true as const };
    },
    createEdge: async (input: CreateMemoryEdgeInput) => {
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      if (!this.db.getMemoryNode(input.fromNodeId, companionId) || !this.db.getMemoryNode(input.toNodeId, companionId)) {
        throw new Error('Memory edge endpoints must belong to the active Companion.');
      }
      return this.db.insertMemoryEdge(createMemoryEdge(input));
    },
    getGraph: async (input: { query?: string; companionId?: string } = {}) => {
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      return graphFromMemory(this.db.listMemoryNodes(companionId), this.db.listMemoryEdges(companionId), input.query);
    },
    search: async (input: { query: string; companionId?: string }) => {
      const companionId = this.db.resolveActiveCompanionId(input.companionId);
      return searchMemory(this.db.listMemoryNodes(companionId).filter((memory) => memory.status === 'active'), input.query);
    },
    inspectImpact: async (id: string) => this.inspectMemoryImpact(id),
    recomputeImpact: async (input: { id: string; explore?: boolean }) => this.recomputeMemoryImpact(input),
    listReview: async (input: MemoryReviewQuery = {}) => {
      const companionId = this.db.resolveActiveCompanionId();
      return filterMemoryReviewItems(this.db.listMemoryNodes(companionId).map(toMemoryReviewItem), input);
    },
    updateReview: async (input: MemoryReviewUpdateInput) => {
      const companionId = this.db.resolveActiveCompanionId();
      const existing = this.db.getMemoryNode(input.id, companionId);
      if (!existing) throw new Error('MEMORY_REVIEW_NOT_FOUND');
      const impact = this.inspectMemoryImpact(existing.id);
      const at = this.runtimeClock.now().toISOString();
      const updated = this.db.updateMemoryNode(applyMemoryReviewUpdate(existing, input, at));
      const userId = updated.userId ?? 'default';
      if (updated.status === 'review_pending') {
        this.db.pruneDeletedMemoryPatternEvidence(userId, companionId, [updated.id], at);
        for (const targetId of impact.curiosityTargetIds) this.db.setCuriosityTargetStatus(targetId, 'ignored', at);
        const activeMemories = this.db.listCognitionMemoryCandidates(companionId, undefined, 1_000);
        const patterns = this.db.listPatterns(userId, 10_000, companionId);
        this.db.replaceInterestGraph(buildInterestGraph({
          userId: \`\${userId}:\${companionId}\`,
          memoryNodes: activeMemories,
          patterns,
          discoveries: this.db.listDiscoveries({ limit: 500, companionId }),
          feedback: this.db.listDiscoveryFeedback(500, undefined, companionId),
        }));
      } else if (input.state === 'confirmed') {
        await this.recomputeMemoryImpact({ id: updated.id, companionId });
      }
      return toMemoryReviewItem(this.db.getMemoryNode(updated.id, companionId) ?? updated);
    },
    getVectorStatus: async (): Promise<MemoryVectorProductStatus> => {
      const companionId = this.db.resolveActiveCompanionId();
      const vector = await this.vectorIndex.healthCheck();
      const embedding = this.localEmbeddings.getStatus();
      const eligibleCount = this.db.listMemoryNodes(companionId).filter((memory) =>
        memory.status === 'active' && !memory.isMarkedWrong && (memory.metadata?.sensitivity ?? 'normal') === 'normal'
      ).length;
      return buildMemoryVectorProductStatus({
        embedding,
        vector,
        jobCounts: this.db.getEmbeddingJobCounts() as Record<string, number>,
        eligibleCount,
      });
    },
    installVectorModel: async () => this.debug.installLocalEmbeddingModel(),
    rebuildVectorIndex: async () => this.debug.rebuildMemoryVectors(),
  };

  journey = {`);
  source = source.replace(
    `    setAttentionMode: async (mode: 'available' | 'focused' | 'do_not_disturb') => {\n      this.db.setAppSetting('attention_mode', mode);\n      this.companionRuntime.setExplicitMode(mode);\n    },`,
    `    setAttentionMode: async (mode: 'available' | 'focused' | 'do_not_disturb') => {\n      this.db.setAppSetting('attention_mode', mode);\n      this.companionRuntime.setExplicitMode(mode);\n    },\n    getProactiveSettings: async (): Promise<ProactiveCompanionSettings> => this.companionRuntime.getProactiveSettings(),\n    updateProactiveSettings: async (input: ProactiveCompanionSettings): Promise<ProactiveCompanionSettings> =>\n      this.companionRuntime.updateProactiveSettings(input),`,
  );
  write(services, source);
}

const runtime = 'apps/desktop/electron/main/runtime/CompanionRuntime.ts';
{
  let source = read(runtime);
  source = source.replace(
    `  CompanionLifeActivity,\n  CompanionSessionPhase,`,
    `  CompanionLifeActivity,\n  CompanionProactivePrompt,\n  CompanionSessionPhase,\n  ProactiveCompanionSettings,`,
  );
  source = source.replace(
    `import { RelationshipPolicy } from './RelationshipPolicy';`,
    `import { RelationshipPolicy } from './RelationshipPolicy';\nimport { DEFAULT_PROACTIVE_COMPANION_SETTINGS, selectProactiveCompanionOpportunity } from './ProactiveCompanionPolicy';`,
  );
  source = source.replace(
    `  clearTimer?: (handle: unknown) => void;\n}`,
    `  clearTimer?: (handle: unknown) => void;\n  emitProactivePrompt?: (prompt: CompanionProactivePrompt) => void;\n}`,
  );
  source = source.replace(
    `  private readonly clearTimer: (handle: unknown) => void;`,
    `  private readonly clearTimer: (handle: unknown) => void;\n  private readonly emitProactivePrompt?: (prompt: CompanionProactivePrompt) => void;`,
  );
  source = source.replace(
    `    this.clearTimer = dependencies.clearTimer ?? ((handle) =>\n      clearTimeout(handle as ReturnType<typeof setTimeout>));`,
    `    this.clearTimer = dependencies.clearTimer ?? ((handle) =>\n      clearTimeout(handle as ReturnType<typeof setTimeout>));\n    this.emitProactivePrompt = dependencies.emitProactivePrompt;`,
  );
  source = source.replace(
    `    const next = this.life.selectNextActivity(companionId, {\n      conversationActive: sessionActive,\n      companionDragging: this.companionDragging,\n      hasPendingAction: hasPending,\n      localHour: hour\n    });\n    this.setLifeActivity(companionId, next);\n    this.reevaluatePendingActions(companionId);`,
    `    const opportunity = this.selectProactiveOpportunity(companionId, hour, sessionActive);\n    const next = opportunity?.lifeActivity ?? this.life.selectNextActivity(companionId, {\n      conversationActive: sessionActive,\n      companionDragging: this.companionDragging,\n      hasPendingAction: hasPending,\n      localHour: hour\n    });\n    this.setLifeActivity(companionId, next);\n    if (opportunity) {\n      this.recordProactivePrompt(opportunity.prompt);\n      this.emitProactivePrompt?.(opportunity.prompt);\n    }\n    this.reevaluatePendingActions(companionId);`,
  );
  source = source.replace(
    `  setExplicitMode(mode?: 'available' | 'focused' | 'do_not_disturb'): void {\n    this.explicitMode = mode;\n  }`,
    `  setExplicitMode(mode?: 'available' | 'focused' | 'do_not_disturb'): void {\n    this.explicitMode = mode;\n  }\n\n  getProactiveSettings(): ProactiveCompanionSettings {\n    const stored = this.db.getAppSetting<Partial<ProactiveCompanionSettings>>('companion.proactive.settings') ?? {};\n    return { ...DEFAULT_PROACTIVE_COMPANION_SETTINGS, ...stored };\n  }\n\n  updateProactiveSettings(input: ProactiveCompanionSettings): ProactiveCompanionSettings {\n    const modes = new Set(['off', 'quiet', 'balanced', 'active']);\n    const next: ProactiveCompanionSettings = {\n      mode: modes.has(input.mode) ? input.mode : 'balanced',\n      unfinishedTopicFollowUps: Boolean(input.unfinishedTopicFollowUps),\n      goalCheckIns: Boolean(input.goalCheckIns),\n      journeyReflections: Boolean(input.journeyReflections),\n      quietPresence: Boolean(input.quietPresence),\n    };\n    return this.db.setAppSetting('companion.proactive.settings', next);\n  }\n\n  private selectProactiveOpportunity(companionId: string, localHour: number, conversationActive: boolean) {\n    const now = this.timestamp();\n    const date = new Date(this.now()).toLocaleDateString('en-CA');\n    const key = \`companion.proactive.\${companionId}.state\`;\n    const stored = this.db.getAppSetting<{ date: string; promptCount: number; lastPromptAt?: string }>(key);\n    const promptCountToday = stored?.date === date ? stored.promptCount : 0;\n    const messages = this.db.listCompanionContext(companionId, 50);\n    const lastUserInteractionAt = messages\n      .filter((message) => message.role === 'user')\n      .map((message) => message.createdAt)\n      .sort()\n      .at(-1);\n    const activeGoalCount = this.db.listMemoryNodes(companionId).filter((memory) =>\n      memory.status === 'active'\n      && memory.memoryType === 'goal'\n      && (memory.metadata?.sensitivity ?? 'normal') === 'normal'\n    ).length;\n    const relationship = this.db.getRelationship(LOCAL_USER_ID, companionId);\n    const language = this.db.getAppSetting<'en' | 'zh-CN'>('ui.lang')\n      ?? this.db.getAppSetting<'en' | 'zh-CN'>('ai.replyLanguage')\n      ?? 'en';\n    return selectProactiveCompanionOpportunity({\n      companionId,\n      settings: this.getProactiveSettings(),\n      now,\n      localHour,\n      attentionMode: this.explicitMode ?? 'available',\n      conversationActive,\n      companionDragging: this.companionDragging,\n      companionAway: this.visualPresenceMode === 'away_visiting',\n      recentIgnoredInteractions: relationship.recentIgnoredInteractions,\n      lastUserInteractionAt,\n      lastPromptAt: stored?.lastPromptAt,\n      promptCountToday,\n      unfinishedTopic: this.db.getLatestUnfinishedTopic(companionId, LOCAL_USER_ID),\n      activeGoalCount,\n      activeJourneyCount: this.db.listActiveJourneys().length,\n      language,\n    });\n  }\n\n  private recordProactivePrompt(prompt: CompanionProactivePrompt): void {\n    const date = new Date(this.now()).toLocaleDateString('en-CA');\n    const key = \`companion.proactive.\${prompt.companionId}.state\`;\n    const stored = this.db.getAppSetting<{ date: string; promptCount: number; lastPromptAt?: string }>(key);\n    this.db.setAppSetting(key, {\n      date,\n      promptCount: stored?.date === date ? stored.promptCount + 1 : 1,\n      lastPromptAt: prompt.createdAt,\n    });\n  }`,
  );
  write(runtime, source);
}

const embedding = 'apps/desktop/electron/main/memory/localEmbeddingProvider.ts';
replaceOnce(
  embedding,
  `    return { state: this.state, modelId: this.modelId, dimensions: this.dimensions, textPolicy: EMBEDDING_TEXT_POLICY, runtimeReady: this.state === 'ready', offlineVerified: false, manifestValid: false, cachePath: this.cacheDir, error: this.error };`,
  `    return { state: this.state, modelId: this.modelId, dimensions: this.dimensions, textPolicy: EMBEDDING_TEXT_POLICY, runtimeReady: this.state === 'ready', offlineVerified: false, manifestValid: this.hasCompleteLocalModel(), cachePath: this.cacheDir, error: this.error };`,
  'embedding manifest status',
);

const categories = 'apps/desktop/renderer/src/features/settings/settingsCategoryNavigation.ts';
replaceOnce(categories, `  'privacy',\n  'appearance',`, `  'privacy',\n  'memory',\n  'appearance',`, 'settings memory category');

const settingsPage = 'apps/desktop/renderer/src/pages/SettingsPage.tsx';
{
  let source = read(settingsPage);
  source = source.replace(
    `import { SETTINGS_CATEGORIES, settingsCategoryForKey, type SettingsCategory } from '../features/settings/settingsCategoryNavigation';`,
    `import { SETTINGS_CATEGORIES, settingsCategoryForKey, type SettingsCategory } from '../features/settings/settingsCategoryNavigation';\nimport { MemoryIntelligenceSettingsCard } from '../features/memory/MemoryIntelligenceSettingsCard';\nimport { ProactiveCompanionSettingsCard } from '../features/companion/ProactiveCompanionSettingsCard';`,
  );
  source = source.replace(
    `        </PaperCard>\n        </>}\n        {category === 'appearance'`,
    `        </PaperCard>\n        <ProactiveCompanionSettingsCard />\n        </>}\n        {category === 'memory' && <><MemoryIntelligenceSettingsCard /><PaperCard title={t(lang, 'memory_review_settings_title')}><p>{t(lang, 'memory_review_settings_desc')}</p></PaperCard></>}\n        {category === 'appearance'`,
  );
  source = source.replace(
    `settings_privacy_desc: 'Memory editing stays available from the Memories page whenever something needs correction.'`,
    `settings_privacy_desc: 'Memory review and pause controls are available from the Memories page without rewriting evidence.'`,
  );
  write(settingsPage, source);
}

const companionEntry = 'apps/desktop/renderer/src/app/CompanionEntryShell.tsx';
replaceOnce(
  companionEntry,
  `    const unsubscribePerformance = window.ourCompanion.action.onPerformance((script: PerformanceScript) => {`,
  `    const unsubscribeProactive = window.ourCompanion.companion.onProactivePrompt((prompt) => {\n      if (sessionActiveRef.current) return;\n      behavior.recordSpeech();\n      speech.showTypewriter(prompt.message);\n    });\n    const unsubscribePerformance = window.ourCompanion.action.onPerformance((script: PerformanceScript) => {`,
  'renderer proactive prompt subscription',
);
replaceOnce(
  companionEntry,
  `      unsubscribeAnnounce();\n      unsubscribePerformance();`,
  `      unsubscribeAnnounce();\n      unsubscribeProactive();\n      unsubscribePerformance();`,
  'renderer proactive prompt cleanup',
);

const en = 'apps/desktop/renderer/src/i18n/en.ts';
replaceOnce(en, `  settings_category_privacy: 'Privacy',\n  settings_category_appearance: 'Appearance',`, `  settings_category_privacy: 'Privacy',\n  settings_category_memory: 'Memory',\n  settings_category_appearance: 'Appearance',`, 'english settings memory category');
replaceOnce(en, `  settings_advanced_desc: 'Network connection and protocol diagnostics are kept here to avoid exposing implementation details in everyday settings.',`, `  settings_advanced_desc: 'Network connection and protocol diagnostics are kept here to avoid exposing implementation details in everyday settings.',\n  memory_review_note: 'Review what the Companion may use without rewriting the original evidence.',\n  memory_review_controls_title: 'Review and control',\n  memory_review_controls_desc: 'Confirm reliable Memory, ask for another check, or pause anything that should not influence the Companion.',\n  memory_review_filters_label: 'Memory review filters',\n  memory_review_search_placeholder: 'Search remembered topics…',\n  memory_review_summary: '{active} active of {total} shown',\n  memory_review_load_failed: 'Unable to load Memory review.',\n  memory_review_update_failed: 'Unable to update this Memory review state.',\n  memory_review_impact_failed: 'Unable to load the influence summary.',\n  memory_review_filter_all: 'All review states',\n  memory_review_filter_confirmed: 'Confirmed',\n  memory_review_filter_needs_confirmation: 'Needs confirmation',\n  memory_review_filter_paused: 'Paused',\n  memory_type_all: 'All Memory types',\n  memory_type_user_preference: 'Preferences',\n  memory_type_goal: 'Goals',\n  memory_type_user_boundary: 'Boundaries',\n  memory_type_shared_experience: 'Shared experiences',\n  memory_type_conversation_episode: 'Conversation episodes',\n  memory_type_external_knowledge: 'Discovery knowledge',\n  memory_review_active: 'active',\n  memory_review_paused: 'paused',\n  memory_review_source: 'Source',\n  memory_review_evidence: 'Evidence',\n  memory_review_confidence: 'Confidence',\n  memory_review_last_used: 'Last used',\n  memory_review_never_used: 'Not used yet',\n  memory_review_observations: 'Observations',\n  memory_review_updated: 'Updated',\n  memory_review_disputed_notice: 'The Companion will not use this Memory until you confirm it again.',\n  memory_review_confirmation_notice: 'This Memory is paused while it waits for confirmation.',\n  memory_review_confirm: 'Confirm',\n  memory_review_ask_again: 'Ask again',\n  memory_review_pause_use: 'Pause use',\n  memory_review_view_influence: 'View influence',\n  memory_review_empty_body: 'No Memory matches the current filters.',\n  memory_review_influence_title: 'How this Memory has influenced the Companion',\n  memory_review_influence_desc: 'Only summarized counts are shown here. Detailed IDs remain in Developer Mode.',\n  memory_review_patterns: 'Patterns',\n  memory_review_interests: 'Interests',\n  memory_review_curiosity: 'Curiosity targets',\n  memory_review_research: 'Research paths',\n  memory_review_discoveries: 'Discovery candidates',\n  memory_review_insights: 'Insights',\n  memory_review_settings_title: 'Memory Review',\n  memory_review_settings_desc: 'The Memory page is a review surface. Normal users do not directly rewrite or delete durable evidence-backed Memory.',\n  memory_vector_title: 'Semantic Memory',\n  memory_vector_desc: 'Optional local Vector retrieval helps the Companion find related Memory even when your wording changes.',\n  memory_vector_status: 'Status',\n  memory_vector_model: 'Local model',\n  memory_vector_indexed: 'Indexed / eligible',\n  memory_vector_jobs: 'Active / failed jobs',\n  memory_vector_local_only: 'Processing',\n  memory_vector_yes: 'Local only',\n  memory_vector_fallback: 'Fallback',\n  memory_vector_fallback_ready: 'Keyword and structured retrieval stay available',\n  memory_vector_install: 'Install local model',\n  memory_vector_installing: 'Installing…',\n  memory_vector_rebuild: 'Rebuild index',\n  memory_vector_rebuilding: 'Rebuilding…',\n  memory_vector_privacy_note: 'Normal conversation never downloads the model automatically and no remote embedding fallback is used.',\n  memory_vector_status_failed: 'Unable to read Semantic Memory status.',\n  memory_vector_install_failed: 'Unable to install the local model.',\n  memory_vector_rebuild_failed: 'Unable to rebuild the local index.',\n  memory_vector_state_not_installed: 'Not installed',\n  memory_vector_state_installing: 'Installing',\n  memory_vector_state_indexing: 'Indexing',\n  memory_vector_state_ready: 'Ready',\n  memory_vector_state_degraded: 'Degraded',\n  memory_vector_state_error: 'Needs attention',\n  proactive_settings_title: 'Proactive companionship',\n  proactive_settings_desc: 'The Companion may offer a small check-in when there is a meaningful reason and your attention is available.',\n  proactive_settings_mode: 'Initiative level',\n  proactive_mode_off: 'Off',\n  proactive_mode_quiet: 'Quiet',\n  proactive_mode_balanced: 'Balanced',\n  proactive_mode_active: 'Active',\n  proactive_unfinished_topics: 'Follow up on unfinished conversations',\n  proactive_goal_checkins: 'Offer small Goal check-ins',\n  proactive_journey_reflections: 'Reflect on active Journeys',\n  proactive_quiet_presence: 'Allow quiet presence lines',\n  proactive_settings_guardrails: 'Focus, Do Not Disturb, conversations, late hours, cooldowns and repeated ignores always take priority.',\n  proactive_settings_load_failed: 'Unable to load proactive settings.',\n  proactive_settings_save_failed: 'Unable to save proactive settings.',`, 'english productization strings');

const zh = 'apps/desktop/renderer/src/i18n/zh-CN.ts';
replaceOnce(zh, `  "settings_category_privacy": "隐私",\n  "settings_category_appearance": "外观",`, `  "settings_category_privacy": "隐私",\n  "settings_category_memory": "记忆",\n  "settings_category_appearance": "外观",`, 'chinese settings memory category');
replaceOnce(zh, `  "settings_advanced_desc": "网络连接与协议诊断保留在这里，避免在日常设置中暴露实现细节。",`, `  "settings_advanced_desc": "网络连接与协议诊断保留在这里，避免在日常设置中暴露实现细节。",\n  "memory_review_note": "查看伙伴可以使用的记忆，同时保留原始证据不被改写。",\n  "memory_review_controls_title": "查看与控制",\n  "memory_review_controls_desc": "确认可靠的记忆、要求再次确认，或暂停不应继续影响伙伴的内容。",\n  "memory_review_filters_label": "记忆查看筛选",\n  "memory_review_search_placeholder": "搜索记住的主题…",\n  "memory_review_summary": "当前显示 {total} 条，其中 {active} 条可用",\n  "memory_review_load_failed": "无法加载记忆查看页面。",\n  "memory_review_update_failed": "无法更新这条记忆的查看状态。",\n  "memory_review_impact_failed": "无法加载影响摘要。",\n  "memory_review_filter_all": "全部查看状态",\n  "memory_review_filter_confirmed": "已确认",\n  "memory_review_filter_needs_confirmation": "需要确认",\n  "memory_review_filter_paused": "已暂停",\n  "memory_type_all": "全部记忆类型",\n  "memory_type_user_preference": "偏好",\n  "memory_type_goal": "目标",\n  "memory_type_user_boundary": "边界",\n  "memory_type_shared_experience": "共同经历",\n  "memory_type_conversation_episode": "对话片段",\n  "memory_type_external_knowledge": "发现知识",\n  "memory_review_active": "可用",\n  "memory_review_paused": "已暂停",\n  "memory_review_source": "来源",\n  "memory_review_evidence": "证据",\n  "memory_review_confidence": "置信度",\n  "memory_review_last_used": "最近使用",\n  "memory_review_never_used": "尚未使用",\n  "memory_review_observations": "观察次数",\n  "memory_review_updated": "更新时间",\n  "memory_review_disputed_notice": "在你再次确认之前，伙伴不会使用这条记忆。",\n  "memory_review_confirmation_notice": "这条记忆正在等待确认，当前已暂停使用。",\n  "memory_review_confirm": "确认",\n  "memory_review_ask_again": "再次确认",\n  "memory_review_pause_use": "暂停使用",\n  "memory_review_view_influence": "查看影响",\n  "memory_review_empty_body": "当前筛选条件下没有记忆。",\n  "memory_review_influence_title": "这条记忆如何影响伙伴",\n  "memory_review_influence_desc": "这里仅显示数量摘要；详细内部 ID 只保留在开发者模式。",\n  "memory_review_patterns": "模式",\n  "memory_review_interests": "兴趣",\n  "memory_review_curiosity": "好奇目标",\n  "memory_review_research": "研究路径",\n  "memory_review_discoveries": "发现候选",\n  "memory_review_insights": "洞察",\n  "memory_review_settings_title": "记忆查看",\n  "memory_review_settings_desc": "记忆页面用于查看与控制。普通用户不会直接改写或删除有证据来源的持久记忆。",\n  "memory_vector_title": "语义记忆",\n  "memory_vector_desc": "可选的本地向量检索可以在措辞不同的时候，帮助伙伴找到相关记忆。",\n  "memory_vector_status": "状态",\n  "memory_vector_model": "本地模型",\n  "memory_vector_indexed": "已索引 / 可索引",\n  "memory_vector_jobs": "进行中 / 失败任务",\n  "memory_vector_local_only": "处理方式",\n  "memory_vector_yes": "仅本地",\n  "memory_vector_fallback": "降级方式",\n  "memory_vector_fallback_ready": "关键词与结构化检索始终可用",\n  "memory_vector_install": "安装本地模型",\n  "memory_vector_installing": "安装中…",\n  "memory_vector_rebuild": "重建索引",\n  "memory_vector_rebuilding": "重建中…",\n  "memory_vector_privacy_note": "普通对话不会自动下载模型，也不会使用远程向量服务作为后备。",\n  "memory_vector_status_failed": "无法读取语义记忆状态。",\n  "memory_vector_install_failed": "无法安装本地模型。",\n  "memory_vector_rebuild_failed": "无法重建本地索引。",\n  "memory_vector_state_not_installed": "尚未安装",\n  "memory_vector_state_installing": "安装中",\n  "memory_vector_state_indexing": "索引中",\n  "memory_vector_state_ready": "可用",\n  "memory_vector_state_degraded": "部分可用",\n  "memory_vector_state_error": "需要处理",\n  "proactive_settings_title": "主动陪伴",\n  "proactive_settings_desc": "当有明确理由且你的注意力允许时，伙伴可以进行一次轻量的主动关心。",\n  "proactive_settings_mode": "主动程度",\n  "proactive_mode_off": "关闭",\n  "proactive_mode_quiet": "安静",\n  "proactive_mode_balanced": "平衡",\n  "proactive_mode_active": "积极",\n  "proactive_unfinished_topics": "跟进未完成的对话",\n  "proactive_goal_checkins": "进行小型目标关心",\n  "proactive_journey_reflections": "回顾进行中的旅程",\n  "proactive_quiet_presence": "允许安静的陪伴提示",\n  "proactive_settings_guardrails": "专注、请勿打扰、对话中、深夜、冷却时间和连续忽略始终优先。",\n  "proactive_settings_load_failed": "无法加载主动陪伴设置。",\n  "proactive_settings_save_failed": "无法保存主动陪伴设置。",`, 'chinese productization strings');

appendOnce('README.md', '## Memory productization roadmap', `## Memory productization roadmap

The current product surface now separates three concerns:

1. **Semantic Memory** — optional local E5 installation, index status and rebuild controls in normal Settings. SQLite remains authoritative and keyword/structured fallback remains available.
2. **Memory Review** — normal users review provenance, confidence and influence, then Confirm, Ask Again or Pause Use. Direct durable Memory CRUD is not part of the normal MVP surface.
3. **Proactive companionship** — the existing Main Process life scheduler may emit bounded unfinished-topic, Goal, Journey or quiet-presence prompts under attention, time, cooldown and daily-budget gates.

Product specifications:

- [Vector Memory productization](docs/product/vector-memory-productization.md)
- [Memory review and control](docs/product/memory-review-and-control.md)
- [Proactive Companion behavior](docs/product/proactive-companion-behavior.md)

Manual validation:

- [Vector Memory checklist](docs/checklists/vector-memory-productization.md)
- [Memory Review checklist](docs/checklists/memory-review-ui.md)
- [Proactive behavior checklist](docs/checklists/proactive-companion-behavior.md)
- [Combined release checklist](docs/checklists/memory-and-proactive-productization-release.md)`);

appendOnce('docs/product/companion-core-loop.md', '## Memory and Proactive Productization', `## Memory and Proactive Productization

\`active Memory → structured/FTS/Vector retrieval → conversation and Discovery\` remains the Memory path. Review-pending Memory is visible to the user but excluded from active use.

The existing life scheduler now also evaluates one bounded proactive opportunity. It may choose an unfinished-topic follow-up, Goal check-in, Journey reflection or quiet presence. It must pass user attention, time-of-day, cooldown, daily-budget and repeated-ignore gates before emitting a typed prompt.`);
appendOnce('docs/product/companion-state-ownership.md', '## Productized Memory and Proactivity', `## Productized Memory and Proactivity

| Field | Owner | Storage | Consumers |
| --- | --- | --- | --- |
| Memory review state | Main Memory review helper | \`memory_nodes.metadata_json\` + \`memory_status\` | Review UI, retrieval, Discovery |
| Vector product state | Main Memory service | local model, sqlite-vec and embedding jobs | Settings, Memory Context |
| Proactive preferences | Main \`CompanionRuntime\` | \`app_settings\` | Proactive policy |
| Proactive prompt decision | Main \`ProactiveCompanionPolicy\` through the existing life scheduler | prompt counters in \`app_settings\` | Renderer speech bubble |

Renderer components display these states and never create a proactive opportunity or rewrite durable Memory evidence.`);
appendOnce('docs/migrations/direction-correction-migration.md', '## Memory Review Metadata', `## Memory Review Metadata

No new table is required. \`memory_nodes.metadata_json\` may contain \`reviewState\`, \`reviewNote\` and \`reviewedAt\`. Memory awaiting confirmation uses \`memory_status = review_pending\`; confirming it restores \`active\`. Existing rows default to \`unreviewed\` and remain readable.`);
appendOnce('tasks/direction-correction/current-flow-audit.md', '## 2026-07-25 Productization Update', `## 2026-07-25 Productization Update

- Vector installation and rebuild moved from Developer-only diagnostics into a normal Memory Settings category while retaining the same local-only runtime.
- The normal Memory page no longer creates or edits durable Memory. It reviews provenance and can confirm, request confirmation or pause use.
- Proactive prompts are selected only by the existing Main Process life scheduler; no Renderer timer or secondary decision authority was added.
- Review-pending Memory is excluded from active retrieval, Vector eligibility and future cognitive recomputation.`);
appendOnce('tasks/direction-correction/legacy-removal-table.md', '| Normal Memory editor |', `| Normal Memory editor | Free-form Add/Edit/Delete in Memory tab | Evidence-preserving review controls | Normal-user editor UI | No schema migration; existing APIs remain Developer/internal | Memory page has no CRUD controls |
| Developer-only Vector controls | Model install/rebuild only in Observatory | Normal Memory Settings + Developer diagnostics | Developer-only product dependency | None | First-run and fallback manual checklist |
| Random-only life activity | Activity selection without meaningful opportunity | Existing scheduler + bounded proactive policy | Any second Renderer scheduler | App settings only | Proactive policy and manual time-controller tests |`);
appendOnce('tasks/direction-correction/implementation-log.md', '## Phase 6 — Memory and Proactive Productization', `## Phase 6 — Memory and Proactive Productization

| Area | Old surface | New surface | Verification |
| --- | --- | --- | --- |
| Vector Memory | Developer diagnostics only | Normal Settings status/install/rebuild with explicit fallback | Vector status tests + packaged checklist |
| Memory management | Free-form normal-user editor | Read-only review, confirm, ask again and pause use | Review transition tests + UI checklist |
| Proactive behavior | Random life activity + Discovery only | Existing scheduler evaluates unfinished topic, Goal, Journey and quiet presence | Policy tests + runtime-time checklist |
| Documentation | Product decisions scattered across task briefs | Product specs, state ownership, core loop, README and release checklists | Documentation review |`);
