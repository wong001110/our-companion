# Motion Language

## Motion concept

Motion is a quiet acknowledgement of state change. It should feel tactile enough to connect dark shell, paper, and living character, while remaining fast, interruptible, and subordinate to content.

- **Existing and correct · Fact:** shared tokens define 80, 140, 200, and 260 ms durations with standard and exit easing.
- **Existing and correct · Fact:** Panel and Creation preserve outgoing content for an exit state, mount incoming content, then move focus meaningfully.
- **Existing and correct · Fact:** tested reduced-motion fallbacks remove spatial transforms from Panel, Creation, dialogs, toasts, Quick Actions, speech, composer, and selected feedback/asset surfaces.
- **Required · Recommendation:** network and visual-visitor motion joins the same token and reduced-motion system; it must not create a second game-like motion language.
- **Rejected · Recommendation:** full page turns for normal navigation, physics-heavy paper, elastic/bouncy easing, long blocking transitions, continuous parallax, or decoration that delays consent and safety actions.

## Duration ranges

| Purpose | Range | Current token/example | Direction |
|---|---:|---|---|
| Immediate acknowledgement | 60–100 ms | `--motion-instant: 80ms` | Press/selection state only |
| Small UI enter/exit | 120–160 ms | `--motion-fast: 140ms` | Menus, toast exit, speech exit, quick state changes |
| Standard transition | 160–220 ms | `--motion-normal: 200ms`; Panel enter 180 ms | Page/card/dialog entrances |
| Calm emphasis | 220–300 ms | `--motion-slow: 260ms`; Quick Action burst ~200–220 ms | Rare, nonblocking authored feedback |
| Character locomotion | Distance-based | Remote visitor speed controller | Never applied to operational UI |

- **Required:** no routine UI transition exceeds 300 ms.
- **Required:** actions become logically active immediately; visual settling may complete afterward.
- **Recommended:** normalize remaining literal `0.12s`, `0.15s`, `0.25s`, and `0.3s` values to shared tokens during future CSS maintenance without changing tested behavior abruptly.

## Easing rules

- **Standard enter/change:** `cubic-bezier(0.2, 0.8, 0.2, 1)` (`--ease-standard`). Fast arrival with a calm settle.
- **Exit:** `cubic-bezier(0.4, 0, 1, 1)` (`--ease-exit`). Direct and slightly faster than entry.
- **Opacity-only:** standard easing; linear is acceptable only for true determinate progress.
- **Character walk:** linear position interpolation; sprite timing comes from the verified manifest.
- **Rejected:** bounce, overshoot, spring, or ease-in-out on repeated work indicators.

## Interrupt behavior

1. User input may interrupt any nonessential transition.
2. The newest navigation target wins. Existing rapid-navigation behavior is **Existing and correct**.
3. Exit animations never retain an interactive invisible surface; exiting content gets `pointer-events:none`.
4. A dialog or safety action is never delayed by decorative page or character motion.
5. Reconnect, block, friendship removal, unpublish, or authorization loss may remove a visitor immediately; privacy outranks Leave animation completion.
6. When a component reverses during exit, cancel the pending unmount and animate from the currently rendered state rather than restarting from hidden.
7. Focus moves only when the destination is mounted and meaningful; it does not chase intermediate rapid-navigation targets.

## Repeated-trigger behavior

- **Buttons/mutations:** disable or deduplicate while a request is active. Existing Social `busyAction`, Asset publish cancellation, and Visit prepare promise deduplication are correct foundations.
- **Navigation:** repeated selection of the current tab does not replay entry motion or reset scroll unless an explicit “scroll to top” behavior is later defined.
- **Quick Actions:** visibility timers do not restart while already open; pin state wins over hover leave; a second Companion click closes.
- **Speech:** a new utterance replaces or queues according to presentation policy; it does not stack multiple paper bubbles in the same position.
- **Toasts:** identical rapid outcomes should update/coalesce rather than create an unreadable stack. This is **Recommended**; current toast IDs allow multiple entries.
- **Network invalidations:** debounce and refetch once. Existing Social 200 ms refetch scheduling is **Existing and correct**.
- **Invitation/Visit mutations:** repeated accept/start/end resolves from authoritative idempotent/conflict response and refetches; it does not replay ceremony.

## Reduced-motion contract

When `prefers-reduced-motion: reduce` is active:

- Preserve state changes, focus handoff, visibility, duration bounds, and completion callbacks.
- Replace translate, scale, burst, slide, page turn, pulse, blink, and decorative locomotion with opacity or immediate state changes.
- Stop looping nonessential spinners and show a static progress/status label. Existing `LoadingState` behavior is **Existing and correct**.
- Stop the speech cursor blink and listening pulse; existing CSS does this.
- Do not animate progress width; existing `ActionProgress` CSS does this.
- Remote visitor Enter/Leave resolves without spatial ceremony; visitor remains in a stable idle position during an active Visit. Autonomous walking is disabled because it is repeated nonessential locomotion. This is **Required** and is not covered by the current reduced-motion tests.
- Local Companion motion follows the existing character-engine reduced-motion policy if one exists; a complete runtime verification was not found in the inspected UI test suite and must be verified before claiming full coverage.

## Presence utility

`components/motion/Presence.tsx` is the shared mount/enter/exit lifecycle for transient React surfaces.

- **Existing and correct:** it preserves children for exit and exposes `entering`, `entered`, and `exiting`.
- **Required:** use it for new invitation details, notification rows/toasts, banners, and menus that need exit completion.
- **Required:** lifecycle duration and CSS duration stay synchronized; a removed element must not linger after its visual exit.
- **Rejected:** using Presence for long page-turn scenes or keeping hidden interactive content mounted indefinitely.

## Panel transitions

### Current contract

- Outgoing page: 140 ms opacity + 3 px upward exit.
- Incoming page: starts 4 px below and enters over 180 ms.
- Workspace scroll resets to 0.
- Incoming page receives focus.
- Reduced motion keeps opacity and removes transforms.

### Direction

- **Existing and correct:** preserve this lifecycle and the test that the newest rapid target wins.
- **Required:** do not add page curl, seam movement, rings, or literal page flipping.
- **Recommended:** a future very subtle paper-opacity/lighting shift may be explored only if it remains within 180–220 ms and disappears under reduced motion.
- **Rejected:** crossfading two fully interactive pages or moving the sidebar with page content.

## Notebook transitions

- **Required:** normal cards are present with the page; do not stagger every card.
- **Recommended:** a newly created Journey or saved Memory may fade/highlight once for 160–220 ms, then settle. Focus or toast confirms the action.
- **Recommended:** filters rearrange content without rotation or large spatial travel; use opacity for changed results if needed.
- **Optional:** a single taped label may settle by 1–2 degrees on first page entry, but this is decorative, disabled under reduced motion, and must not affect layout.
- **Rejected:** loose papers flying in, simulated handwriting that delays text, randomized card shuffling, or page-edge drag navigation.

## Feedback transitions

### Dialogs

- Existing backdrop fast fade and dialog 200 ms opacity/6 px/0.97 scale are appropriate.
- Exit is about 150 ms and focus returns to the opener.
- Reduced motion is opacity-only.
- Busy dialogs do not close by backdrop or Escape if doing so would abandon an in-flight destructive operation.

### Toasts and notices

- Toast: 140 ms opacity + 6 px vertical movement; opacity-only when reduced.
- Inline notice and Section Error should appear in document flow without dramatic entry.
- Success highlight is one-shot; errors do not shake.

### Progress

- Determinate progress width may interpolate over 200 ms in normal motion.
- Verification/indeterminate work uses a calm, nonspatial indicator plus text. Under reduced motion, the label updates without animation.
- A completed progress bar does not auto-transform into a confetti state.

### Classification

- **Existing and correct:** Dialog, toast, spinner, and progress reduced-motion rules.
- **Required:** consistent adoption for Social, Network, and inline Chat clearing.

## Quick Actions and Overlay transitions

### Visibility timing

- **Existing and correct:** 220 ms hover intent delay and 420 ms leave grace prevent flicker.
- **Existing and correct:** Companion click pins; second click, Escape, drag, away mode, Panel opening, or action completion closes.
- **Existing and correct:** edge-aware placement flips bubbles inside the work area.

### Visual timing

- Quick Action bubble burst: ~200 ms from nearby offset/0.82 scale to settled.
- More menu: 140 ms enter/exit.
- Speech Bubble and composer: 140–160 ms enter; 150 ms exit.
- Soft hint: currently 300 ms; **Recommended** to normalize to 200–260 ms.

### Direction

- **Required:** opening the Panel closes transient Quick Actions before or concurrently with Panel focus; it does not leave desktop actions visually behind.
- **Required:** when owner presence changes to `away_visiting`, Quick Actions exit and cannot reopen until home.
- **Required:** reduced motion uses fade only, as current tests require.
- **Rejected:** orbiting actions, repeated bobbing, or speech-bubble bounce.

## Chat transitions

- Stored history appears immediately or with a single container fade; messages do not replay typewriter animation.
- A newly sent message may appear with a 140–180 ms opacity change after optimistic or authoritative insertion.
- Sending state changes the button label and disables duplicate sends; composer height changes without bounce.
- Search/filter result changes do not auto-scroll unless the user is already following the newest message.
- Auto-scroll to the bottom uses smooth scrolling only when motion is allowed and the user is already near the bottom. Under reduced motion, use immediate scroll. Current code always requests `behavior:'smooth'`; this is **Existing but incomplete**.
- Clear history uses dialog transition, then an immediate empty state plus success acknowledgement.

## Network invitation transitions

### Invitation arrival

- Socket invalidation schedules a refetch; the authoritative pending row fades into its stable list position over 140–200 ms.
- Do not animate a sealed envelope or interrupt the current page.
- A polite live update and unread count are sufficient if Notifications are later integrated.

### Accept/decline/cancel

- On action, keep the card in place with a busy label.
- On authoritative terminal response, crossfade the state/actions; remove from the pending list after a brief outcome or refetch.
- Acceptance transitions to Visit preparation, not directly to an animated visitor.
- Conflict/expiry crossfades to the returned state and presents plain remediation.

### Reconnecting

- Preserve safe prior content with a static reconnecting banner; disable or clearly gate mutations.
- Do not repeatedly fade the entire Social page with every reconnect attempt.

## Visitor enter, idle, walk, and leave

### Verified current behavior

- Host visitor runtime begins `entering` with the Pack's `Enter` animation.
- Completion changes to idle.
- After deterministic 2–6 second idle delays, a local controller selects a new target and walks at a distance-based speed using cardinal/optional diagonal animations.
- `Leave` completes before the runtime is removed when normal terminal state allows it.
- Position and animation are local-only; the Network stores neither.

### Rules

- **Existing and correct:** use only verified manifest animations and timing; remain pointer-transparent; clamp to the work area.
- **Required:** character animation does not determine server state. If the session is not authoritatively active, no visitor is created.
- **Required:** Enter plays once per new runtime ID. Reconnect recovery of the same session should not repeatedly replay an arrival if the local runtime was only briefly paused; exact recovery behavior needs a retained-runtime design decision.
- **Required:** Idle loops according to manifest only while active.
- **Required:** Walk target selection stays local and avoids covering the local Companion's primary action region when practical; no click interaction is implied.
- **Required:** Leave is best effort. Authorization loss, block, friendship removal, or renderer failure may remove immediately.
- **Required:** under reduced motion, use a static idle visitor at a clamped stable position, with no autonomous walking; Enter/Leave completion is immediate or opacity-only.
- **Recommended:** cap continuous walking frequency so the visitor spends more time idle than moving; the current 2–6 second schedule may be too active and should be observed in user testing.
- **Rejected:** remote-controlled movement, synchronized position over Network, collision games, speech/AI behavior for the visitor, or movement behind a modal that requires attention.

## Panel and Companion Overlay synchronization

The authoritative sequence is:

1. Network status/session changes in the main process.
2. REST reconciliation produces a renderer-safe `VisitSessionSummary` and `VisualVisitRendererState`.
3. Panel Social renders consent/session state from summaries.
4. Overlay renders `ownerPresenceMode` and optional `visitor` from `VisualVisitRendererState`.
5. Local animation completion updates only local visual phase; it never mutates the server session.

### Required synchronization rules

- `ownerPresenceMode:'away_visiting'` → local Companion plays Leave once, becomes hidden, Quick Actions close, Social shows the owner-side active Visit.
- Return to `home` → local Companion plays Enter once when authorization/session becomes terminal or no active owner session remains.
- Host `visitor` present → Overlay enters/renders it and Social says which Companion is currently visiting.
- Active session with no host visitor because assets/renderer failed → Social remains active with renderer failure explanation and End Visit available.
- `reconnecting` → Panel shows reconnecting; host visitor may be removed to avoid stale presence; owner must not be shown home solely because the socket dropped if the main process retains authoritative owner-away state.
- Terminal/refetched session → Social outcome updates and Overlay leaves/removes/returns accordingly.
- Panel opening/closing does not restart character arrival/departure.

### Classification

- Main-process ownership and sanitized state are **Existing and correct**.
- Clear UI differentiation of authoritative session vs visual-renderer failure is **Required**.
- Full reduced-motion handling for remote visitors and recovery without repeated Enter is **Required** and not verified by current UI tests.

## Testing requirements

- Preserve current Panel, Creation, feedback, speech, Quick Actions, and reduced-motion assertions.
- Add reduced-motion tests for Remote Visitor: no autonomous position change, no spatial Enter/Leave, terminal removal completes.
- Add rapid Network invalidation tests: one refetch, no stale duplicated invitation, newest authoritative session wins.
- Add reconnect tests that compare Panel session copy and Overlay presence mode.
- Add interruption tests for block/unpublish/friend removal during Enter, idle, and walk.
- Add Chat test ensuring reduced motion avoids smooth auto-scroll.
- Validate all motion at the supported Panel widths and in English/Simplified Chinese; copy reflow must not change lifecycle timing.
