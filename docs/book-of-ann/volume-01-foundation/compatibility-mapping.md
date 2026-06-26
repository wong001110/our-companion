# Volume 01 Compatibility Mapping

This map preserves current package names while aligning them to the Book of Ann target architecture.

| Current package | Current role | Target logical layer | Volume 01 migration stance |
| --- | --- | --- | --- |
| `packages/ai-engine` | DeepSeek client and AI output validation | `providers/llm` | Keep package name; expose provider interfaces from `shared`; wrap concrete provider later. |
| `packages/discovery-engine` | Discovery connectors, ranking, dedupe, exploration agents | `brain/thinking/discovery` | Keep existing pipeline; emit `SignalCaptured` and `DiscoveryCreated` from desktop bridge. |
| `packages/curiosity-engine` | Curiosity target generation | `brain/curiosity` | Keep pure scoring/generation; avoid UI or action ownership. |
| `packages/pattern-engine` | Pattern detection | `brain/thinking/patterns` | Keep pure functions; future volumes can emit `PatternDetected`. |
| `packages/insight-engine` | Insight synthesis | `brain/thinking/insight` | Keep synthesis separate from presentation timing. |
| `packages/memory-engine` | Memory graph and interest graph helpers | `brain/knowledge/memory` | Keep storage behind `database`; later add knowledge events and decay/archive policy. |
| `packages/journey-engine` | Journey and milestone helpers | `brain/knowledge/journey` | Keep journey helpers; future volume expands lifecycle states. |
| `packages/diary-engine` | Reflection diary generation | `brain/reflection` | Keep daily/milestone reflection generation; future events can request diary creation. |
| `packages/character-engine` | State, emotion, intent, animation policy | `character/*` | Keep character as embodied expression; do not execute commands or fetch discoveries here. |
| `packages/speech-engine` | Whisper transcription support | `expression/speech` input path | Keep transcription isolated; companion phrasing remains in AI bridge for now. |
| `packages/tool-engine` | Tool safety, preview, execution dispatch | `action/executor` | Keep real execution in adapters; event bridge emits action lifecycle events. |
| `packages/database` | SQLite persistence | `platform/database` | Keep local-first storage service; cloud/sync remains out of scope. |
| `packages/shared` | Domain contracts | `platform/shared` | Added Volume 01 models and provider interfaces. |
| `packages/platform/event-bus` | In-process event bridge | `platform/event-bus` | Added additive event bus for migration and future listeners. |
| `apps/desktop` | Product shell and orchestration | Runtime composition layer | Continue coordinating legacy calls while emitting foundation events. |

## Initial Event Mapping

| Current flow | Event emitted |
| --- | --- |
| Discovery refresh inserts a new item | `SignalCaptured`, `DiscoveryCreated` |
| Discovery share broadcasts a message | `AnnMessageQueued` |
| Character state changes | `AnnStateChanged` |
| Emotion changes from feedback or voice turn | `EmotionChanged` |
| Voice transcription completes | `SignalCaptured` |
| Tool execution starts | `ActionRequested` |
| Tool execution succeeds | `CommandExecuted` |
| Tool execution blocks/fails/previews | `ActionFailed` |
| Autonomous exploration records a stage | `DiscoveryCreated` |
