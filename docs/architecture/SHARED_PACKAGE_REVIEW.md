# Shared Package Review

Complete audit of all exports from `packages/shared`.

---

## Export Inventory

### Core (3 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `DEFAULT_CHARACTER_ID` | `const` | Default character identifier ('ann') |
| `nowIso()` | `function` | Returns current ISO timestamp |
| `createId(prefix)` | `function` | Generates prefixed unique IDs |

### Character (22 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `CoreState` | `type` | Character runtime states (idle, walking, etc.) |
| `EmotionName` | `type` | Emotion categories (neutral, curious, etc.) |
| `Intent` | `type` | Character intentions (wandering, waiting, etc.) |
| `EmotionState` | `interface` | Numeric emotion weights |
| `CharacterRuntimeState` | `interface` | Full character state |
| `CharacterProfile` | `interface` | Character identity and personality |
| `CharacterBehaviorSettings` | `interface` | Movement behavior config |
| `UpdateCharacterBehaviorSettingsInput` | `interface` | Settings update input |
| `AnnMood` | `type` (models) | Simplified mood categories |
| `AnnIntent` | `type` (models) | Simplified intent categories |
| `CharacterState` | `interface` (models) | Simplified character state |
| `BehaviourState` | `type` (models) | Behaviour categories |
| `AnimationKey` | `type` (models) | Animation identifiers |
| `AnimationRequest` | `interface` (models) | Animation request payload |
| `PerformanceStep` | `interface` (models) | Animation step |
| `PerformanceScript` | `interface` (models) | Animation sequence |
| `PersonalityPreset` | `interface` (models) | Character personality config |
| `CharacterAsset` | `interface` (models) | Asset definition |
| `AssetManifest` | `interface` (models) | Asset collection |
| `AnimationManifest` | `interface` (models) | Animation mappings |
| `CharacterPackage` | `interface` (models) | Complete character package |
| `CharacterRuntimeDescriptor` | `interface` (models) | Runtime character info |

### Memory (9 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `MemoryNodeType` | `type` | Node types (topic, discovery, etc.) |
| `MemoryRelation` | `type` | Edge relation types |
| `MemoryNode` | `interface` | Memory graph node |
| `MemoryEdge` | `interface` | Memory graph edge |
| `MemoryGraph` | `interface` | Complete memory graph |
| `CreateMemoryNodeInput` | `interface` | Node creation input |
| `UpdateMemoryNodeInput` | `interface` | Node update input |
| `CreateMemoryEdgeInput` | `interface` | Edge creation input |
| `MemorySummary` | `interface` | LLM-generated memory summary |

### Discovery (20 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `DiscoverySource` | `type` | Source platforms (github, reddit, etc.) |
| `DiscoveryStatus` | `type` | Lifecycle states |
| `NormalizedDiscovery` | `interface` | Normalized discovery data |
| `DiscoveryScores` | `interface` | Scoring metrics |
| `Discovery` | `interface` | Complete discovery |
| `DiscoveryAgentType` | `type` | Agent roles |
| `ExplorationPlan` | `interface` | Exploration strategy |
| `DiscoveryCandidate` | `interface` | Candidate discovery |
| `DiscoveryFeedbackValue` | `type` | Feedback options |
| `DiscoveryFeedback` | `interface` | User feedback |
| `DiscoveryFeedInput` | `interface` | Feed query input |
| `AddDiscoveryToJourneyInput` | `interface` | Journey addition input |
| `DiscoveryReason` | `interface` | AI-generated reason |
| `DiscoveryAnnouncePayload` | `interface` | Announcement payload |
| `DiscoveryOrigin` | `interface` (models) | Origin metadata |
| `DuplicateResult` | `type` (models) | Dedup check result |
| `DiscoveryPresentationCard` | `interface` (models) | UI card |
| `DiscoveryUnderstanding` | `interface` (models) | AI understanding |

### Decision (7 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `CompanionDecision` | `interface` | Action decision |
| `AttentionAssessment` | `interface` | Attention gate result |
| `UserContext` | `interface` | User state |
| `CompanionContext` | `interface` | Companion state |
| `DecisionInput` | `interface` | Decision pipeline input |
| `CompanionDecisionAction` | `type` (models) | Decision action types |
| `AttentionAssessment` | `interface` (models) | Assessment result |

### Curiosity (8 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `CuriositySource` | `type` | Trigger sources |
| `ExplorationType` | `type` | Exploration strategies |
| `CuriosityTarget` | `interface` | What to explore |
| `CuriosityGap` | `interface` (models) | Knowledge gap |
| `CuriosityGapMatch` | `interface` (models) | Gap match result |
| `CuriosityAssessment` | `interface` (models) | Curiosity scoring |
| `CuriosityDebt` | `interface` (models) | Outstanding curiosity |
| `CuriosityInvestment` | `interface` (models) | Investment tracking |

### Insight (10 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `CompanionInsightType` | `type` | Insight categories |
| `CompanionInsight` | `interface` | Companion insight |
| `ExplorationState` | `type` | Cycle states |
| `ExplorationTrigger` | `type` | Cycle triggers |
| `ExplorationCycle` | `interface` | Exploration cycle |
| `ExplorationLoopEvent` | `interface` | Cycle event |
| `StartExplorationInput` | `interface` | Start input |
| `SubmitDiscoveryFeedbackInput` | `interface` | Feedback input |
| `ExplorationCycleResult` | `interface` | Cycle result |
| `Insight` | `interface` (models) | Knowledge insight |

### Graph (12 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `PatternType` | `type` | Pattern categories |
| `PatternEvidence` | `interface` | Pattern evidence |
| `Pattern` | `interface` | Detected pattern |
| `InterestNodeType` | `type` | Interest categories |
| `InterestNode` | `interface` | Interest graph node |
| `InterestEdge` | `interface` | Interest graph edge |
| `InterestGraph` | `interface` | Complete interest graph |
| `Concept` | `interface` (models) | Knowledge concept |
| `KnowledgeStatus` | `type` (models) | Knowledge lifecycle |
| `Knowledge` | `interface` (models) | Knowledge item |
| `KnowledgeGraph` | `interface` (models) | Knowledge graph |
| `Reflection` | `interface` (models) | Growth reflection |

### Journey (4 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `Journey` | `interface` | Exploration journey |
| `JourneyMilestone` | `interface` | Journey milestone |
| `CreateJourneyInput` | `interface` | Journey creation |
| `AddJourneyMilestoneInput` | `interface` | Milestone addition |

### Diary (1 export)
| Export | Type | Purpose |
|--------|------|---------|
| `DiaryEntry` | `interface` | Diary/reflection entry |

### Action (8 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `ToolName` | `type` | Tool identifiers |
| `ToolExecuteInput` | `interface` | Tool execution input |
| `ToolPreview` | `interface` | Tool preview result |
| `ToolExecutionResult` | `interface` | Tool execution result |
| `ToolIntent` | `interface` | LLM tool intent |
| `PermissionScope` | `type` (models) | Permission categories |
| `ActionPlan` | `interface` (models) | Action plan |
| `ActionRunResult` | `type` (models) | Execution result |

### AI (18 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `ChatInput` | `interface` | Chat message input |
| `CompanionSessionPhase` | `type` | Session phases |
| `TranscribeAudioInput` | `interface` | Audio transcription input |
| `CompanionTurnInput` | `interface` | Companion turn input |
| `COMPANION_CHAT_RETENTION_DAYS` | `const` | Chat retention (7 days) |
| `COMPANION_CHAT_CONTEXT_LIMIT` | `const` | Context limit (12 messages) |
| `CompanionMessageRole` | `type` | Message roles |
| `CompanionMessageSource` | `type` | Message sources |
| `CompanionMessageStatus` | `type` | Message status |
| `CompanionMessage` | `interface` | Chat message |
| `CompanionHistoryInput` | `interface` | History query |
| `CompanionAppendMessageInput` | `interface` | Message append |
| `CompanionReplyLanguage` | `type` | Reply languages |
| `UiLang` | `type` | UI languages |
| `AiDebugEntry` | `interface` | AI debug log |
| `AiSettings` | `interface` | AI configuration |
| `UpdateAiSettingsInput` | `interface` | Settings update |

### Speech (3 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `SpeechStatus` | `interface` | Whisper status |
| `SpeechSettings` | `interface` | Speech settings |
| `UpdateSpeechSettingsInput` | `interface` | Settings update |

### API (12 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `WindowBounds` | `interface` | Window dimensions |
| `WindowMoveInput` | `interface` | Window move input |
| `WindowMousePassthroughInput` | `interface` | Mouse passthrough |
| `DebugDataResetTarget` | `type` | Reset targets |
| `DebugDataResetInput` | `interface` | Reset input |
| `DebugDataResetResult` | `interface` | Reset result |
| `FoundationEventLogInput` | `interface` | Event log query |
| `EngineSnapshotInput` | `interface` | Snapshot query |
| `EngineSnapshot` | `interface` | Full engine state |
| `OurCompanionApi` | `interface` | Renderer API contract |
| `ValidationIssue` | `interface` (models) | Validation issue |
| `ValidationResult` | `interface` (models) | Validation result |

### Interfaces (12 exports)
| Export | Type | Purpose |
|--------|------|---------|
| `SignalEngine` | `interface` | Signal capture/normalize |
| `ConceptMatchInput` | `interface` | Concept matching input |
| `ConceptMatchResult` | `type` | Match result |
| `ConceptMatcher` | `interface` | Concept matching |
| `MemoryReader` | `interface` | Memory access |
| `KnowledgeReader` | `interface` | Knowledge access |
| `LlmTextRequest` | `interface` | LLM text request |
| `LlmJsonRequest` | `interface` | LLM JSON request |
| `LlmProvider` | `interface` | LLM provider |
| `EmbeddingRequest` | `interface` | Embedding request |
| `EmbeddingResult` | `interface` | Embedding result |
| `EmbeddingProvider` | `interface` | Embedding provider |
| `SourceProvider` | `interface` | Source data provider |
| `CommandExecutor` | `interface` | Command execution |
| `ActionOrchestratorDeps` | `interface` | Orchestrator deps |

---

## Summary

| Category | Count |
|----------|-------|
| Core utilities | 3 |
| Character | 22 |
| Memory | 9 |
| Discovery | 20 |
| Decision | 7 |
| Curiosity | 8 |
| Insight | 10 |
| Graph | 12 |
| Journey | 4 |
| Diary | 1 |
| Action | 8 |
| AI | 18 |
| Speech | 3 |
| API | 12 |
| Interfaces | 15 |
| **Total** | **~152** |
