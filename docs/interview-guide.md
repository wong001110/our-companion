# Our Companion interview guide

This guide is for presenting the Desktop and Network repositories accurately. It separates implemented behavior from future work so the project can be discussed with confidence.

## 1. 30-second project introduction

Our Companion is a local-first desktop AI companion runtime. The Electron application combines an animated desktop presence, conversation, bounded local memory, structured actions and evidence-oriented autonomous Discovery. Our Companion Network is the optional NestJS service that adds identity, friends, presence, public Companion profiles, verified Asset Packs and transactional cross-device Visits. The design keeps the local relationship useful offline while making online behavior explicit and server-authoritative.

## 2. 90-second architecture introduction

The Desktop application has Companion, Panel and Creation windows. React runs in sandboxed Renderers and talks through a typed preload bridge to Electron IPC. The Main Process owns SQLite, filesystem protocols, AI and research providers, Whisper, Network REST/Socket.IO integration and Developer Debug upload. A turn persists the user message, builds bounded memory context, matches deterministic actions, optionally asks the AI for a structured proposal, validates it with Zod and capability rules, applies memory safety policy, resolves permissions, executes approved actions and persists the inspection/result.

Memory uses SQLite graph data with typed nodes, edges, pinning, keyword/CJK-bigram retrieval, recency fallback and bounded budgets. Discovery turns interests into a research plan, routes through connectors or safe web search, fetches bounded evidence, evaluates coverage and synthesizes an insight. Network REST and PostgreSQL are authoritative; Socket.IO only tells the Desktop which data should be refreshed.

## 3. Key technical decisions

- Local-first runtime: conversation, memory and animation do not require the Network.
- Electron security boundary: Renderers receive explicit capabilities through preload and IPC instead of Node.js access.
- Structured AI proposals: the model can suggest an action or memory, but deterministic code validates, authorizes and executes it.
- Evidence-oriented research: bounded queries, pages, characters, deadlines, safe fetching and a single continuation pass limit cost and risk.
- Canvas 2D spritesheet renderer: the active path is small, testable and directly controlled by the Renderer.
- REST as authority with Socket.IO invalidation: reconnects and missed events do not make the client invent durable social state.
- Immutable, verified Asset Packs: staging uploads are hashed, conditionally copied and referenced by Visit snapshots.
- Transactional Visit state: participant locks, row locks and revalidation protect concurrent invitation/session changes.
- Privacy-aware Developer Debug: local opt-in, client/server redaction, bounded batches, idempotency, retention and audit.

## 4. Five strongest engineering stories

### 1. Secure Electron process boundaries

The application uses `contextIsolation`, `sandbox` and `nodeIntegration: false` in all windows. A typed preload bridge exposes narrowly scoped operations, while the Main Process owns SQLite, network, AI, speech and filesystem access. Custom protocols serve approved assets without exposing arbitrary paths.

### 2. Bounded evidence-oriented AI research

Discovery is not an unrestricted browser agent. Deterministic plans and optional AI refinement are constrained by query/page/character/time budgets, safe HTTP transport, content-type allowlists, evidence coverage and a maximum of one continuation pass. Results are deduplicated by URL and content identity before synthesis.

### 3. Verified Asset Pack publication and cache

The Network validates a manifest, records files, creates presigned staging URLs, streams each object through SHA-256, verifies size and MIME, conditionally copies by ETag to an immutable key, publishes the manifest and activates the pack transactionally. The Desktop downloads verified files into a local cache and serves them through `companion-network:`.

### 4. Transactional cross-device Visit state machine

Visit invitations and sessions are durable REST resources. Accept/start/end/heartbeat operations lock the relevant rows, revalidate friendship, blocking and Companion availability, enforce host capacity, snapshot Companion/Asset Pack references and reconcile timeouts. Socket.IO only informs clients that authoritative state changed.

### 5. Privacy-aware Developer Debug observability

Debug events begin in a local SQLite queue and upload only from an unpackaged development build when the user enables upload and the Network feature flag is on. Both client and server redact sensitive values and bound payloads. The server uses `(userId, clientEventId)` idempotency, 14-day retention, bounded pruning and Superadmin audit for inspection.

## 5. Common interview questions and answers

**Why local-first?** The Companion's core relationship should remain useful without an account or server. It also makes data locality explicit; social and remote features are opt-in boundaries.

**Does the AI control the computer?** No. It proposes structured actions. The action registry, argument validation, permission state and deterministic adapters decide whether anything runs.

**Is memory semantic vector search?** Not yet. Current retrieval is SQLite-based with typed memory, keyword overlap, CJK bigrams, importance and recency. A Vector Database is future work.

**Why use Socket.IO if REST is authoritative?** Socket.IO reduces staleness by telling clients which resource changed. REST reloads the resource and PostgreSQL remains the durable authority, which makes reconnect and missed-event recovery straightforward.

**Why are Visits more than messaging?** A Visit creates a durable invitation, then a session with preparing, ready, active, ending and terminal states. It coordinates two devices, readiness, heartbeats, snapshots, asset access, timeouts and cleanup.

**How is Asset Pack integrity protected?** The manifest contains per-file hashes. The server streams staged bytes through SHA-256, checks size/MIME and ETag, copies only the verified object to an immutable key and retains references needed by active Visits.

**What is the biggest current maintainability risk?** Main-process service composition is still relatively large, and IPC validation is not centralized in one schema registry. Both are clear boundaries for future refactoring.

## 6. Claims that are safe to make

- Desktop is an Electron 37 / React 19 / TypeScript application.
- Node.js `>=22 <23` and Node's `node:sqlite` API are the current Desktop requirements.
- Canvas 2D through `SpriteAnimator` is the active sprite path.
- Memory is local SQLite graph retrieval, not a completed embedding system.
- Network is a modular NestJS monolith with PostgreSQL and Prisma.
- REST and PostgreSQL are authoritative; Socket.IO provides invalidation/notification hints.
- Desktop authentication uses bearer access tokens, rotating refresh tokens and device-scoped sessions.
- Portal authentication uses Secure HttpOnly cookies plus a readable CSRF cookie/header pair and origin checks.
- Asset Packs are staged, hashed, verified and activated with immutable object references.
- Visits use a transactional invitation/session state machine.
- Developer Debug upload is opt-in, development-only and redacted.

## 7. Claims that must not be made yet

Do not claim that:

- A Vector Database is already implemented.
- Our Companion Network uses microservices.
- The system is event sourced.
- PixiJS is the active renderer.
- Real-time state is already horizontally scalable.
- SQLite is fully encrypted.
- All tests have passed unless the specific commands were verified.
- A full production installer, signing and automatic updates are complete unless verified.

## 8. Current limitations

- No embedding/vector retrieval yet.
- Canvas 2D is the active renderer and PixiJS is not the active path.
- Main-process composition and IPC validation could be decomposed further.
- In-process Socket.IO/presence/cleanup behavior needs shared infrastructure for horizontal scale.
- External AI, search, speech, storage and Network availability is configuration-dependent.
- Packaging, signing, auto-update and production load/failure testing remain delivery work.

## 9. Future roadmap

Appropriate future work includes a carefully evaluated semantic retrieval layer, centralized IPC schemas, further Main Process decomposition, shared Socket.IO/presence/background-job infrastructure, stronger production packaging and update automation, and load/failure testing for the Network. These are roadmap items, not current implementation claims.

## 10. Resume bullet points

- Built a local-first Electron 37 and React 19 AI companion runtime with sandboxed multi-window process boundaries, typed IPC and Main-process ownership of SQLite, AI, filesystem and Network capabilities.
- Designed a structured Companion turn pipeline that combines bounded SQLite memory context, deterministic action matching, Zod proposal validation, capability checks, user permissions and auditable execution results.
- Implemented evidence-oriented autonomous Discovery with bounded research plans, safe DNS-pinned HTTP fetching, Cheerio extraction, provider failure handling, evidence coverage and URL/content deduplication.
- Developed a NestJS modular monolith for identity, social coordination, public Companion publication, verified Cloudflare R2 Asset Packs and transactional cross-device Visit sessions.
- Implemented Asset Pack integrity controls using manifest validation, streamed SHA-256 verification, ETag-conditional publication, immutable object keys and a verified Desktop cache.
- Built privacy-aware Developer Debug observability with local opt-in queues, client/server redaction, bounded batches, idempotent ingestion, retention and Superadmin audit trails.
