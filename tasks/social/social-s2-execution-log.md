# Social S2 execution log

- Baseline: `8c5291185c0b09da58e8f48c1b31a7422c1c0d11`.
- S1 polish: logout now preserves the persisted Online Mode preference; disabled mode remains `disabled`, enabled mode becomes `authentication_required`.
- S2 client: added Main-process-owned Friend, Block, and Presence IPC APIs, offline-gated Social settings UI, socket invalidation-driven REST resynchronization, and in-app activity signalling. Tokens remain in the Main Process.
- Verification: focused network lifecycle test passed (8 tests); `npm run typecheck` passed.
- Deferred: S3 public profiles/assets, S4 invitations, and S5 visits remain out of scope.
