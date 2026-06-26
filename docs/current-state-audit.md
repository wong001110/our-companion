# Current State Audit

Generated for Book of Ann Volume 01.

## Package List

- `apps/desktop`: Electron main/preload plus React renderer.
- `packages/shared`: shared domain types, ids, settings, API contracts, and Volume 01 foundation models/interfaces.
- `packages/ai-engine`: DeepSeek client, JSON parsing, and AI output validation helpers.
- `packages/character-engine`: character runtime state, emotion updates, intent selection, state transitions, and animation selection.
- `packages/discovery-engine`: fallback discovery connectors, scoring, deduplication, daily cap, exploration planning, and discovery candidate collection.
- `packages/curiosity-engine`: curiosity target generation.
- `packages/insight-engine`: autonomous insight generation and primary insight selection.
- `packages/pattern-engine`: pattern detection over memory, journeys, discoveries, and feedback.
- `packages/memory-engine`: memory node/edge creation, graph building, interest graph building, and search.
- `packages/journey-engine`: journey and milestone creation helpers.
- `packages/diary-engine`: diary/reflection generation.
- `packages/database`: SQLite-backed local storage service and schema.
- `packages/speech-engine`: Whisper status, audio conversion, transcription, and transcript reading helpers.
- `packages/tool-engine`: tool preview, safety checks, and execution orchestration.
- `packages/platform/event-bus`: Volume 01 in-process event bus foundation.

## Module Responsibilities

- Desktop service orchestration lives in `apps/desktop/electron/main/services.ts`.
- IPC route registration and automation startup live in `apps/desktop/electron/main/index.ts`.
- Discovery scheduling and staged sharing live in `apps/desktop/electron/main/discoveryScheduler.ts` and `apps/desktop/electron/main/discoveryShareOrchestrator.ts`.
- The renderer owns panel and companion UI, speech capture hooks, and user interaction state.
- Engine packages mostly expose pure functions or narrow service helpers; `database` and `speech-engine` are the main side-effect-heavy packages.

## Direct Dependencies

- `apps/desktop` imports every engine package directly and coordinates cross-engine workflows.
- `database` depends on `shared` and `character-engine` for seed/default character state.
- Most engines depend only on `shared`.
- `ai-engine` depends on `zod` and `fetch` for provider calls.
- `speech-engine` depends on `ffmpeg-static` and `@kutalia/whisper-node-addon`.
- `tool-engine` depends on `shared`; real OS/browser behavior is injected by desktop adapters.

## LLM Call Locations

- `packages/ai-engine/src/index.ts`: `DeepSeekClient.chatDebug()` calls the configured DeepSeek-compatible chat endpoint.
- `apps/desktop/electron/main/services.ts`: creates `DeepSeekClient` for panel chat, companion turns, and discovery reason generation.
- AI outputs that affect state are currently validated with zod schemas in `ai-engine`.

## Storage Access Points

- `packages/database/src/index.ts`: central `DatabaseService` API over local SQLite or in-memory fallback.
- `apps/desktop/electron/main/services.ts`: direct reads/writes for character state, discoveries, memories, journeys, diary entries, exploration cycles, settings, feedback, and debug logs.
- `packages/speech-engine/src/index.ts`: writes temporary recording files during transcription and removes them after use.

## Animation Control Paths

- `packages/character-engine/src/index.ts`: maps runtime state, intent, and emotion to animation keys.
- `apps/desktop/electron/main/services.ts`: changes character runtime state during behavior triggers and autonomous exploration.
- `apps/desktop/electron/main/discoveryShareOrchestrator.ts`: advances character state while presenting queued discoveries.
- `apps/desktop/electron/main/index.ts`: broadcasts `character:stateChanged` to companion and panel windows.
- Renderer companion UI consumes state and selects/render animation assets.

## Action And Tool Execution Paths

- `packages/tool-engine/src/index.ts`: validates safety, previews, and calls injected adapters.
- `apps/desktop/electron/main/services.ts`: injects Electron adapters for `open_url`, `open_app`, `search_web`, and `browser_navigation`.
- `openKnownApp()` in desktop services uses `spawn()` with a small allowlist.
- URL/search actions use Electron `shell.openExternal()`.

## Event Bridge Status

Volume 01 side-channel events are now emitted alongside existing direct calls for:

- discovery refresh and newly created discoveries
- speech transcription and companion/AI messages
- character state and emotion changes
- action/tool requests and execution outcomes
- autonomous exploration milestones and shared insights

The bridge is additive. Existing IPC, database writes, renderer broadcasts, and direct engine calls remain active.
