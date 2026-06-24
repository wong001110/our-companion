# Our Companion Engineering Bible FINAL

This pack is the Codex handoff specification for **Our Companion**, an Our Series desktop exploration companion.

## Product freeze
- Project type: Learning project + long-term Our Series core product.
- Distribution: free/open-source direction, but v1 is developed as an internal product first.
- Marketplace/plugin ecosystem: not in v1.
- Tech stack: Electron + React + PixiJS + DeepSeek V4 Flash + SQLite.
- Memory: local-first SQLite, cloud-sync-ready schema.
- Character system: architecture supports up to 3 active companions, v1 ships with 1 active character.
- Product identity: exploration companion + execution ability + emotional warmth.
- Not a virtual girlfriend, not a secretary, not a Copilot clone.

## How Codex should use this pack
1. Start with `00_PRODUCT/PRODUCT_FREEZE.md`.
2. Follow `13_DEVELOPMENT/CODEX_BUILD_PLAN.md` phase by phase.
3. Do not invent product behavior that contradicts this spec.
4. For missing implementation details, prefer simple, maintainable code over clever abstractions.
