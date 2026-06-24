# Repository Structure

Use a monorepo-like structure even if only one app ships in v1.

```text
our-companion/
  apps/
    desktop/
      electron/
        main/
        preload/
      renderer/
        src/
          app/
          features/
          components/
          styles/
  packages/
    shared/
    character-engine/
    memory-engine/
    discovery-engine/
    journey-engine/
    diary-engine/
    tool-engine/
    ai-engine/
    database/
  assets/
    characters/
      ann/
  docs/
  scripts/
```

## Rule
Domain logic lives in packages, UI lives in renderer, OS/DB/API execution lives in Electron main process.
