# Engine Boundary Map

Each engine's responsibilities, public APIs, inputs, outputs, dependencies, and event contracts.

---

## shared

**Responsibility**: Domain types, utility functions, constants. The type foundation for every engine.

**Public APIs**:
- `createId(prefix: string): string`
- `nowIso(): string`
- `DEFAULT_CHARACTER_ID: 'ann'`
- `COMPANION_CHAT_RETENTION_DAYS: 7`
- `COMPANION_CHAT_CONTEXT_LIMIT: 12`

**Key Types Exported**:
- Character: `CoreState`, `EmotionState`, `EmotionName`, `Intent`, `CharacterRuntimeState`, `CharacterProfile`, `AnnMood`, `AnnIntent`, `CharacterState`, `BehaviourState`, `AnimationKey`, `AnimationRequest`, `PerformanceScript`, `CharacterPackage`, `CharacterRuntimeDescriptor`, `ValidationResult`
- Memory: `MemoryNode`, `MemoryEdge`, `MemoryGraph`, `MemoryNodeType`, `MemoryRelation`, `CreateMemoryNodeInput`, `UpdateMemoryNodeInput`, `CreateMemoryEdgeInput`
- Discovery: `Discovery`, `NormalizedDiscovery`, `DiscoveryScores`, `DiscoverySource`, `DiscoveryStatus`, `DiscoveryCandidate`, `DiscoveryFeedback`, `DiscoveryFeedbackValue`
- Pattern/Interest: `Pattern`, `PatternType`, `PatternEvidence`, `InterestNode`, `InterestEdge`, `InterestGraph`, `InterestNodeType`
- Curiosity: `CuriosityTarget`, `CuriositySource`, `ExplorationType`, `CuriosityAssessment`
- Exploration: `ExplorationCycle`, `ExplorationLoopEvent`, `ExplorationState`, `ExplorationTrigger`, `ExplorationPlan`, `ExplorationCycleResult`
- Insight: `CompanionInsight`, `CompanionInsightType`
- Decision: `CompanionDecision`, `AttentionAssessment`, `DecisionInput`, `UserContext`, `CompanionContext`
- Journey: `Journey`, `JourneyMilestone`, `CreateJourneyInput`, `AddJourneyMilestoneInput`
- Diary: `DiaryEntry`
- Tool/Action: `ToolName`, `ToolExecuteInput`, `ToolPreview`, `ToolExecutionResult`, `ActionPlan`, `ActionStep`, `ActionPermissionState`, `ActionRunResult`, `PermissionScope`
- AI: `AiSettings`, `AiDebugEntry`, `ChatInput`, `UpdateAiSettingsInput`, `DiscoveryReason`, `MemorySummary`, `ToolIntent`
- Speech: `SpeechStatus`, `SpeechSettings`, `TranscribeAudioInput`
- Companion: `CompanionMessage`, `CompanionMessageRole`, `CompanionMessageSource`, `CompanionMessageStatus`, `CompanionHistoryInput`, `CompanionAppendMessageInput`, `CompanionTurnInput`, `CompanionSessionPhase`
- API: `OurCompanionApi` (full renderer API contract)
- Interfaces: `SignalEngine`, `ConceptMatcher`, `LlmProvider`, `EmbeddingProvider`, `SourceProvider`, `CommandExecutor`, `ActionPlanner`, `PermissionManager`, `ActionOrchestrator`, `ActionOrchestratorDeps`

**Dependencies**: None (root package)

**Events Published**: None

**Events Consumed**: None

---

## character-engine

**Responsibility**: Character runtime state management, emotion system, intent selection, animation mapping, character package validation/registry, performance scripting.

**Public APIs**:
- `neutralEmotion: EmotionState` — default neutral emotion values
- `requiredCreatorAnimations: string[]` — mandatory animation names
- `defaultAnnPackage: CharacterPackage` — default Ann character definition
- `createInitialCharacterState(characterId?): CharacterRuntimeState`
- `validateCharacterPackage(pkg): ValidationResult`
- `CharacterPackageRegistry` — class for registering/querying character packages
- `loadCharacterPackage(pkg, registry?)` — validate, register, activate, return runtime descriptor
- `exportCharacterPackage(pkg): string` / `importCharacterPackage(serialized): CharacterPackage`
- `createRuntimeDescriptor(pkg): CharacterRuntimeDescriptor`
- `dominantEmotion(emotion): EmotionName`
- `decayEmotion(emotion, date?): EmotionState`
- `applyEmotionEvent(emotion, event): EmotionState`
- `selectIntent(state, context): Intent`
- `transitionState(current, intent, emotion): CoreState`
- `animationFor(intent, state, emotion, availableAnimations): string`
- `advanceCharacter(state, context): CharacterRuntimeState`
- `emotionForDecision(decision, context?): AnnMood`
- `behaviourForDecision(decision): BehaviourState`
- `resolveCharacterState(decision, context?): CharacterState`
- `nextAnimationState(current, requested?): AnimationKey`
- `animationKeyForBehaviour(behaviour, mood): AnimationKey`
- `planAnimationRequest(input): AnimationRequest`
- `planPerformanceScript(actionId, outcome?): PerformanceScript`
- `getDiscoveryFetchDelay`, `getDiscoveryFetchDelayRange`, `DISCOVERY_STARTUP_DELAY_MS`

**Inputs**: `CharacterRuntimeState`, `IntentContext`, `EmotionEvent`, `CharacterPackage`, `CompanionDecision`

**Outputs**: Updated `CharacterRuntimeState`, `AnimationRequest`, `PerformanceScript`, `ValidationResult`

**Dependencies**: `@our-companion/shared`

**Events Published**: None (pure functions)

**Events Consumed**: None

---

## decision-engine

**Responsibility**: Attention gating (should Ann interrupt?) and companion action decision-making (speak/remember/ignore/queue).

**Public APIs**:
- `assessAttention(input: AssessAttentionInput): AttentionAssessment`
- `decideCompanionAction(input: DecisionInput): CompanionDecision`

**Inputs**: `AssessAttentionInput` (target info, user context, companion context), `DecisionInput` (discovery, curiosity, attention, user/companion context)

**Outputs**: `AttentionAssessment` (deservesAttention, cost, value, reason), `CompanionDecision` (action, timing, priority, reason)

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## curiosity-engine

**Responsibility**: Generating curiosity targets from memory, patterns, and interests. Scoring and assessing curiosity opportunities.

**Public APIs**:
- `generateCuriosityTargets(input: GenerateCuriosityTargetsInput): CuriosityTarget[]`
- `assessCuriosity(input: AssessCuriosityInput): CuriosityAssessment`

**Inputs**: `GenerateCuriosityTargetsInput` (character state, memory, patterns, interest graph, feedback), `AssessCuriosityInput` (target, growth, gaps, novelty)

**Outputs**: `CuriosityTarget[]` (topic, description, source, explorationType, priority, confidence), `CuriosityAssessment`

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## pattern-engine

**Responsibility**: Detecting patterns across memory nodes, journey milestones, discovery history, and user feedback. Scoring pattern strength.

**Public APIs**:
- `detectPatterns(input: DetectPatternsInput): Pattern[]`
- `scorePattern(input): PatternScore`

**Inputs**: `DetectPatternsInput` (userId, memoryNodes, journeyMilestones, discoveryHistory, feedbackHistory)

**Outputs**: `Pattern[]` (type, title, summary, confidence, strength, evidence)

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## discovery-engine

**Responsibility**: Signal capture/normalization, discovery scoring, deduplication, fallback connectors, exploration planning, discovery agent execution.

**Public APIs**:
- `captureSignal(input): Signal`
- `normalizeSignal(signal): NormalizedSignal`
- `normalizeDiscoveryUrl(url?): string`
- `fingerprintDiscovery(input): string`
- `qualityScoreForSignal(signal): number`
- `createSignalEngine(): SignalEngine`
- `signalFromNormalizedDiscovery(discovery): Signal`
- `passesDiscoveryQuality(signal, minimumScore?): boolean`
- `checkDuplicateDiscovery(candidate, existing): DuplicateResult`
- `discoveryOriginForSignal(signal): DiscoveryOrigin`
- `scoreDiscovery(item, context): DiscoveryScores`
- `createFallbackConnector(source): DiscoveryConnector`
- `planExploration(target: CuriosityTarget): ExplorationPlan`
- `runDiscoveryAgents(input): DiscoveryCandidate[]`
- `runDiscoveryPipeline(connectors, rankingContext, dailySharedCount): Discovery[]`

**Inputs**: `CuriosityTarget`, `RankingContext`, `DiscoveryConnector[]`

**Outputs**: `ExplorationPlan`, `DiscoveryCandidate[]`, `Discovery[]`

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## insight-engine

**Responsibility**: Generating insights from discovery candidates, patterns, and curiosity targets. Selecting the primary insight to present.

**Public APIs**:
- `generateInsights(input: GenerateInsightsInput): CompanionInsight[]`
- `selectPrimaryInsight(insights: CompanionInsight[]): CompanionInsight | undefined`
- `scoreInsight(input): InsightSelectionScore`
- `narrateInsight(insight): string`
- `generateCognitiveInsight(input): CompanionInsight | undefined`

**Inputs**: `GenerateInsightsInput` (memory, patterns, interest graph, curiosity target, discovery candidates)

**Outputs**: `CompanionInsight[]`, `InsightSelectionScore`

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## memory-engine

**Responsibility**: Memory node/edge CRUD helpers, memory graph building, interest graph construction, memory search.

**Public APIs**:
- `createMemoryNode(input): MemoryNode`
- `updateMemoryNode(existing, input): MemoryNode`
- `createMemoryEdge(input): MemoryEdge`
- `searchMemory(nodes, query): MemoryNode[]`
- `graphFromMemory(nodes, edges, query?): MemoryGraph`
- `buildInterestGraph(input): InterestGraph`
- `matchConcept(input, existing): ConceptMatchResult`

**Inputs**: `CreateMemoryNodeInput`, `UpdateMemoryNodeInput`, `CreateMemoryEdgeInput`, `BuildInterestGraphInput`

**Outputs**: `MemoryNode`, `MemoryEdge`, `MemoryGraph`, `InterestGraph`

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## journey-engine

**Responsibility**: Journey and milestone creation helpers.

**Public APIs**:
- `createJourney(input): Journey`
- `createJourneyFromConcepts(input): Journey`
- `createJourneyMilestone(input): JourneyMilestone`
- `createMilestoneFromInsight(input): JourneyMilestone`

**Inputs**: `CreateJourneyInput`, `AddJourneyMilestoneInput`

**Outputs**: `Journey`, `JourneyMilestone`

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## diary-engine

**Responsibility**: Daily diary generation and growth reflections.

**Public APIs**:
- `generateDailyDiary(context: DiaryContext): DiaryEntry`
- `generateGrowthReflection(input): Reflection`

**Inputs**: `DiaryContext` (milestones, discoveries, tasks, memory changes)

**Outputs**: `DiaryEntry`, `Reflection`

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## action-engine

**Responsibility**: Converting user text into action plans (rule-based or LLM), permission resolution, action orchestration with performance scripting.

**Public APIs**:
- `defaultPermissions(): ActionPermissionState`
- `planActionFromRules(text): ActionPlan | undefined`
- `planAction(text, llmDeps?): ActionPlan | undefined`
- `runActionPlan(plan, deps, correlationId?): Promise<ActionRunResult>`
- `directPerformance(actionId, outcome?): PerformanceScript`
- `executeActionStep(toolName, args, adapters): Promise<{status, errorMessage?, blockedReason?}>`

**Inputs**: User text command, `ActionOrchestratorDeps`

**Outputs**: `ActionPlan`, `ActionRunResult`, `PerformanceScript`

**Dependencies**: `@our-companion/shared`, `@our-companion/character-engine` (for `planPerformanceScript`)

**Events Published**: None

**Events Consumed**: None

---

## tool-engine

**Responsibility**: Tool safety checks, preview, and execution orchestration with injected adapters.

**Public APIs**:
- `isBlockedToolIntent(input): string | undefined`
- `requiresConfirmation(input): boolean`
- `previewTool(input): ToolPreview`
- `executeTool(input, adapters): Promise<ToolExecutionResult>`

**Inputs**: `ToolExecuteInput`, tool adapters

**Outputs**: `ToolPreview`, `ToolExecutionResult`

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## ai-engine

**Responsibility**: DeepSeek API client, JSON response parsing, AI output validation schemas.

**Public APIs**:
- `getConfiguredModel(env?): string`
- `normalizeDeepSeekModel(model): string`
- `normalizeDeepSeekEndpoint(endpoint): string`
- `DeepSeekClient` — class with `chat()`, `chatDebug()` methods
- `DeepSeekRequestError` — error class with request/response bodies
- `discoveryReasonSchema`, `memorySummarySchema`, `toolIntentSchema`, `actionPlanSchema` — Zod schemas
- `validateDiscoveryReason(raw): DiscoveryReason | undefined`
- `validateActionPlan(raw): ActionPlanLlmResult | undefined`
- `validateMemorySummary(raw): MemorySummary | undefined`
- `validateToolIntent(raw): ToolIntent | undefined`

**Inputs**: API key, model, endpoint, message arrays

**Outputs**: Chat completions, validated JSON responses

**Dependencies**: `@our-companion/shared`, `zod`

**Events Published**: None

**Events Consumed**: None

---

## speech-engine

**Responsibility**: Whisper model status checking, audio format conversion (ffmpeg), transcription.

**Public APIs**:
- `getWhisperStatus(userDataRoot): Promise<WhisperStatus>`
- `getWhisperPaths(userDataRoot)`
- `prepareWavFromRecording(inputPath, outputPath): Promise<void>`
- `transcribeAudioFile(wavPath, options): Promise<TranscribeResult>`
- `transcribeRecording(input: TranscribeRecordingInput): Promise<TranscribeResult>`
- `getDefaultUserDataRoot(): string`

**Inputs**: Audio buffer, user data root path, Whisper settings

**Outputs**: `WhisperStatus`, `TranscribeResult` (text, language)

**Dependencies**: `@our-companion/shared`, `ffmpeg-static`, `@kutalia/whisper-node-addon`

**Events Published**: None

**Events Consumed**: None

---

## society-engine

**Responsibility**: Companion trust scoring, knowledge sharing permissions, knowledge exchange packaging, sync conflict detection.

**Public APIs**:
- `scoreTrust(profile): number`
- `canShareKnowledge(input): boolean`
- `createKnowledgeExchangePackage(input): KnowledgeExchangePackage | undefined`
- `createCompanionIdentity(input): CompanionIdentity`
- `createTrustProfile(input): TrustProfile`
- `detectSyncConflicts(local, remote): SyncConflict[]`
- `mergeSyncEnvelopes(local, remote): SyncEnvelope`

**Inputs**: `TrustProfile`, `CompanionIdentity`, knowledge arrays

**Outputs**: Trust scores, exchange packages, sync envelopes

**Dependencies**: `@our-companion/shared`

**Events Published**: None

**Events Consumed**: None

---

## database

**Responsibility**: SQLite-backed local storage, schema creation, CRUD operations for all domain entities, seed data.

**Public APIs** (DatabaseService class):
- Character: `getCharacterState`, `saveCharacterState`, `getActiveCharacters`, `setPrimaryCharacter`, `getCharacterBehaviorRules`
- Discovery: `insertDiscovery`, `getDiscovery`, `listDiscoveries`, `updateDiscoveryStatus`, `countSharedToday`
- Memory: `insertMemoryNode`, `getMemoryNode`, `listMemoryNodes`, `updateMemoryNode`, `deleteMemoryNode`, `insertMemoryEdge`, `listMemoryEdges`
- Journey: `insertJourney`, `listActiveJourneys`, `insertMilestone`, `listMilestones`
- Diary: `insertDiary`, `listDiaryEntries`
- Exploration: `insertExplorationCycle`, `getCurrentExplorationCycle`, `listExplorationCycles`, `insertExplorationEvent`, `insertCuriosityTarget`, `insertExplorationPlan`, `insertDiscoveryCandidate`, `insertCompanionInsight`, `insertPattern`, `upsertInterestGraph`, `insertDiscoveryFeedback`, `listDiscoveryFeedback`
- Companion: `insertCompanionMessage`, `listCompanionMessages`, `listCompanionContext`, `clearCompanionMessages`
- Settings: `getAppSetting`, `setAppSetting`, `getActionPermissions`, `setActionPermissions`
- Debug: `resetDebugData`

**Dependencies**: `@our-companion/shared`, `@our-companion/character-engine`, `node:sqlite`

**Events Published**: None

**Events Consumed**: None

---

## sdk

**Responsibility**: Plugin system — manifest validation, lifecycle management, plugin loading, event bus integration for plugins.

**Public APIs**:
- `validatePluginManifest(manifest): PluginValidationResult`
- `loadPlugin(manifest, module, eventBus): LoadedPlugin`
- `activatePlugin(plugin): void`
- `suspendPlugin(plugin): void`
- `unloadPlugin(plugin): void`

**Inputs**: `PluginManifest`, `PluginModule`

**Outputs**: `LoadedPlugin`, `PluginValidationResult`

**Dependencies**: `@our-companion/shared`, `@our-companion/event-bus`

**Events Published**: None (plugins emit via event bus)

**Events Consumed**: None

---

## platform/event-bus

**Responsibility**: In-process pub/sub event system for cross-module communication.

**Public APIs**:
- `createEvent(input): BaseEvent`
- `globalEventBus: InProcessEventBus` (singleton)
- `InProcessEventBus` class: `emit`, `subscribe`, `unsubscribe`

**Inputs**: `BaseEvent`, `EventHandler`

**Outputs**: Event dispatch to subscribers

**Dependencies**: `@our-companion/shared`

**Events Published**: All events emitted via `emit()`

**Events Consumed**: All events subscribed via `subscribe()`
