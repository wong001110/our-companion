# Discovery Flow Refactor & UI Architecture Cleanup

> **For agentic workers:** Execute this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Split App.tsx, introduce a Discovery queue manager with candidate lifecycle, fix presentation timing, improve payload quality, and add debug tools.

**Architecture:** Extract shared UI primitives and view components from App.tsx. Create a renderer-side DiscoveryQueueManager class that manages candidate lifecycle (Queued→Presenting→Dismissed/Saved). Wire the manager into the orchestrator and companion shell for synchronized presentation.

**Tech Stack:** React 19, TypeScript, Vitest, Electron IPC

## Global Constraints

- Preserve all existing behavior — no UX regressions
- Do not reintroduce queue arrays or batch enqueue in the orchestrator
- Keep business logic out of view components
- Single-slot orchestrator architecture stays unchanged

---

## Task 1: Extract shared UI primitives from App.tsx

**Files:**
- Create: `apps/desktop/renderer/src/ui/NotebookPrimitives.tsx`
- Modify: `apps/desktop/renderer/src/ui/App.tsx`

**Steps:**

- [ ] Create `NotebookPrimitives.tsx` with: `NotebookPage`, `NotebookSectionTitle`, `PaperCard`, `StickyNote`, `NotebookChatBubble`, `MiniAnnSticker`, `ProgressBar`, `LangContext`, `useLang`
- [ ] Move utility functions to `apps/desktop/renderer/src/ui/utils.ts`: `formatJson`, `formatDuration`, `formatDiscoveryTime`, `formatRelativeDate`, `formatShortDate`, `formatAskResult`, `readable`, `capitalize`, `randomBetween`, `clamp`, `easeInOut`, `annStatusMessage`, `annMoodLabel`, `tabLabel`, `parseLocalCommand`, `createDevAnimationState`, `debugPreview`, `DebugJsonBlock`, `DebugTextBlock`
- [ ] Update App.tsx to import from new files
- [ ] Run `npx vitest run` — verify no regressions

---

## Task 2: Extract view components from App.tsx

**Files:**
- Create: `apps/desktop/renderer/src/ui/views/HomeView.tsx`
- Create: `apps/desktop/renderer/src/ui/views/DiscoveryView.tsx`
- Create: `apps/desktop/renderer/src/ui/views/JourneyView.tsx`
- Create: `apps/desktop/renderer/src/ui/views/MemoryView.tsx`
- Create: `apps/desktop/renderer/src/ui/views/ChatView.tsx`
- Create: `apps/desktop/renderer/src/ui/views/AskView.tsx`
- Create: `apps/desktop/renderer/src/ui/views/SettingsView.tsx`
- Modify: `apps/desktop/renderer/src/ui/App.tsx`

**Steps:**

- [ ] Create each view file, moving the corresponding function component
- [ ] Each view imports primitives from `NotebookPrimitives.tsx` and utils from `utils.ts`
- [ ] Update App.tsx: remove extracted components, add imports
- [ ] Run `npx vitest run` — verify no regressions

---

## Task 3: Extract debug/developer components from App.tsx

**Files:**
- Create: `apps/desktop/renderer/src/ui/views/DeveloperTools.tsx`
- Modify: `apps/desktop/renderer/src/ui/App.tsx`

**Steps:**

- [ ] Move `DebugAiLog`, `DebugDataResetPanel`, `DebugAudioTestPanel`, `DeveloperPreview`, `BehaviorPanel`, `VoiceSettingsCard`, `ActionPermissionsCard` into `DeveloperTools.tsx`
- [ ] Update App.tsx to import from DeveloperTools
- [ ] Run `npx vitest run` — verify no regressions

---

## Task 4: Create DiscoveryQueueManager

**Files:**
- Create: `apps/desktop/renderer/src/companion/DiscoveryQueueManager.ts`
- Create: `apps/desktop/renderer/src/companion/DiscoveryQueueManager.test.ts`

**Steps:**

- [ ] Write failing tests for: enqueue deduplicates by id, lifecycle transitions (Queued→Presenting→Dismissed/Saved), getNext returns oldest queued, current returns presenting item, dismiss/save advance queue
- [ ] Implement `DiscoveryQueueManager` class with: `enqueue(candidate)`, `getNext()`, `getCurrent()`, `dismissCurrent()`, `saveCurrent()`, `reset()`, `getAll()`, `getCandidatesByStatus()`
- [ ] Each candidate has: `id`, `payload` (DiscoveryAnnouncePayload), `status: 'queued' | 'presenting' | 'dismissed' | 'saved'`, `enqueuedAt`, `presentedAt?`
- [ ] Run tests — verify all pass

---

## Task 5: Wire DiscoveryQueueManager into companion shell

**Files:**
- Modify: `apps/desktop/renderer/src/ui/App.tsx` (CompanionShell)
- Modify: `apps/desktop/renderer/src/companion/DiscoveryPopoutCard.tsx` (add onDismiss/onSave callbacks)

**Steps:**

- [ ] In CompanionShell, instantiate `DiscoveryQueueManager` via useRef
- [ ] Replace `discoveryPopup` state with manager-backed presentation
- [ ] On `AnnMessageQueued` event: enqueue payload into manager, if no current presentation → present next
- [ ] Card onClose → `dismissCurrent()`, then present next from queue
- [ ] Add `onSave` / `onDismiss` props to DiscoveryPopoutCard
- [ ] Run `npx vitest run` — verify no regressions

---

## Task 6: Fix presentation timing synchronization

**Files:**
- Modify: `apps/desktop/renderer/src/ui/App.tsx` (CompanionShell event handler)

**Steps:**

- [ ] Ensure card mounts and typewriter start in same render cycle (already the case — verify)
- [ ] Ensure card payload is complete before typewriter first character (already the case with CARD_RENDER_DELAY_MS — verify)
- [ ] New discoveries entering queue while one is presenting should NOT replace current
- [ ] Run `npx vitest run` — verify no regressions

---

## Task 7: Improve Discovery Card payload quality

**Files:**
- Modify: `apps/desktop/renderer/src/companion/DiscoveryPopoutCard.tsx`

**Steps:**

- [ ] Add fallback title logic: `title || summary?.slice(0, 60) || 'Discovery from ' + source`
- [ ] Add `whyThisMatters` field display when available
- [ ] Ensure tags are displayed (already done — verify)
- [ ] Run `npx vitest run` — verify no regressions

---

## Task 8: Enhance Developer Debug UI for Discovery

**Files:**
- Modify: `apps/desktop/renderer/src/features/developer/EngineObservatory.tsx`

**Steps:**

- [ ] Add Discovery Queue section showing: current presentation, queued count, dismissed count, saved count
- [ ] Add buttons: Trigger Discovery, Present Next, Dismiss Current, Reset Queue
- [ ] Wire buttons to DiscoveryQueueManager instance (pass via context or prop)
- [ ] Run `npx vitest run` — verify no regressions

---

## Task 9: Final verification

**Steps:**

- [ ] Run `npx tsc -b` — verify clean build
- [ ] Run `npx vitest run` — verify all 219+ tests pass
- [ ] Verify App.tsx is under 300 lines (composition layer only)
- [ ] Commit and push
