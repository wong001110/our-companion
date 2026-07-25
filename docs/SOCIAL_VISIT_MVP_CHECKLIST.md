# Companion Social Visit MVP — Progress and Real-Device Validation

## Delivery progress

### Scope and contracts

- [x] Existing Our Companion and Our Companion Network repositories inspected.
- [x] Existing Friendship, Block, Presence, invitation, Ready, heartbeat and visual Visit paths reused.
- [x] Server privacy boundary locked: approved Discovery copy, bounded turns and Shared Moment only.
- [x] Private Reflection and relationship continuity remain local to each device.
- [x] Two Companions only; visitor owner starts; maximum 12 turns.

### Network implementation

- [x] Approved Discovery Share Envelope API.
- [x] Participant-scoped Social Visit state API.
- [x] Alternating, idempotent Companion turn relay.
- [x] Deterministic Shared Moment for completed conversations only.
- [x] Friendship and Block revalidation during conversation.
- [x] Database migration with cascade cleanup and Prisma schema alignment.
- [x] Network policy and service security tests plus dedicated CI gate.
- [x] Network migration validation, lint, build, tests and independent diff review complete.
- [x] Network PR merged to `main`; task branch deleted.

### Desktop implementation

- [x] Discovery selection before sending a Social Visit request.
- [x] Approved share persisted locally until the invitation becomes a Session.
- [x] New Social Visit flow attaches the share before the visiting Companion becomes Ready.
- [x] Legacy Visual Visit preparation and startup remain compatible without a Social share.
- [x] Social Visit conversation UI with bounded transcript and automatic turn continuation.
- [x] Each device generates only its own Companion's turn.
- [x] AI prompt receives only the approved share and bounded Social transcript.
- [x] Deterministic response fallback when the configured AI provider is unavailable.
- [x] Shared Moment and local-only Private Reflection presentation.
- [x] Local relationship continuity update is idempotent per Session.
- [x] Desktop architecture, typecheck, 1,189 Vitest cases and production build are green.
- [x] Desktop independent diff review complete with no unresolved blocking code findings.
- [x] Desktop PR merged to `main`; task branch deleted.
- [ ] Real two-device UI, privacy and interruption checklist completed by the user.

## Real-device test checklist

Use two machines or two isolated desktop user-data profiles. Do not reuse the same SQLite database for both participants.

### A. Setup

- [ ] Both devices run builds from `main` after both Social Visit PRs are merged.
- [ ] Both devices point to the same deployed Our Companion Network server.
- [ ] Each device has a separate Network account and a published Companion with a valid Asset Pack.
- [ ] The two accounts are friends and neither account blocks the other.
- [ ] At least one Discovery is visible on the visiting device.
- [ ] Both devices show the other friend as online.

### B. Suggested visit and consent

- [ ] The visiting device shows a suggestion that its Companion can share a selected Discovery with the online friend.
- [ ] Sending is blocked until a Discovery is selected.
- [ ] The host receives the Visit request and can accept or decline it.
- [ ] Declining leaves no active Session and exposes no Discovery content to the host.
- [ ] Accepting creates one preparing Session on both devices.

### C. Preparation and privacy

- [ ] Preparing on the visiting device attaches only title, summary, up to five tags and the approved source URL.
- [ ] Preparing on the host downloads only the published visual Asset Pack.
- [ ] The host cannot start until both devices are Ready.
- [ ] Inspect Network logs/database: no API key, raw prompt, private Notebook, vector record or full local Memory is present.
- [ ] The approved Discovery shown on both devices matches exactly what the visiting user selected.

### D. Companion conversation

- [ ] The visiting Companion produces the first turn.
- [ ] Each device produces only its own Companion's turns.
- [ ] Turns alternate; the same participant cannot append twice.
- [ ] Automatic continuation can be disabled independently on either device.
- [ ] The transcript is bounded to 12 turns and then ends automatically.
- [ ] Reconnect or refresh does not duplicate a turn.
- [ ] The Companions stay on the approved Discovery topic and do not claim private user facts.
- [ ] Neither Companion promises real-world action or consent on behalf of its user.

### E. Adversarial interruption

- [ ] Block the other account during an active conversation; the next turn is rejected and no further content is relayed.
- [ ] Remove the friendship during an active conversation; the next turn is rejected.
- [ ] Disconnect one device; the other device does not simulate the disconnected Companion.
- [ ] End the Visit early; both devices converge to a terminal Session.
- [ ] Restart either app during an active Session; Session state and prior turns reconcile without duplication.

### F. Outcome and local continuity

- [ ] Both devices display the same Shared Moment title, summary and turn count.
- [ ] Each device displays its own Private Reflection.
- [ ] Private Reflections may differ and are not returned by the Network API.
- [ ] Reopening the terminal Session does not increment relationship continuity twice.
- [ ] A later Visit can reference the locally retained shared-interest continuity without exposing raw prior transcripts.

## Acceptance record

Record device OS, app commit SHA, Network commit SHA, server deployment identifier, pass/fail notes and screenshots for any failure before marking the MVP accepted.
