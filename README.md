# Our Companion

Our Companion is a local-first desktop AI companion runtime. It combines desktop presence, conversation, local memory, structured actions, autonomous Discovery, and character animation. Optional social and Visit capabilities are provided through Our Companion Network when Online Mode is enabled.

The desktop runtime is designed to keep the Companion useful when it is offline: the local database, conversation history, memory, animation and most runtime behavior stay on the device. Network-backed identity, friends, presence, public Companion profiles, Asset Packs, Visit sessions and remote Developer Debug upload are explicit Online Mode features.

## Technology stack

| Area | Current implementation |
| --- | --- |
| Desktop shell | Electron 37 |
| UI | React 19 and TypeScript |
| Build | Vite 6 |
| Runtime | Node.js `>=22 <23` |
| Local persistence | SQLite through Node's `node:sqlite` API |
| Sprite rendering | Custom HTML Canvas 2D `SpriteAnimator` |
| Validation | Zod |
| AI | DeepSeek-compatible chat completions with structured proposal validation |
| Research | Brave Search when configured, curated connectors, Cheerio extraction and a safe web-page fetcher |
| Speech | Native Whisper integration |
| Online integration | Socket.IO Client plus REST requests to Our Companion Network |
| Testing | Vitest, Playwright, axe-core Playwright checks, architecture-boundary tests and smoke fixtures |

PixiJS is currently present as a dependency, while the active Companion spritesheet renderer uses a custom HTML Canvas 2D implementation.

## Requirements and quick start

- Node.js `>=22 <23`
- npm with workspace support

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm test
npm run arch:check
npm run build
```

The UI and smoke commands require their respective Electron, Playwright and Network-service prerequisites:

```bash
npm run test:ui
npm run smoke:s5:two-device
npm run smoke:s5:multi-visitor
```

## Monorepo structure

The repository is an npm workspace containing the Electron application, shared contracts, domain engines, persistence and platform adapters.

Important areas include:

- `apps/desktop`: Electron Main Process, typed preload bridge and React renderer.
- `packages/shared`: shared models, contracts, action capabilities and domain types.
- `packages/ai-engine`: AI client contracts and structured response validation.
- `packages/memory-engine`, `discovery-engine`, `action-engine`, `tool-engine`, and the other domain engines: bounded, testable domain behavior.
- `packages/database`: SQLite schema, migrations, CRUD and cache persistence.
- `packages/platform/event-bus`: internal event bus abstractions.
- `packages/speech-engine`: Whisper integration.
- `packages/validation-kit`: deterministic fixtures, fakes, simulations and test assertions.
- `scripts` and `tests`: architecture checks, build/setup helpers, UI tests and smoke tests.

## Electron architecture

The application has three BrowserWindows:

1. **Companion Window**: transparent, always-on-top presence surface with the animated Companion.
2. **Panel Window**: dashboard for conversation, Discovery, journeys, memory, social features and settings.
3. **Creation Window**: onboarding and Companion creation/editing flow.

The security boundary is:

```text
Renderer
  -> typed preload bridge
  -> Electron IPC
  -> Main Process
  -> domain services / SQLite / external providers
```

All windows use `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`. The Main Process owns database, network, AI, speech and filesystem access. Renderers call the typed `window.ourCompanion` bridge and do not receive arbitrary filesystem paths. Local Companion assets are exposed through the constrained `companion:` protocol; verified Network Asset Pack files use `companion-network:`.

The Renderer does not communicate with a local HTTP backend. Internal Desktop communication uses Electron IPC. The Main Process still uses external HTTP APIs for AI providers, web research, Our Companion Network services and presigned Asset Pack transfers.

## Companion turn pipeline

```text
User input
  -> persist user message
  -> build bounded memory context
  -> deterministic action matching
  -> AI structured proposal when required
  -> Zod validation
  -> action capability validation
  -> memory capture policy
  -> permission resolution
  -> execution or confirmation
  -> persist assistant response and inspection data
```

The LLM proposes structured actions and memories, but deterministic application code validates and authorizes them. Unsupported tools, invalid arguments, unsafe memory candidates and denied permissions are rejected before execution. The LLM does not directly control the operating system.

## Memory system

The current Memory system is local and SQLite-backed. SQLite is authoritative; sqlite-vec is disposable derived state. Retrieval may combine structured, lexical, recency, pinned and Vector signals using local 384-dimensional Xenova/multilingual-e5-small embeddings. Grounding uses structured reply provenance plus deterministic scope/privacy checks and semantic support validation when the local model is available.

Memory capture requires grounded evidence from the current user message and applies deterministic rejection rules for sensitive, temporary, test-like or explicitly non-memory content. Memory context is bounded before it is placed in an AI prompt.

The local E5 model is never downloaded during normal conversation. If it is unavailable, durable Memory is excluded from the generation prompt and ordinary current-turn conversation continues safely.

## Discovery and research

Discovery is an evidence-oriented local pipeline:

```text
Interest and memory context
  -> Curiosity Target
  -> Research Intent
  -> deterministic Research Plan
  -> optional AI plan refinement
  -> capability routing
  -> structured connectors and/or web search
  -> bounded page fetching
  -> evidence extraction
  -> coverage evaluation
  -> optional single continuation pass
  -> candidate deduplication
  -> insight synthesis
  -> presentation decision
```

Research controls include query limits, search-result and page limits, total character limits, request timeouts, a cycle deadline, domain-aware fetch batching, a maximum of one additional research pass, provider failure handling, and seen-URL/content-fingerprint deduplication.

The safe page fetcher is read-only and cookie-free. It accepts HTTP and HTTPS only, blocks private and local addresses with IPv4 and IPv6 checks, rejects URL credentials, validates DNS resolution, pins the resolved transport, revalidates redirects, enforces a response-size limit and allows only supported content types. HTML, RSS and Atom content is extracted through Cheerio. Discovery is not unrestricted browser automation.

## Animation system

The active renderer is the custom `SpriteAnimator` used by `CompanionCanvas`. It extracts frames from spritesheets, supports device-pixel-ratio-aware Canvas sizing, playback-rate control, loop and non-loop clips, completion callbacks, fallback animation selection, alpha-based pointer hit testing, drag interaction and directional walking. Missing or invalid assets fall back to a usable animation instead of handing rendering to PixiJS.

## Local database

The current local database provisions 38 persistent tables: 35 in the base schema and 3 adaptive Discovery tables created during database startup. The groups are:

- Companion profile and runtime state.
- Conversation sessions, messages and pending actions.
- Memory nodes, edges and processing state.
- Relationships and Companion-local relationship state.
- Discovery lifecycle, candidates, feedback and insights.
- Research intents, plans, search records and web-page evidence.
- Curiosity targets, patterns and interests.
- Journeys, milestones and diary entries.
- Task history and engine traces.
- Network Companion mappings and verified Asset Pack cache.
- Developer Debug queue and application settings.

The precise table set is defined by `packages/database/src/schema.ts` and the adaptive Discovery initialization in `packages/database/src/adaptiveDiscoveryPersistence.ts`; future migrations may change the count.

## Online Mode and Network integration

**Offline/local mode** keeps the Companion, local data, memory and local runtime available.

**Online Mode** adds authentication, friends, presence, public Companion profiles, Asset Packs, Visit sessions and remote Developer Debug upload.

The Main Process checks protocol and client compatibility before connecting, restores a device-scoped session when possible, encrypts the stored session through Electron `safeStorage`, uses REST as authoritative state, and treats Socket.IO events as invalidation hints. Reconnects use bounded exponential handling, and Visit state is reconciled through REST after reconnect or an invalidation gap.

Online Mode uses the Network REST API for account and social operations. Socket.IO events currently cover friend-request and friendship changes, block changes, presence updates, Companion profile changes, Asset Pack activation, Visit invitation changes and Visit session changes. The Desktop refreshes authoritative data after these hints; it does not treat an event as the durable source of truth.

Network Asset Pack files are downloaded into a verified local cache recorded in SQLite. The `companion-network:` protocol serves cached files without exposing arbitrary paths to the Renderer.

## Developer Debug

Developer Debug is an opt-in, development-only pipeline:

```text
local SQLite event queue
  -> client-side redaction
  -> bounded payloads
  -> opt-in development upload
  -> authenticated Network batch ingestion
  -> server-side redaction
  -> retention
  -> Superadmin inspection and audit
```

Upload requires all of the following: a development/unpackaged build, Online Mode enabled, an authenticated account, Network state `online`, the local upload setting enabled and the Network ingestion feature flag enabled. Production/package builds do not upload these events.

## Testing and quality

Desktop quality checks cover TypeScript project checks, Vitest unit and integration tests, Playwright UI tests, accessibility checks through axe-core Playwright, architecture-boundary tests, two-device Visit smoke tests, multi-visitor smoke tests and deterministic fixture/fake support.

The current Desktop `lint` command performs TypeScript project checks; it is not ESLint. A dedicated ESLint configuration remains a future cleanup item.

## Current limitations

- Multilingual E5 grounding thresholds are recorded in the local [QA report](docs/qa/e5-grounding-report.md). Re-run the explicit `e5:setup` and `qa:e5-grounding` commands when the model, embedding policy, or corpus changes.
- Canvas 2D is the active renderer; PixiJS is not the active Companion rendering path.
- Main Process service composition remains relatively large.
- Internal IPC validation is not yet centralized into one schema registry.
- Real-time Network scaling requires shared Socket.IO infrastructure.
- Packaging, signing and automatic updates may still require production work.
- AI, search, speech, storage and Network behavior depend on external provider configuration and availability.

## Further reading

- [Desktop architecture overview](docs/architecture-overview.md)
- [Interview guide](docs/interview-guide.md)
- [Our Companion Network](../network/README.md)

## License

Private project — All rights reserved.

## Memory productization roadmap

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
- [Combined release checklist](docs/checklists/memory-and-proactive-productization-release.md)
