# UI Layer System

## Purpose

The three layers describe visual and interaction behavior, not React ownership or z-index. A window can contain more than one layer, but each current surface has one primary layer. The dark application shell is shared framing rather than a fourth content layer.

## 1. Presence Layer

The Presence Layer is the lightweight, transparent, immediate relationship between the companion and the user's real desktop.

### Rules

- **Existing and correct · Fact:** it is transparent, pointer-selective, movable, and uses the real Companion runtime rather than a notebook illustration.
- **Required · Recommendation:** it remains visually sparse: character, speech, local state, visitor, and a small number of contextual actions.
- **Required · Recommendation:** overlays never suggest access beyond the application's actual permissions and never cover large portions of the desktop without an explicit user action.
- **Recommended · Recommendation:** paper appears only as a small speech/discovery surface; the desktop remains the background.
- **Rejected · Recommendation:** a persistent dashboard, sidebar, notebook page, or decorative scene behind the Companion.

### Primary surfaces

- Companion sprite/canvas, state caption, drag target, and optional drag handle.
- Speech Bubble and typewriter text.
- Listening indicator and Talk composer.
- Quick Actions: Talk, Listen, Open Panel, More, including More menu.
- Discovery soft hint and Discovery Popout Card.
- Local Companion leave/hidden/enter phases while away visiting.
- Remote Visitor enter, idle, walk, leave, and renderer-failure removal.
- Optional developer observatory overlay attached to the Companion window.
- Companion onboarding-required message shown in the transparent entry window.

## 2. Narrative Notebook Layer

The Narrative Notebook Layer is the companion's authored record of thoughts, discoveries, journeys, memories, and shared conversation.

### Rules

- **Existing and correct · Fact:** it uses `NotebookPage`, `PaperCard`, `StickyNote`, `NotebookChatBubble`, paper texture, tape labels, ruled lines, and narrative card layouts.
- **Required · Recommendation:** decoration conveys narrative meaning and remains removable without losing task structure.
- **Required · Recommendation:** content order follows document order; apparent scrapbook placement must never create an ambiguous keyboard or reading order.
- **Recommended · Recommendation:** allow stronger use of photographs, tape, doodles, and short handwritten labels here than in other layers.
- **Rejected · Recommendation:** arbitrary masonry that destabilizes scanning, literal page turns for navigation, or decorative rotation of long content.

### Primary surfaces

- Panel Home: Companion Status, Companion Message, returned insight, Current Focus, At a Glance, exploration loop, Mood, and memory highlight.
- Discoveries: filters, returned insight archive, evidence cards, saved discovery cards, tags, and add/ignore/open actions.
- Journeys: active count, new Journey action, Journey cards, progress, milestone/next-step notes.
- Memories: create/edit draft, graph-derived memory cards, tags, and saved memory list.
- Chat: history filters, search, companion/user/system bubbles, source/error badges, composer, retention note, and clear-history entry point.
- Narrative portions of the Home Companion canvas and the friend Companion profile preview. The operational actions around them remain Operational Paper.

## 3. Operational Paper Layer

The Operational Paper Layer handles accounts, configuration, safety, consent, transfer progress, creation, maintenance, and diagnostics. It keeps the warm paper identity while using conventional UI structure.

### Rules

- **Existing and correct · Fact:** forms use stable controls, feedback primitives, alert-dialog semantics, and straight paper cards.
- **Required · Recommendation:** labels, validation, disabled states, status, and consequences are visible without decoration.
- **Required · Recommendation:** destructive and privacy-sensitive actions use semantic colors and plain wording; no handwriting-only or image-only cues.
- **Recommended · Recommendation:** one page-level paper surface or taped section heading is enough. Dense nested paper frames should be reduced.
- **Rejected · Recommendation:** rotated forms, postage-stamp buttons, envelopes that must be “opened” to see requests, or decorative friction before safety actions.

### Primary surfaces

- Panel Social in all states: unavailable, overview, friend-code lookup, friends, requests, presence, Companion publishing, Asset Pack transfer, Visit invitations/sessions, blocked users, and friend overflow.
- Panel Settings categories: Companion, AI, Voice, Privacy, Appearance, Online, Advanced, Developer.
- Online Mode: disabled/enabled, server URL, register, login, account, logout, connection and compatibility state.
- Creation window: Companion selection, new Companion flow, personality analysis, animation upload, edit, AI configuration, startup/recovery, and deletion.
- Asset tooling: sprite grid, individual slots, preview, bulk upload, staged changes, validation errors.
- Developer tools: animation preview/debug, Engine Observatory, workspace status, CVK, AI/audio logs, permissions, behavior controls, data reset.
- Onboarding/checking/no-Companion Panel states.
- Feedback components: InlineNotice, LoadingState, EmptyState, SectionError, ActionProgress, Toast, ConfirmDialog.
- Global navigation, page transition/focus handoff, window close/Exit, and modal backdrop.

## Current surface assignment matrix

This inventory assigns every current renderer family found under `renderer/src`.

| Current surface/family | Primary layer | Decoration | Classification and rationale |
|---|---|---:|---|
| `CompanionEntryShell` runtime canvas | Presence | Minimal | Existing and correct: direct desktop presence |
| Speech/typewriter/listening/Talk composer | Presence | Low | Existing and correct: paper bubble can frame speech, controls remain direct |
| Quick Actions and More menu | Presence | Minimal | Existing and correct: dark translucent speech actions; keyboard and Escape behavior preserved |
| Discovery soft hint and popout | Presence | Low | Existing but incomplete: compact narrative preview with operational buttons |
| `RemoteVisitorLayer` | Presence | None | Existing and correct: visual-only, pointer-transparent remote presence |
| Companion developer overlay | Presence | None | Required: diagnostic chrome, never notebook decoration |
| Panel dark shell/sidebar/top navigation | Operational Paper framing | None | Existing and correct: stable application boundary |
| Panel onboarding/loading/partial-load notice | Operational Paper | None | Existing but incomplete: shared loading and partial-error primitives should be used consistently |
| Home | Narrative Notebook | Medium | Existing and correct |
| Discoveries | Narrative Notebook | Medium-high | Existing and correct; actual image/evidence policy is incomplete |
| Journeys | Narrative Notebook | Medium | Existing and correct |
| Memories | Narrative Notebook | Medium | Existing and correct |
| Chat history | Narrative Notebook | Low-medium | Existing and correct |
| Chat composer and clear confirmation | Operational Paper within Narrative | Minimal | Required: functional and destructive controls stay stable |
| Social unavailable/account/friends/requests/blocks | Operational Paper | Low | Existing but incomplete: page is structurally correct but state hierarchy is dense |
| Published Companion/Asset Pack | Operational Paper | Low | Existing but incomplete: progress exists; lifecycle and retry detail need clearer mapping |
| Visit invitation/session controls | Operational Paper | Low | Existing but incomplete: live state exists; terminal/failure/reconnect detail is weak |
| Friend Companion preview | Narrative Notebook within Operational | Low-medium | Recommended: narrative profile inside a conventional authorization boundary |
| Settings categories and forms | Operational Paper | Minimal | Existing and correct structurally; typography is too decorative for dense content |
| Creation selection | Operational Paper | Minimal | Existing and correct: real button for create card and confirmation for delete |
| Creation wizard/personality analysis | Operational Paper | Minimal | Existing and correct: step lifecycle and focus are tested |
| Creation/edit Asset grid | Operational Paper | Minimal | Existing and correct: validation and staging outrank decoration |
| Developer/diagnostic panels | Operational Paper | None | Required: dense, conventional, monospaced where useful |
| Dialogs, notices, errors, loading, progress, toasts | Operational Paper | None | Existing and correct foundation |

## Cross-layer composition rules

1. **Presence → Notebook:** Open Panel moves from a lightweight desktop action to the stable shell. Do not visually expand the Overlay into a notebook.
2. **Notebook → Operational:** a narrative card may initiate Save, Edit, Clear, Publish, Invite, or Delete, but confirmation and progress move into straight operational surfaces.
3. **Operational → Presence:** accepting and starting a Visit authorizes the Presence Layer to show an arrival. The character never appears before authoritative active state and verified assets.
4. **Presence ↔ Social:** Social reports the same owner-away/visitor-active state as the Overlay. One source of truth is the renderer-safe `VisualVisitRendererState`.
5. **Errors:** errors are always Operational, even when they occur inside narrative or presence surfaces.

## Shell responsibilities

- **Existing and correct · Fact:** one renderer entry selects exactly Companion, Panel, or Creation shell.
- **Required · Recommendation:** keep window mode ownership intact; the layer system must not prompt a shell rewrite.
- **Required · Recommendation:** page title, current navigation, connection scope, and focus handoff remain stable even when child data domains partially fail.
- **Recommended · Recommendation:** a compact connection indicator may live in shell framing, but detailed account and server remediation remain under Settings > Online or Social unavailable state.

## Responsive implications

- The supported Panel contract is 760 px minimum width and 580 px minimum height.
- At 900 px, collapse navigation to a labeled-for-assistive-tech rail; at 760 px, use horizontal scrolling navigation rather than removing destinations.
- Narrative two-column layouts become one column at or before 900 px; center-seam and wide-card assumptions disappear.
- Operational forms use one column at narrow widths, full-width fields, and wrapping action rows.
- Presence layout follows the available work area, not Panel breakpoints; Quick Actions already use edge-aware placement.

## Accessibility and localization implications

- Layer changes never change semantic roles. Buttons remain buttons; tabs use tab semantics; modal confirmations remain `alertdialog`.
- Decorations are hidden from assistive technology. Character identity/state receives concise text where it conveys information.
- English and Simplified Chinese share identical information architecture. Layer choice may not depend on line length or English-only word shapes.
- Focus moves to the incoming Panel page after transition and returns to the opener after dialogs/menus close.
- Reduced motion keeps state changes and opacity while removing spatial transforms and looping nonessential animation.
