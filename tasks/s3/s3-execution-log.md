# S3 execution log

- Baseline: `d02b8fe149516ba3d3a1d68932890f3e54ee15eb`.
- Complete now always returns `{ assetPack, companion }`, including active retry.
- Cleanup atomically claims `superseded → deleting` and `uploading/verifying → abandoning`; failed object deletion remains claimed for the next cleanup pass.
- Sprite timing comes from the shared animation definition, used by both the renderer and portable manifest (`Idle_Neutral` 520 ms; `Walk_Right` 180 ms).
- Transfers use 50-file batches, re-sign 401/403 URLs, reject concurrent downloads, and abort on offline/logout/server change/authentication loss/shutdown.
- Download ownership is claimed before the first awaited network call; active completion retries return their envelope even when R2 is temporarily unavailable.
- Retention is `R2_SUPERSEDED_PACK_RETENTION_DAYS`, validated by storage configuration.

## Verification

- Node 22.23.1: typecheck, architecture check, build, and full Vitest suite passed: 55 files / 407 tests.
- Focused asset builder and transfer ownership tests passed.
- Live R2 integration passed: private upload, HEAD, download/hash, manifest write, delete, and clean test teardown.
- Two-client desktop smoke test: passed. The owner and friend completed the online publish/download flow successfully on separate devices.

## Remaining limitation

The initial IPC binding issue encountered during the first asset-pack build was fixed in `9e078a8`; all public-companion IPC handlers now retain their service instance binding.
