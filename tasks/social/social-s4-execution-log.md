# Social S4 execution log

- Bumped desktop Social protocol to `0.3` / `0.3.0`.
- Added typed invitation/session IPC and a main-process coordinator for preparation and heartbeats.
- Reused the existing verified S3 cache machinery for session-scoped immutable Pack downloads.
- Added a Social Visit status section for invitations, preparation, start, and end; no remote Companion is rendered.
- Added focused coordinator tests covering owner/host preparation, heartbeat deduplication, and Offline Mode.
