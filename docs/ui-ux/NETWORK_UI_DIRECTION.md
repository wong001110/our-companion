# Network UI Direction

## Verified architecture and authority

The Network is a consent and coordination service, not a remote Companion runtime.

- **Existing and correct · Fact:** REST is authoritative. Socket events are minimal invalidations and the desktop refetches REST records.
- **Existing and correct · Fact:** the current protocol is `0.4`; minimum desktop/server version is `0.4.0`.
- **Existing and correct · Fact:** the client exposes accounts, friends, presence, published Companions, Asset Packs, Visit Invitations, Visit Sessions, and visual Visits through main-process services and a sanitized preload API.
- **Existing and correct · Fact:** the renderer does not receive storage credentials, object keys, access tokens, presigned URLs, local file paths, or remote control commands.
- **Required · Recommendation:** Network UI must describe what is shared, who can receive it, and what happens next using direct language before any metaphor.

The verified current implementation, Network root README and `docs/social` contracts use `/api/visit-invitations`, `/api/visit-sessions`, dot-style invalidation events, and the S4/S5 lifecycle described below. **Required:** product/UI work must continue to follow current controllers, shared types, and social contracts rather than encoding stale route or event names into UI.

The correspondence metaphor is limited to section identity: address book for friends, letter/invitation for a Visit request, arrival/departure for active visual presence. Controls remain conventional.

## Global Network information architecture

### Settings > Online

Owns connection and account setup:

- Online Mode enable/disable.
- Server URL and signed-in server scope.
- Register, login, logout.
- `checking_server`, `authentication_required`, `connecting`, `online`, `reconnecting`, `incompatible_client`, `server_unavailable`, `authentication_failed`, `disabled`, and offline status.
- Retry/remediation and compatibility explanation.

### Social

Owns relationship and sharing:

- Account summary and own Friend Code.
- Friend lookup, requests, friends, presence, and blocked users.
- Published Companion and Asset Pack status.
- Visit invitations, current Visit session, recent terminal outcome.
- Future notification inbox if the desktop contract is added.

- **Existing and correct · Fact:** Social is a top-level Panel destination, not nested under Settings.
- **Required · Recommendation:** technical server configuration remains out of Social except for a concise unavailable banner with a link/action to Settings > Online.

## Connection and availability states

| Client state | UI meaning | Required primary action | Classification |
|---|---|---|---|
| `disabled` | Online Mode is off by user choice | Enable Online Mode | Existing and correct |
| `offline` | Local/offline mode; no active network session | Enable/retry depending on setting | Existing but incomplete |
| `checking_server` | Validating server and protocol | Wait; Cancel is optional | Required |
| `authentication_required` | Server is reachable; sign-in needed | Log in or create account | Existing and correct |
| `connecting` | Authenticated socket/connection is being established | Wait; keep prior non-sensitive content if scoped | Required |
| `online` | Network actions are available subject to feature flags | Normal Social UI | Existing and correct |
| `reconnecting` | Temporary gap; REST/session may be stale | Show reconnecting, retain safe cached rows, disable mutations that cannot be queued | Required |
| `incompatible_client` | Protocol/client version is unsupported | Update client; do not offer retry loop | Existing but incomplete |
| `server_unavailable` | Server or configured storage-dependent features unavailable | Retry or review server | Existing but incomplete |
| `authentication_failed` | Credentials/session could not be restored | Log in again | Existing and correct |

- **Required · Recommendation:** show “Online Mode enabled” separately from “Connected.” A toggle is configuration, not live status.
- **Required · Recommendation:** scope retained Social data by `serverUrl + account.id`; the view model already clears on scope changes and this privacy behavior must remain.
- **Required · Recommendation:** when reconnecting during a Visit, distinguish authoritative session recovery from local visitor rendering. The visitor may be temporarily removed while the session is refetched.

## Accounts

### Current facts

- Registration/login use email and password; registration also uses a unique username.
- Auth uses access and per-device refresh sessions. Logout can report remote revocation confirmation.
- The renderer-safe account contains `id`, `email`, `username`, and eight-character `friendCode`.
- The server has an optional Profile model, but the current desktop Network contract and Social identity primarily use username/Friend Code.

### Direction

- **Existing and correct:** keep account forms in Operational Paper with visible labels and conventional password fields.
- **Required:** show server scope on login/account surfaces; changing a signed-in server keeps the existing shared confirmation dialog.
- **Required:** registration states include idle, validating, submitting, field/server error, rate limited, success/connected, and account created but connection still establishing.
- **Required:** login states include submitting, invalid credentials, rate limited, server unavailable, incompatible client, and success.
- **Required:** logout explains whether local credentials are removed and whether remote revocation was confirmed; do not imply a confirmed server logout when offline.
- **Recommended:** use a compact account card with username, server label, Friend Code, connection status, and Logout. Email is secondary/private and need not dominate Social.
- **Rejected:** avatar/profile-publicity controls until the client contract and privacy model for them are finalized.

## Friend Codes

### Current facts

- Server lookup normalizes to uppercase and accepts exactly eight ASCII alphanumeric characters.
- Friend Code is unique and shareable; the current client supports copy with a manual-select fallback message.

### Direction

- **Existing and correct:** render the user's code prominently, group characters visually only if copied value remains unmodified, and preserve a Copy action.
- **Required:** use a UI/monospace face with distinct `0/O` and `1/I`; expose the raw eight-character value to selection and assistive technology.
- **Required:** copy success is a polite status and copy failure preserves selectable text.
- **Recommended:** call it “Friend Code” consistently in both locales; avoid implying it is an authentication secret.
- **Rejected:** QR code or image asset as a requirement. It is unnecessary until a camera/mobile flow exists.

## Friend lookup

### Domain states

The server returns `none`, `friend`, `incoming_request`, or `outgoing_request`. Blocked relationships intentionally return the same not-found behavior as an invalid/unavailable code. The client currently expects `friends`/`blocked` in one message mapping; that does not exactly match the server's verified `friend` value.

- **Required:** align the renderer relationship mapping with the server contract; do not display “blocked” as a lookup relationship because the server intentionally conceals it.
- **Required:** states are untouched, invalid format/not found, searching, result with `none`, existing friend, incoming request, outgoing request, and rate-limited/offline error.
- **Required:** if a reverse pending request exists and the user sends a request, the server may accept it. UI must refetch and show the resulting friendship rather than assume “sent.”
- **Recommended:** one stable result card below the field; identity, relationship, and next action in that order.
- **Rejected:** public directory/search, fuzzy matching, or profile browsing. Friend Code lookup is intentionally exact.

## Friend requests

### Current facts

- Persistent server statuses are `pending`, `accepted`, `rejected`, and `cancelled`; the desktop summary lists only pending incoming/outgoing rows.
- Incoming can Accept or Reject; outgoing can Cancel.
- Friend invalidations cause authoritative refetch.

### Direction

- **Existing and correct:** keep incoming and outgoing sections separate and actions visible.
- **Required:** row mutation states include accepting, rejecting, cancelling, already handled elsewhere, rate limited, offline/reconnecting, and sync failed.
- **Required:** after mutation, keep a brief inline outcome or toast, then remove the row after refetch. Do not leave a disabled pending row indefinitely.
- **Recommended:** show request age, not just username, when `createdAt` is available.
- **Optional:** a compact recent outcome history. It requires a deliberate client contract because current list endpoints return pending only.
- **Rejected:** decorative sealed envelopes that hide sender or actions.

## Friends and presence

### Current facts

- Friend rows provide username, Friend Code, `online|idle|offline`, and `hasPublishedCompanion`.
- Presence tracks authenticated connectivity/activity, includes a 45-second default disconnect grace in gateway tests, and defaults missing records to offline.
- Removing a friend ends active/preparing Visits between the two users.

### Direction

- **Existing and correct:** primary actions—view Companion and send Visit—remain visible; Remove and Block stay in overflow and require confirmation.
- **Required:** friend rows support loading, populated, no friends, presence unavailable/partial error, Companion unavailable, pending outgoing Visit, and live Visit conflict.
- **Required:** presence is a small text-plus-indicator state. “Offline” does not disclose exact last-seen unless policy and contract explicitly support it.
- **Required:** disable Send Visit with a visible reason for unpublished local Companion, missing visual animations, existing pending invitation, active non-terminal session, unsupported server feature, or reconnecting state.
- **Recommended:** sort by actionable state first (incoming/pending activity), then online/idle, then name; do not reorder continuously while keyboard focus is inside the list.
- **Rejected:** presence pulse animation, precise activity surveillance, or implying that online means willing to host.

## Notifications

### Verified mismatch

The Network repository has a `Notification` model and REST/WebSocket module with list (up to 50), unread count, mark-one, mark-all, delete, and `notification:new`. The current desktop shared/preload Network API does not expose a notification list or unread count, and the newer social domain primarily uses typed minimal invalidations (`friend.*`, `companion.*`, `visit.*`) rather than persisted notifications.

- **Existing but incomplete · Fact:** server capability exists; client integration and product semantics are not verified.
- **Required:** do not add a decorative bell/inbox UI until the product decides whether notifications are persisted user-facing records, ephemeral invalidations, or both.
- **Required:** if implemented, define allowed notification types, localized client-owned copy, deep-link targets, retention, deletion semantics, and behavior for records whose underlying friend/Visit is no longer available.
- **Recommended:** a compact Social correspondence inbox with unread text count, mark read/all, and stable rows. Socket payload triggers refetch; it does not become display copy by itself.
- **Rejected:** rendering server-provided title/message as trusted localized UI without a type schema, or using notifications as the authority for Visit consent/session state.

## Published Companions

### Current facts

- A Network Companion has a server-generated ID separate from the local Companion ID.
- Allowed fields are owner ID, approved name, optional public description, normalized tags, `friends_only` visibility, published state, and active Asset Pack ID.
- A user has zero or one active Network Companion. Only accepted, unblocked friends can read its published active profile.
- Unavailable cases intentionally collapse to `404 COMPANION_NOT_AVAILABLE`.

### Direction

- **Existing and correct:** place the privacy boundary before the publish form and label visibility as friends only.
- **Required:** distinguish local Companion selection, Network profile draft, active Network Companion, active Asset Pack, and published visibility. “Uploaded” is not “published.”
- **Required:** states include no local Companion, draft/unpublished, profile validation error, no active pack, publishing, published, updating, unpublishing, unavailable/storage feature disabled.
- **Required:** Unpublish uses confirmation explaining that future authorization stops, while prior cache and already-issued short-lived URLs cannot be retroactively revoked immediately.
- **Recommended:** friend-side preview resembles a restrained profile letter with name, description, tags, and asset availability; download remains an explicit operational action.
- **Rejected:** displaying or transmitting memories, diary, prompts, relationship state, personality values, local IDs/paths, account email, desktop permissions, or device state.

## Asset Packs

### Current facts

- Pack V1 is immutable and canonical-hash addressed.
- Required base animations are `Idle_Neutral`, `Enter`, and `Leave`; visual Visits additionally require `Walk_Left`, `Walk_Right`, `Walk_Up`, and `Walk_Down`; diagonal directions are optional.
- Server states are `draft`, `uploading`, `verifying`, `active`, `superseded`, `deleting`, `failed`, `abandoning`, and `abandoned`.
- Client progress states are `preparing`, `uploading`, `verifying`, `completed`, `failed`, and `cancelled`.
- Voice is included only by explicit opt-in. Storage feature failure disables public Companion/Asset/visual Visit flags without disabling basic account/friend features.

### State presentation

| State | User-facing label and treatment | Action |
|---|---|---|
| Draft/inspected | Ready to publish; files/size summarized | Publish |
| Preparing | Validating and building immutable manifest | Cancel if supported |
| Uploading | Determinate bytes/files progress | Cancel |
| Verifying | Server is checking files; no fake percent | Wait; retry only on retryable failure |
| Active | Current verified pack | None or replace with new publish |
| Superseded | Older pack retained temporarily / pinned by live Visit | Optional history detail |
| Failed | Explain integrity, quota, expired session, or retryable verification category | Retry inspect/publish or review assets |
| Cancelling/abandoning | Cancellation requested; cleanup pending | Wait |
| Abandoned/deleting | Terminal maintenance state | Hide from normal flow; show in advanced history only |

- **Existing and correct:** `ActionProgress` exposes progress semantics and the UI polls main-process status while busy.
- **Required:** map structured state/failure codes instead of only free-form success/failure strings.
- **Required:** long hashes, file names, and sizes use selectable technical styling; object keys and signed URLs never appear.
- **Required:** active/superseded Packs referenced by a non-terminal Visit remain understandable as immutable snapshots; publishing a new Pack does not visually replace the active visitor mid-session.
- **Recommended:** keep pack history collapsed unless troubleshooting.
- **Rejected:** a new image asset for upload/verification; CSS progress and icons are sufficient.

## Visit invitations

### Current facts

- Direction is one-way: the Visitor Owner sends their active published Network Companion to a Host friend.
- Creation accepts only `hostUserId`; the server snapshots the public Companion fields and immutable active Pack.
- Invitation statuses: `pending`, `accepted`, `declined`, `cancelled`, `expired`.
- Default invitation TTL is 24 hours (configurable 1–168 hours).
- Only one pending invitation for the same owner/host/Companion is allowed, and only one non-terminal session per participant is allowed.

### Direction

- **Required:** invitation card shows sender/host role, Companion name, optional description/tags, expiry, and explicit Accept/Decline or Cancel.
- **Required:** accepting is consent to a visual-only Companion visit, not remote desktop access. State this in concise help text on first use or in a privacy disclosure linked from the card.
- **Required:** accept may fail because assets became unavailable, invitation expired, friendship/block changed, participant is already in a live session, or feature/storage is unavailable. Refetch before showing the final state.
- **Required:** accepted, declined, cancelled, and expired are terminal visual states with no active buttons.
- **Recommended:** use a restrained invitation/letter heading cue; keep actions exposed without requiring an “open” animation.
- **Rejected:** auto-accept, visitor preview walking before acceptance, or sender-controlled message/content beyond the approved public snapshot.

## Active Visit Sessions

### Authoritative state map

| Session state | Meaning | Who acts | UI |
|---|---|---|---|
| `preparing` | Both participants prepare; Host downloads/verifies Pack, Owner verifies local mapping | Each marks ready after local preparation | Show each role's readiness and cancellable progress |
| `ready` | Both ready | Host only starts | Host sees Start Visit; Owner sees waiting for Host |
| `active` | Consent and assets are valid; visual presence may render | Either can end | Show active status, role, elapsed time, End Visit |
| `ending` | Terminal transition claimed/in progress | No repeated end | Show ending; disable mutation |
| `ended` | Active Visit finished | None | Show neutral completion and reason where useful |
| `cancelled` | Preparation/ready ended before active | None | Show cancelled and reason |
| `failed` | Session failed | None/retry through a new invitation | Show failure and safe next step |

Defaults verified in server configuration: preparation TTL 10 minutes, session maximum 30 minutes, heartbeat every 15 seconds, timeout at least 30 seconds and normally 60 seconds. Values are server-configurable; UI should use server-provided runtime values where exposed and must not hard-code promises about duration.

- **Existing and correct:** the desktop tracks heartbeats in the main process, deduplicates prepare calls, and restores tracking after reconnect.
- **Required:** preparing differentiates “preparing my side,” “I am prepared,” “waiting for friend,” and actionable failure.
- **Required:** `ready` exposes Start only to Host.
- **Required:** active Panel state and Overlay state agree: Owner is away visiting; Host sees remote visitor; Quick Actions are unavailable for the away local Companion.
- **Required:** socket invalidation never directly creates/removes a visitor. Refetched authoritative REST plus verified cached manifest drives rendering.
- **Recommended:** a simple labeled three-step timeline—Prepare, Ready, Visit—is sufficient; avoid game-like lobbies.

## Visit completion, cancellation, and failure

### Verified end reasons and local errors

Server end reasons include `host_ended`, `visitor_owner_ended`, `friendship_removed`, `user_blocked`, `companion_unpublished`, `preparation_timeout`, `session_timeout`, and `heartbeat_timeout`. Renderer-safe local visual errors include `VISUAL_VISIT_ASSET_UNAVAILABLE`, `VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE`, and `VISUAL_VISIT_RENDERER_UNAVAILABLE`.

- **Existing but incomplete · Fact:** current Social UI displays the terminal state and hides the specific `endReason` behind generic “reason unavailable” text.
- **Required:** map known end reasons to neutral, privacy-preserving localized explanations. Unknown reasons use a generic fallback and retain a diagnostic code only in developer details.
- **Required:** distinguish session failure from renderer-only failure. A host may have an active authoritative session even if local visitor rendering failed; End Visit must remain available.
- **Required:** on reconnect, show “Reconnecting to Visit” and re-fetch. Do not announce completion until authoritative state is terminal.
- **Required:** terminal state removes visual presence with Leave where safe; revocation/block/security events may remove immediately if waiting for animation would retain unauthorized presence.
- **Recommended:** show one recent terminal Visit under the current-session section, then move older history to an optional later history view.
- **Rejected:** celebratory completion for timeout/block/unpublish, exposing which party blocked whom, or retrying the same terminal session.

## Blocking and privacy

### Current facts

- Blocking removes friendship, cancels pending requests in both directions, and ends Visits immediately.
- Blocked lookup is intentionally indistinguishable from invalid/not found.
- Friendship removal and blocking are in an overflow and use a shared destructive confirmation in the current client.
- Unblocking does not automatically restore friendship.

### Direction

- **Existing and correct:** Block is danger-styled and confirmed; Remove Friend is destructive but visually less severe.
- **Required:** Block confirmation states its effects: friendship removed, requests cancelled, active Visit ended, future lookup/profile/Visit unavailable. Do not reveal whether the other user blocked the current user.
- **Required:** Unblock is direct but explains that friendship is not restored. A confirmation is optional because the action is reversible.
- **Required:** privacy disclosures use straight operational paper, normal UI typography, and short factual bullets.
- **Required:** no UI may imply that the Network stores local memories, diary, conversation, prompts, personality values, desktop state, permissions, local paths, or remote commands.
- **Rejected:** decorative “burn letter” blocking animation, public block lists, block-status badges on lookup, or remote revocation claims the server did not confirm.

## Missing and conflicting states in the current client

1. **Required:** a central Network state-to-copy/visual mapping instead of free-form strings and scattered switch statements.
2. **Required:** specific terminal Visit reason copy and renderer-only failure differentiation.
3. **Required:** reconnecting-with-prior-content Social state; current unavailable branch replaces the page for reconnecting.
4. **Required:** structured Asset Pack failure/retry mapping.
5. **Required:** stale-action conflict handling after invalidation/refetch.
6. **Required:** friend lookup relationship value alignment (`friend` server vs `friends` current renderer mapping).
7. **Recommended:** partial-domain notices that identify Friends, Presence, Visits, or Publishing without blanking successful sections.
8. **Unresolved:** persisted Notifications client contract and product role.
9. **Unresolved:** whether a user-facing Visit history beyond the latest terminal session is desired.
10. **Unresolved:** whether optional Profile display name/avatar should enter the desktop contract; it is not required for the current direction.

## Accessibility, responsive, and localization requirements

- Preserve current keyboard navigation, focus visibility, alert/status semantics, and destructive confirmation behavior.
- Social rows stack actions below identity at narrow widths; no horizontal data table is required.
- Codes, hashes, and URLs use `overflow-wrap:anywhere`/safe truncation while remaining selectable.
- English and Simplified Chinese copy is client-localized by stable domain code; do not display server English messages as primary UI.
- Relative times need accessible absolute timestamps or tooltips where expiry/action depends on them.
- Reduced motion removes invitation/visitor spatial decoration but never delays or omits state updates.
