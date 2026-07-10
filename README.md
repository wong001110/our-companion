# Our Companion

A long-term desktop AI companion designed to develop a continuous, character-driven relationship with you through presence, conversation, memory, shared experiences, and restrained initiative.

Ann may explore, learn, reflect, and help — but these abilities support the companion relationship rather than replace it.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 37 |
| UI | React 19 + TypeScript |
| Rendering | PixiJS 8 (sprite animation) |
| Build | Vite 6 |
| Database | SQLite (node:sqlite) |
| AI | DeepSeek API |
| Speech | Whisper |
| Testing | Vitest |

## Project Structure

```
our-companion/
├── apps/desktop/              # Electron desktop app
│   ├── electron/
│   │   ├── main/              # Main process (Node.js)
│   │   │   ├── index.ts       # Entry point, IPC registration
│   │   │   ├── services.ts    # AppServices (core backend)
│   │   │   ├── adapters/      # IPC broadcaster
│   │   │   └── platform/      # Electron-specific adapters
│   │   └── preload/
│   │       └── index.ts       # Context bridge (OurCompanionApi)
│   └── renderer/
│       └── src/
│           ├── main.tsx       # React entry
│           ├── styles.css     # Global styles
│           ├── i18n.ts        # Internationalization (en/zh-CN)
│           ├── ui/            # App.tsx, panels, views
│           ├── companion/     # Companion behavior, creation, runtime
│           ├── character/     # Sprite animation system
│           └── features/      # Debug components
├── packages/                  # 21 internal packages
│   ├── shared/                # Types, interfaces, API contract
│   ├── ai-engine/             # DeepSeek client, Zod schemas
│   ├── character-engine/      # Character state, emotion, animation
│   ├── memory-engine/         # Memory graph, consolidation, decay
│   ├── discovery-engine/      # Discovery pipeline, connectors, scoring
│   ├── decision-engine/       # Companion brain, decision scoring
│   ├── curiosity-engine/      # Curiosity targets, scoring
│   ├── insight-engine/        # Insight generation
│   ├── pattern-engine/        # Pattern detection
│   ├── journey-engine/        # Journey creation, milestones
│   ├── diary-engine/          # Daily diary generation
│   ├── action-engine/         # Action planning, permissions
│   ├── tool-engine/           # Tool execution (open_url, search_web)
│   ├── speech-engine/         # Whisper transcription
│   ├── society-engine/        # Cloud/social features
│   ├── experience-engine/     # Experience management
│   ├── companion-life/        # Lifecycle orchestration
│   ├── database/              # SQLite, schema, CRUD
│   ├── sdk/                   # Developer SDK
│   ├── validation-kit/        # Validation utilities
│   └── platform/event-bus/    # Global pub/sub
├── docs/                      # Architecture decision records
├── tasks/                     # Active development tasks
└── scripts/                   # Build/setup scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

This starts the Electron app with hot-reload for the renderer process.

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Type Check

```bash
npm run typecheck
```

## Architecture

### Three-Window Architecture

1. **Companion Window** — Transparent fullscreen overlay, always-on-top, renders the animated sprite character
2. **Panel Window** — Dashboard with tabs: Home, Discovery, Journey, Memory, Chat, Ask, Settings
3. **Creation Window** — Companion selection/creation wizard on startup

### Data Flow

```
User/Timer/Hotkey
  → React Hook
  → window.ourCompanion.* (IPC)
  → Main Process AppServices
  → Engine Packages + SQLite + DeepSeek AI
  → Response via IPC
  → React State Update
```

All communication uses Electron IPC (~70+ channels). No HTTP APIs.

### Engine Pattern

Each engine package exposes pure functions or narrow service helpers:

- **character-engine**: Core states (idle/walking/sleeping/observing/thinking/discovering/talking/listening/executing/returning), 10-dimensional emotion vector, animation resolution
- **discovery-engine**: Candidate collection, scoring (`finalScore = userInterestScore * 0.3 + historyScore * 0.2 + expertiseScore * 0.25 + noveltyScore * 0.25`), connectors (GitHub, HackerNews, Reddit, YouTube)
- **memory-engine**: Memory graph with nodes/edges, consolidation, decay, retrieval
- **curiosity-engine**: Curiosity target generation from patterns, memories, journeys
- **insight-engine**: Synthesis of exploration findings
- **decision-engine**: Companion behavior decisions, interruption policy

### Autonomous Exploration Loop

```
detectPatterns → buildInterestGraph → generateCuriosityTargets
  → planExploration → runDiscoveryAgents → generateInsights
  → selectPrimaryInsight → shareViaOrchestrator → userFeedback → memoryUpdate
```

### Companion System

- Multi-companion support with runtime isolation
- Each companion owns: profile, personality (8 traits), assets, memories, runtime state
- Built-in character "Ann" with sprite animations
- Custom companions created via step-by-step wizard
- Edit companion via flat form (name, personality, sprite assets)

### Animation System

30 animation types across categories:
- Idle (4): Idle_Neutral, Idle_Breathe, Idle_Sleepy, Idle_Sleeping
- Talk (4): Talk_Neutral, Talk_Happy, Talk_Thinking, Talk_Concerned
- Walk (8): 8 directional movements
- Expedition (4): Prepare, Leave, Return, Present
- Interaction (3): Listening, Waiting_Response, Think
- Movement (2): Enter, Leave
- Drag (2): Drag_Hold, Drag_Release
- Other (2): Work_Focus, Music_Idle

## Database

SQLite with 21 tables:
- `companions` — Companion profiles and settings
- `characters` — Legacy character profiles
- `character_state` — Runtime state (core state, emotion, position)
- `discoveries` — Discovered content
- `memory_nodes` / `memory_edges` — Memory graph
- `journeys` / `journey_milestones` — Exploration tracking
- `diary_entries` — Daily diary
- `companion_messages` — Chat history
- `app_settings` — Key-value settings store
- Plus 12 more for patterns, interests, curiosity, exploration, etc.

## Configuration

### AI Settings

Configure in Settings tab or selection page:
- **Provider**: DeepSeek
- **Model**: deepseek-v4-flash (default)
- **Endpoint**: https://api.deepseek.com
- **API Key**: Your DeepSeek API key

### Voice

- Whisper model for speech transcription
- Global hotkey: `Ctrl+Shift+Space` (or `Cmd+Shift+Space` on Mac)
- GPU acceleration option

## Development

### Package Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development mode |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run typecheck` | Type checking |
| `npm run lint` | Linting |
| `npm run arch:check` | Architecture boundary check |

### Architecture Rules

- All companion data lives in Electron `userData` directory, never in source
- Runtime isolation: per-companion state uses `companion:{id}:*` keys
- Built-in companions are read-only; editing clones to a user companion first
- All runtime systems read `activeCompanion` — never hardcode Ann paths

### Adding a New Engine

1. Create package under `packages/`
2. Export pure functions or narrow service helpers
3. Add to `packages/shared/src/index.ts` types
4. Register IPC handlers in `apps/desktop/electron/main/index.ts`
5. Expose via preload bridge in `apps/desktop/electron/preload/index.ts`
6. Update `OurCompanionApi` interface in shared types

## License

Private project — All rights reserved.
