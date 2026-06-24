# System Architecture

## Layers
Renderer UI must not directly access SQLite, OS commands, or DeepSeek.

```text
React UI / PixiJS Renderer
        -> IPC
Electron Main Application Services
        ->
Domain Engines
        ->
Infrastructure
```

## Main process responsibilities
- App lifecycle.
- Window management.
- IPC routing.
- SQLite access.
- OS tool execution.
- Browser/tool automation boundaries.
- Secure API key access.
- Background discovery scheduling.

## Renderer responsibilities
- Companion Panel UI.
- Character canvas rendering via PixiJS.
- User input.
- Displaying discoveries, journey, memory, diary.

## Domain engines
- Character Engine
- Emotion Engine
- Intent Engine
- Behavior Engine
- Animation Engine
- Discovery Engine
- Memory Engine
- Journey Engine
- Diary Engine
- Tool Engine
- AI Engine

## Infrastructure
- SQLite repository layer.
- DeepSeek client.
- Discovery source clients.
- OS command adapters.
