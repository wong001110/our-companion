# Component Visual Rules

## Scope

These families extend the existing React and CSS foundation; they do not prescribe a rewrite. Implement against `NotebookPrimitives.tsx`, `components/feedback`, `components/motion/Presence.tsx`, the modular stylesheets, and the shared renderer contracts.

Within each family, its final **Classification** applies to the permitted rules and implementation work; every item under **Prohibited uses** is classified **Rejected**.

## 1. Application shell and responsive navigation

- **Semantic purpose:** locate the user in the desktop application and provide persistent top-level destinations and Exit.
- **Permitted variants:** full sidebar above 900 px; compact initial/icon rail at 900 px; horizontal top navigation at 760 px. The accessible name is always the full localized label.
- **Asset usage:** no raster assets required. Use CSS surfaces and, if icons are later introduced, a single SVG icon system.
- **Decoration level:** none.
- **Layout behavior:** navigation is visually separate from the scrolling workspace; all seven destinations remain reachable; Exit is separated from normal destinations.
- **Interaction states:** rest, hover, focus-visible, current (`aria-current="page"`), pressed, disabled only when a destination is genuinely unavailable.
- **Accessibility:** real buttons; full accessible names in compact modes; current state is not color-only; Space/Enter work; incoming page receives focus after exit/enter lifecycle.
- **Responsive behavior:** retain the verified 760/900/1180/1440 behavior and horizontal overflow at 760 px.
- **Implementation notes:** preserve `ResponsiveNavigation`, `PanelTab`, runtime tab validation, scroll reset, and `PanelShell` rapid-navigation behavior. Replace hard-coded initial letters with SVG icons only if localized usability testing supports it.
- **Prohibited uses:** tape, paper texture, rotation, hidden destinations, or icon-only Exit.
- **Classification:** **Existing and correct**; icon comprehensibility at narrow widths is **Existing but incomplete**.

## 2. Notebook page and section header

- **Semantic purpose:** establish an authored narrative context and page title.
- **Permitted variants:** Narrative Notebook page; restrained Operational Paper page. Eyebrow and date are optional; title is required.
- **Asset usage:** existing `paper-texture.webp`; CSS rules/margins/seam. A binding asset is optional and must not control layout.
- **Decoration level:** medium for narrative, low for operational.
- **Layout behavior:** title cluster precedes content in DOM; maximum readable line length for orientation copy; seam is cosmetic.
- **Interaction states:** none beyond page lifecycle.
- **Accessibility:** one page-level H1; dates use locale formatting; decorative texture and seam are ignored by assistive technology; focused page container has no decorative outline but retains meaningful focus handoff.
- **Responsive behavior:** padding reduces, header stacks, seam may disappear, and no content is forced into a two-page spread.
- **Implementation notes:** extend `NotebookPage` with a restrained variant rather than creating separate page frameworks. Keep `formatShortDate` locale-aware.
- **Prohibited uses:** full page-turn navigation, text across the seam, or fixed page dimensions.
- **Classification:** **Existing and correct** for narrative pages; a formal operational variant is **Recommended**.

## 3. Paper Card

- **Semantic purpose:** group related content or controls on paper.
- **Permitted variants:** narrative, operational, compact, selected, warning, danger; taped title is optional. A card is not automatically interactive.
- **Asset usage:** existing `paper-card-frame.png`; existing cream/pink/purple tape only when semantically pinned or authored. Semantic warning/danger uses CSS, not a new image.
- **Decoration level:** medium narrative; low operational; none on danger confirmation.
- **Layout behavior:** straight by default; stable padding; nested cards are limited to one level; content determines height.
- **Interaction states:** static, hover/focus only if the whole card is a real button/link, selected, loading, partial error, disabled child actions.
- **Accessibility:** use `section` with a heading for grouped content; interactive cards must be a single button/link with a clear name; never nest interactive descendants inside a card-button.
- **Responsive behavior:** grid cards collapse to one column; padding may reduce but touch target and text spacing do not.
- **Implementation notes:** extend `PaperCard` with `variant` and intentional `tape`; current CSS automatically adds cream tape to all paper cards, which is **Existing but incomplete** and should become opt-in for operational content.
- **Prohibited uses:** arbitrary rotation on forms, status tables, privacy copy, or destructive content; every block should not be a Paper Card.
- **Classification:** **Existing and correct** foundation; variant semantics are **Required**.

## 4. Sticky Note and next-step note

- **Semantic purpose:** a short aside, next step, companion suggestion, or temporary reminder.
- **Permitted variants:** default, compact, informational, completed; maximum one concise action.
- **Asset usage:** existing `sticky-note-frame.png`; tape optional.
- **Decoration level:** medium.
- **Layout behavior:** short content only; may sit beside Journey content at wide widths and stack below it when narrow.
- **Interaction states:** static or one linked action; selected/disabled only if interactive.
- **Accessibility:** heading is optional but content must make sense without shape/color; rotation cannot affect focus ring clipping.
- **Responsive behavior:** remove rotation at narrow widths if it causes clipping; no fixed width below the Panel breakpoint.
- **Implementation notes:** preserve `StickyNote`; enforce content guidelines rather than measuring text in code.
- **Prohibited uses:** passwords, consent, errors, long instructions, tables, or multiple destructive actions.
- **Classification:** **Existing and correct**.

## 5. Photo/evidence card

- **Semantic purpose:** connect a discovery or memory to actual visual evidence.
- **Permitted variants:** image available, no image, loading image, failed image, sensitive/blocked preview.
- **Asset usage:** existing `photo-frame.png` as decoration; actual source image only when available and authorized. Use CSS initials/source mark for no-image state.
- **Decoration level:** medium-high on narrative pages only.
- **Layout behavior:** consistent 4:3 preview region by default, object-fit based on content, text and actions below; stable grid.
- **Interaction states:** image loading, loaded, failed, card hover only when linked, saved/favorite, action busy.
- **Accessibility:** meaningful images receive concise alt text; decorative frames are hidden; source, title, and action are text; failed images expose status without repeating the title.
- **Responsive behavior:** auto-fit grid with a readable minimum; one column on narrow views; do not crop essential text embedded in imagery.
- **Implementation notes:** current `photo-thumb` is a generated source abbreviation rather than real evidence. Retain it as the no-image state and add authorized-image support later.
- **Prohibited uses:** stock filler images, background images behind text, or new assets for every card category.
- **Classification:** no-image state is **Existing and correct**; real evidence loading/failure states are **Required**.

## 6. Doodle and decorative marker

- **Semantic purpose:** reinforce narrative category or emotion without carrying the only meaning.
- **Permitted variants:** book, heart, map, sparkle, star; lightweight CSS line/check/route markers.
- **Asset usage:** existing 96×96 transparent PNG doodles. Prefer current assets or CSS/SVG for scalable functional icons.
- **Decoration level:** low, one per content cluster.
- **Layout behavior:** anchored away from text and controls; never changes layout metrics.
- **Interaction states:** none.
- **Accessibility:** always `aria-hidden`; adjacent text supplies meaning.
- **Responsive behavior:** hide optional doodles when space is constrained.
- **Implementation notes:** replace text placeholders such as `map` with the existing map doodle where it improves meaning, but keep a visible text title.
- **Prohibited uses:** focus targets, state-only indicators, repeated wallpaper, or decoration in warnings/dialogs.
- **Classification:** assets are **Existing and correct**; consistent mapping is **Recommended**.

## 7. Buttons, links, chips, and segmented controls

- **Semantic purpose:** perform actions, navigate, filter, or select one option.
- **Permitted variants:** primary, secondary, ghost, danger, compact; filter chip (`aria-pressed`); tab (`role="tab"`); segmented preview control.
- **Asset usage:** CSS only; optional SVG icon plus visible label.
- **Decoration level:** none.
- **Layout behavior:** primary action appears first in visual importance, not necessarily first in DOM when dialog conventions require Cancel first; action rows wrap.
- **Interaction states:** rest, hover, active, focus-visible, disabled, busy. Busy preserves width where possible and prevents repeated mutation.
- **Accessibility:** minimum practical 40–44 px target in navigation and primary controls; visible focus; label is not icon-only for unfamiliar actions; `aria-pressed`/`aria-selected` reflect state; danger is not color-only.
- **Responsive behavior:** wrap, then stack; do not shrink text below readable size. Horizontal filter rows may wrap rather than scroll unless there are many categories.
- **Implementation notes:** reuse `controls.css`; normalize remaining hard-coded transition values to motion tokens. Settings category tabs should add proper tabpanel relationships in a future accessibility pass.
- **Prohibited uses:** handwritten image buttons, postage stamps as controls, disabled controls without an explanatory hint when the reason is non-obvious.
- **Classification:** **Existing and correct** foundation; complete busy/reason patterns are **Required**.

## 8. Form field and code field

- **Semantic purpose:** collect or display user-editable values and stable identifiers.
- **Permitted variants:** text, email, password, textarea, select, checkbox, range, search, read-only code/friend code, URL. Required/error/help states are explicit.
- **Asset usage:** CSS only.
- **Decoration level:** none.
- **Layout behavior:** visible label above control; help and error below; one-column forms by default; related short fields may share a row at wide widths.
- **Interaction states:** rest, hover, focus, filled, disabled, read-only, validating, valid, invalid, saving.
- **Accessibility:** native controls; associated labels; errors use `aria-describedby` and alert/status appropriately; passwords are never rendered in decorative fonts; code remains selectable if copy fails.
- **Responsive behavior:** full width, natural text wrapping, no fixed label column in Chinese.
- **Implementation notes:** current forms are conventional but globally inherit Xiaolai. Apply a body/UI family to controls, Social, Settings, Creation, and technical data. Friend code normalization remains uppercase eight-character alphanumeric as enforced by the server.
- **Prohibited uses:** rotated fields, placeholder-only labels, tape as validation, or color-only success.
- **Classification:** structure **Existing and correct**; typography and consistent validation wiring **Required**.

## 9. Status badge, presence indicator, and connection banner

- **Semantic purpose:** communicate a compact state without replacing the full explanation.
- **Permitted variants:** neutral, success, idle/warning, offline/muted, reconnecting, danger, pending, active, terminal.
- **Asset usage:** CSS shape/icon and text; no raster assets.
- **Decoration level:** none.
- **Layout behavior:** badge sits beside the subject; banners sit at the section/page boundary and include remediation when available.
- **Interaction states:** static; reconnecting may update text but does not loop spatially.
- **Accessibility:** text label always present or available to assistive technology; `role=status` for noncritical change, `role=alert` for action-blocking failure; timestamp/last seen is supplementary.
- **Responsive behavior:** badges wrap; banners stack action below text.
- **Implementation notes:** map `NetworkConnectionState`, `FriendPresence`, invitation/session states, and Asset Pack states centrally. Do not let each page invent colors.
- **Prohibited uses:** green for merely enabled, animated pulsing for persistent online, or “offline” represented only by lower opacity.
- **Classification:** presence text exists; a shared mapping component is **Required**.

## 10. Feedback family

- **Semantic purpose:** show loading, empty, partial error, success, progress, or confirmation.
- **Permitted variants:** `LoadingState`, `EmptyState`, `SectionError`, `InlineNotice`, `ActionProgress`, toast, `ConfirmDialog`.
- **Asset usage:** CSS only.
- **Decoration level:** none; the containing page may supply paper identity.
- **Layout behavior:** section-level feedback replaces or precedes the affected section, not the whole page when other domains remain usable.
- **Interaction states:** entering, entered, exiting; retry, cancel, confirm; progress determinate or clearly labeled indeterminate.
- **Accessibility:** existing live-region and alert semantics; dialog traps focus, Escape closes when not busy, Cancel receives initial focus, opener focus is restored; progressbar supplies min/max/value/label.
- **Responsive behavior:** dialog fits viewport; notices and actions wrap; toast width is bounded.
- **Implementation notes:** preserve `Promise.allSettled` partial availability and the tested `Presence` lifecycle. Replace ad hoc `<p role="alert">` and inline clear confirmation with shared primitives where consequences warrant it.
- **Prohibited uses:** toast-only critical errors, auto-dismissed destructive confirmation, spinner without label, or decorative character reaction as the error explanation.
- **Classification:** **Existing and correct** foundation; consistent adoption is **Required**.

## 11. Conversation bubble and composer

- **Semantic purpose:** distinguish companion, user, and system messages and allow Panel text input.
- **Permitted variants:** companion, user, system, error/empty transcript, voice source, Panel source, sending.
- **Asset usage:** existing companion/user bubble frames and tails; speech-bubble asset for Overlay. System/error can use CSS or the companion frame without a tail.
- **Decoration level:** low-medium.
- **Layout behavior:** maximum line length, clear speaker alignment, timestamp/source in footer; composer remains stable at the end of the chat view.
- **Interaction states:** filter/search, empty, sending, send failure, clear confirmation, history loading.
- **Accessibility:** live speech uses polite announcements; history is not an uncontrolled live log; composer label is available; Enter sends and Shift+Enter inserts newline; error text is announced.
- **Responsive behavior:** bubbles expand to a larger percentage at narrow widths; tails and border slices must not clip; composer actions stack.
- **Implementation notes:** keep `NotebookChatBubble` and `SpeechBubbleOverlay` separate because one is history and one is transient presence. Replace inline clear-history question with `ConfirmDialog` if clearing remains irreversible.
- **Prohibited uses:** typewriter animation for stored history, handwritten long body copy, or auto-scroll that steals focus.
- **Classification:** **Existing and correct** core; loading/send failure and shared clear confirmation are **Existing but incomplete**.

## 12. Social identity, friend, request, and invitation row

- **Semantic purpose:** present one person/relationship and its available actions.
- **Permitted variants:** lookup result, friend, incoming request, outgoing request, blocked user, incoming Visit invitation, outgoing invitation.
- **Asset usage:** optional authorized avatar/Companion portrait; otherwise CSS initial. Correspondence decoration is section-level, not per row.
- **Decoration level:** low.
- **Layout behavior:** identity and current state first; primary action visible; Remove and Block remain in overflow; invitation expiry is visible.
- **Interaction states:** loading, action busy, stale/refetching, accepted/rejected/cancelled/expired, partial error, disabled with reason.
- **Accessibility:** each row has a heading or accessible group label; overflow uses a button/menu pattern rather than relying on `<details>` if robust keyboard focus management is needed; destructive actions open `ConfirmDialog`.
- **Responsive behavior:** actions wrap below identity; codes wrap or truncate visually while remaining copyable; no horizontal table dependency.
- **Implementation notes:** current rows are repeated `online-user-info`/`action-row` markup. Introduce a reusable row component after state mapping is agreed; preserve renderer calls and Network authority.
- **Prohibited uses:** envelope-opening interaction as a prerequisite to Accept/Decline, hidden expiry, decorative “reject” wording, or showing blocked relationships in lookup results.
- **Classification:** current behavior **Existing and correct**; reusable hierarchy and stale-state handling **Required**.

## 13. Published Companion and Asset Pack surface

- **Semantic purpose:** define the minimal friends-only profile and publish an immutable verified visual pack.
- **Permitted variants:** no local Companion, draft profile, inspected, preparing, uploading, verifying, active/published, superseded, failed/retryable, cancelled, unpublished.
- **Asset usage:** actual local Companion preview and manifest-derived metadata; no new decorative assets.
- **Decoration level:** low.
- **Layout behavior:** privacy boundary precedes fields; inspection summary precedes Publish; progress remains in place; advanced pack history may collapse under details.
- **Interaction states:** field validation, inspect busy/error, publish progress, cancel requested, completed, unpublish confirmation, storage unavailable, quota/integrity failure.
- **Accessibility:** progress is a labeled progressbar; status is a live region; file/hash values use readable code styling; voice opt-in is explicit and unchecked by default.
- **Responsive behavior:** one column; actions wrap; long hashes and current file names break safely.
- **Implementation notes:** reuse `PublishedCompanionSection` and `ActionProgress`; map client progress and server pack states rather than showing only free-form status strings.
- **Prohibited uses:** suggesting memories/personality are published, auto-including voice, exposing object keys/URLs, or treating “enabled” as “published.”
- **Classification:** privacy and progress foundation **Existing and correct**; lifecycle detail and unpublish confirmation **Required**.

## 14. Visit session card and visitor presence

- **Semantic purpose:** show consent, preparation, readiness, active presence, termination, and outcome for one Visit.
- **Permitted variants:** invitation pending/terminal; session preparing/ready/active/ending/ended/cancelled/failed; reconnecting; renderer unavailable.
- **Asset usage:** authorized Companion portrait/sprite from immutable Pack; CSS status and timeline markers.
- **Decoration level:** low operational card; character itself lives in Presence Layer.
- **Layout behavior:** participants and role, state, next action, expiry/elapsed time, and consequences are explicit. Only one live session is shown as current because the server enforces one non-terminal session per participant.
- **Interaction states:** accept/decline/cancel, prepare/download, ready wait, host start, active end, reconnect/refetch, ended reason, failure/retry guidance.
- **Accessibility:** invitation actions are plain buttons; status changes are announced politely; End/Cancel wording reflects state; visitor canvas is decorative with a concise wrapper label.
- **Responsive behavior:** card stacks; progress/state timeline condenses to labeled steps rather than icon-only dots.
- **Implementation notes:** drive the card from authoritative REST summaries; socket events only invalidate. Keep `VisualVisitRendererState` synchronized with the card and never derive consent from animation state.
- **Prohibited uses:** visitor appearance before `active`, “walk in” as acceptance UI, remote interaction affordances, or concealing terminal reason behind a generic success style.
- **Classification:** lifecycle plumbing **Existing and correct**; comprehensive visual state mapping **Required**.

## 15. Creation step, Companion card, and Asset slot

- **Semantic purpose:** create, choose, edit, validate, and delete local Companions and their animation assets.
- **Permitted variants:** selection card, create card, four creation steps, edit page, AI config, startup recovery, empty/filled/staged/error Asset slot.
- **Asset usage:** actual sprite preview, CSS placeholder, no notebook decorations required.
- **Decoration level:** minimal.
- **Layout behavior:** one clear task per step; form body scrolls at short heights; Asset slots form a stable validation grid; close remains window-level.
- **Interaction states:** loading, analysis busy/error, forward/back step transition, staged, missing required animations, saving, recovery, delete confirmation.
- **Accessibility:** create-new is a real button; labels are visible; step focus moves to the first meaningful field; dialog rules apply to delete; upload input has an accessible name.
- **Responsive behavior:** supported 480 px minimum width/560 px minimum height; grid collapses; action buttons wrap; no clipped form body.
- **Implementation notes:** preserve existing step and reduced-motion tests. Treat Creation as Operational Paper, not a miniature notebook.
- **Prohibited uses:** scrapbook wizard steps, character art generated as filler, or hiding required-animation validation until final submit.
- **Classification:** **Existing and correct**.

## 16. Developer and diagnostic component

- **Semantic purpose:** inspect runtime state and perform explicitly developer-only controls.
- **Permitted variants:** timeline, snapshot card, raw data block, filter, simulation control, status metric, destructive reset.
- **Asset usage:** CSS and text only; monospace for code/data.
- **Decoration level:** none.
- **Layout behavior:** dense but aligned; collapsible sections; raw data scrolls; developer identity is always visible.
- **Interaction states:** loading, empty, expanded, filtered, paused, unavailable metric, reset confirmation.
- **Accessibility:** controls have labels and selected state; expandable headers expose `aria-expanded`; color badges include text; reset uses destructive confirmation.
- **Responsive behavior:** one-column fallback and contained horizontal scrolling for code only.
- **Implementation notes:** retain developer styles; do not force these panels into the Narrative Notebook component family.
- **Prohibited uses:** handwritten code/logs, doodles, automatic polling motion that distracts normal users, or exposing developer panels by default.
- **Classification:** **Required** direction for existing developer surfaces.

## Shared state contract

Every data-bearing component must support, as applicable: initial loading, refreshing with prior content, empty, partial error, blocking error, offline, reconnecting, disabled/unavailable feature, action busy, success acknowledgement, and stale result replaced after authoritative refetch. Current shared feedback primitives cover the visuals; consistent per-domain adoption is **Existing but incomplete**.
