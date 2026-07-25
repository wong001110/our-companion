# Current Flow Audit — Direction Correction

Generated as part of Phase 1. Maps active production flows before legacy removal.

## Single-Owner Decisions (Target)

| Domain | Canonical Owner (post-correction) | Current Owner |
|--------|-----------------------------------|---------------|
| Active companion | `companions.is_primary` via `getPrimaryCompanion()` | Split: `companionNew:*` + legacy `character:*` + `DEFAULT_CHARACTER_ID` |
| Decision output | `CompanionBrain` + policy gates in main process | V1 `decideCompanionAction` (logging) + renderer `decideCompanionBehavior` |
| Conversation phase | Main `ConversationRuntime` + `companion:reportSessionPhase` | Renderer `useCompanionSession` + ephemeral `companionSessionPhase` |
| Memory writes | Typed `memory_nodes` with companion scope | Untyped graph writes; V2 `MemoryEngine` unwired |
| Animation intent | Main character runtime `animationIntent` on state | `CompanionCanvas.stateToIntent` + `App.idleAnimation` + `character-engine.animationFor` |

---

## Flow Maps

### 1. Companion Startup

```
App ready (index.ts)
→ DatabaseService init (SQLite or memory fallback)
→ registerIpcHandlers (character, companionNew, discovery, companion, memory, …)
→ attachAutonomyBroadcasters (direct IPC — DUPLICATE with ElectronIpcBroadcaster)
→ ElectronIpcBroadcaster.start (event bus → IPC)
→ DiscoveryScheduler.start
→ Companion window loads App.tsx
→ companionNew.getPrimary() → activeCompanion React state
→ character.getState() + onStateChange subscription
→ Visible: transparent overlay companion appears
```

### 2. Companion Creation

```
Creation window → companionNew.create
→ services.companionNew.create → db.insertCompanion
→ creation:completed IPC → companion window reload
→ companionNew.setPrimary (optional)
Visible: new companion profile; Ann-first if builtin
```

### 3. Active Companion Selection

```
Panel or switch flow → companionNew.setPrimary / character:setPrimary (DUPLICATE)
→ companions.is_primary OR characters.is_primary (DUPLICATE tables)
→ App.tsx activeCompanion state refresh
Visible: selected companion assets and name
```

### 4. Conversation

```
User text/voice → companion.turn (main)
→ listCompanionContext (flat messages, no session FK)
→ DeepSeek chat → insertCompanionMessage
Renderer: useCompanionSession sets phase locally
→ companion.reportSessionPhase (main gate for discovery)
Visible: speech bubble, listening animation
```

### 5. Speech Input

```
Whisper transcribe → companion.turn (source: voice)
→ same as conversation flow
Visible: transcribed reply from companion
```

### 6. Memory Creation

```
Paths: memory:createNode IPC, discovery.addToJourney, panel MemoryView.saveMemory,
       submitDiscoveryFeedback (saved)
→ db.insertMemoryNode (no companion_id scope)
Visible: memory graph in panel
```

### 7. Memory Retrieval

```
memory:getGraph, memory:search
→ graphFromMemory / searchMemory (global, not companion-scoped)
Visible: panel Memory tab
```

### 8. Discovery Generation

```
DiscoveryScheduler.tick
→ runDiscoveryRefresh OR runAutonomousExploration
→ runDiscoveryPipeline / curiosity+agents+insights
→ applyDailyCap (status: shared) — NOT gated by brain decision
→ emitDecisionEventsForDiscovery (logging only)
Visible: none until presentation
```

### 9. Discovery Queueing

```
DiscoveryShareOrchestrator.enqueue (main)
DiscoveryQueueManager.enqueue (renderer, from discovery:announce IPC)
DUPLICATE queues across processes
```

### 10. Discovery Presentation

```
Path A (scheduler): orchestrator.announceDiscovery
  → advanceCharacter animation loop
  → DiscoveryReadyToShare + CompanionMessageQueued events
  → ElectronIpcBroadcaster → discovery:announce
  → renderer decideCompanionBehavior → soft hint / present

Path B (autonomy): runAutonomousExploration
  → discoveryAnnounceBroadcaster DIRECT (bypass orchestrator)
  → ALSO CompanionMessageQueued on event bus (DOUBLE announce)
Visible: discovery card + speech
```

### 11. User Feedback

```
discovery:markInterested / markNotInterested
autonomy:submitFeedback
→ discovery_feedback table
→ partial memory write on 'saved'
Visible: card dismissed; preference stored
```

### 12. Decision Making

```
Discovery created → decideCompanionAction (V1) → foundation events ONLY
Renderer 30s poll → decideCompanionBehavior → UI timing
CompanionBrain V2 → tests only
```

### 13. Character State Updates

```
advanceCharacter / setAutonomyCharacterState / saveCharacterState
→ character_state table
→ characterBroadcaster DIRECT + CharacterStateChanged event (DOUBLE)
Visible: animation change
```

### 14. Animation Selection

```
character:stateChanged → App.applyState
CompanionCanvas.stateToIntent (when no override)
App.idleAnimation override (idle only)
CSS facing flip (renderer only)
```

### 15. Journey Updates

```
discovery.addToJourney → createJourneyMilestone + memory node
journey:create IPC
Visible: Journey panel timeline
```

### 16. Diary Generation

```
diary.generate → generateDailyDiary (diary-engine)
→ diary_entries (character_id, no perspective field)
Visible: panel diary section
```

### 17. Tool/Action Execution

```
action:plan → action:execute
→ tool-engine with permission checks
Visible: action result in panel/chat
```

### 18. Panel Navigation

```
PanelDashboard tabs: home, discovery, journey, memory, chat, ask, settings
ChatView + AskView (DUPLICATE lightweight chat)
CVK/Observatory in debug features
```

### 19. Debug and Simulation

```
discovery:simulate* IPC, CVKPanel, foundation event log
Leaks: debugOverride in CompanionBehaviorController affects production renderer
```

---

## Duplicate or Competing Flows

1. **character:* vs companionNew:*** — two primary-setters, two tables
2. **decideCompanionAction vs decideCompanionBehavior vs CompanionBrain** — three decision paths
3. **DiscoveryShareOrchestrator vs direct autonomy broadcast** — two presentation paths
4. **ElectronIpcBroadcaster vs attachAutonomyBroadcasters** — double IPC for state and announce
5. **MemoryNode SQLite vs MemoryEngine V2** — two memory architectures
6. **useCompanionSession vs ConversationRuntime** — two conversation models
7. **Renderer discovery queue vs main orchestrator queue** — two queues
8. **getActiveCharacters vs getPrimaryCompanion** — discovery uses legacy characters[0]

---

## Timers Inventory

| Timer | Location | Purpose |
|-------|----------|---------|
| DiscoveryScheduler | main | Fetch/share discoveries 45–180 min |
| Walk random | App.tsx renderer | Ambient movement |
| Idle rotation | App.tsx renderer | Idle animation variety |
| Ambient speech | App.tsx renderer | Random lines |
| Behavior poll | useCompanionBehavior 30s | Renderer decisions |
| Orchestrator step delays | discoveryShareOrchestrator | Presentation choreography |

## 2026-07-25 Productization Update

- Vector installation and rebuild moved from Developer-only diagnostics into a normal Memory Settings category while retaining the same local-only runtime.
- The normal Memory page no longer creates or edits durable Memory. It reviews provenance and can confirm, request confirmation or pause use.
- Proactive prompts are selected only by the existing Main Process life scheduler; no Renderer timer or secondary decision authority was added.
- Review-pending Memory is excluded from active retrieval, Vector eligibility and future cognitive recomputation.
