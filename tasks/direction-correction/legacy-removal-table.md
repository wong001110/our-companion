# Legacy Removal Table

| Area | Current Flow | Replacement | Legacy Files/Routes/Calls to Remove | Migration Required | Verification |
|------|--------------|-------------|-------------------------------------|-------------------|--------------|
| Active companion | `characters` table + `character:setPrimary` | `companions` + `getPrimaryCompanion()` | `character:setPrimary`, `character:getActive` legacy reads, `getActiveCharacters()[0]` in discovery | Copy valid `characters` → `companions` if needed | All resolvers use `resolveActiveCompanionId()` |
| Decision | V1 `decideCompanionAction` logging + renderer `decideCompanionBehavior` | Unified `decideUnifiedCompanionAction` in main | `decideCompanionBehavior` decision logic; V1-only action vocabulary | Map old actions to new enum | Negative test: renderer does not call local decision |
| Discovery announce | Direct `discoveryAnnounceBroadcaster` + event bus | Orchestrator + event bus only | `attachAutonomyBroadcasters` discovery/character direct sends | None | Negative test: no direct announce in autonomy |
| Discovery cap | `dailySharedCount >= 3` + `applyDailyCap` auto-share | Initiative budget gates brain | V1 daily cap rule in `decideCompanionAction` | None | Test initiative budget blocks share |
| Memory | Global untyped `memory_nodes` | Scoped typed memory with metadata | Untyped writes without companion_id | Add columns + backfill | Test companion isolation |
| Conversation | Flat messages, renderer phase | `conversation_sessions` + main `ConversationRuntime` | Renderer-only phase machine as source of truth | Add session_id to messages | Test session continuity |
| Relationship | Hardcoded `trustScore: 0.75` | `companion_relationships` table | Hardcoded context in `emitDecisionEventsForDiscovery` | Seed default relationship | Test trust from DB |
| Animation intent | `CompanionCanvas.stateToIntent` | `animationIntent` on `CharacterRuntimeState` | `stateToIntent` decision path | None | Renderer plays intent only |
| Animation registry | `AnimationCategories.ts` + `animationRegistry.ts` | Single `animationRegistry.ts` | `AnimationCategories.ts` duplicate | None | Resolver uses one registry |
| Panel chat | Separate Chat + Ask tabs | Unified "Messages" tab | `AskView` duplicate flow | None | One chat entry point |
| Debug | `debugOverride` in behavior controller | Dev-only flag | Production debug override path | None | Production build excludes override |

| Normal Memory editor | Free-form Add/Edit/Delete in Memory tab | Evidence-preserving review controls | Normal-user editor UI | No schema migration; existing APIs remain Developer/internal | Memory page has no CRUD controls |
| Developer-only Vector controls | Model install/rebuild only in Observatory | Normal Memory Settings + Developer diagnostics | Developer-only product dependency | None | First-run and fallback manual checklist |
| Random-only life activity | Activity selection without meaningful opportunity | Existing scheduler + bounded proactive policy | Any second Renderer scheduler | App settings only | Proactive policy and manual time-controller tests |
