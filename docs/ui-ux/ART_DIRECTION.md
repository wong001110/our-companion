# Our Companion Art Direction

## Status and evidence

This specification is implementation-aware and is based on the desktop client at commit `7f110650b499c9bedd91f6406b2686433cf21a2a`, the Network repository at commit `d436a96b93b9c5fb3b74106487d496ad09e4bc48`, the two boards in `docs/ui-ux/references`, current renderer assets and CSS, and the checked-in UI and two-device QA captures. The boards are visual direction, not pixel layouts.

Recommendation labels used throughout all six specifications:

- **Existing and correct** — implemented and appropriate; preserve it.
- **Existing but incomplete** — implemented foundation exists, but a named state or rule is missing.
- **Required** — necessary for correctness, accessibility, privacy, or a coherent next implementation.
- **Recommended** — preferred visual or interaction direction, but not a correctness blocker.
- **Optional** — safe enrichment after the required work.
- **Rejected** — explicitly outside the direction.

Evidence labels:

- **Fact** — directly verified in code, tests, assets, contracts, or QA captures.
- **Intent** — inferred from the confirmed direction and reference notes.
- **Recommendation** — new guidance introduced here.

## Core visual concept

**Warm mind, modern boundary.** The desktop shell is the reliable boundary between the operating system and the companion's private world. The notebook is the companion's authored interior: thoughts, discoveries, journeys, memories, and shared conversation. The transparent Companion Overlay is the living presence that connects those two contexts. Network features borrow from correspondence—address book, invitation, letter, arrival—but retain conventional controls and explicit consent.

- **Existing and correct · Fact:** the dark Panel shell and sidebar frame a warm paper workspace; the Overlay remains transparent; purple bridges both.
- **Existing and correct · Intent:** narrative pages may feel handcrafted without making the application itself feel imprecise.
- **Required · Recommendation:** every decorative decision must communicate authorship, time, memory, travel, or relationship. Decoration that is only visual noise is removed.
- **Rejected · Recommendation:** a full scrapbook collage across every page, an OS-dashboard aesthetic inside the notebook, or a game HUD for Network and safety controls.

## Emotional qualities

The product should feel:

1. **Present, not demanding.** The companion is available without constantly animating or interrupting.
2. **Personal, not childish.** Handmade edges and small doodles imply care; they do not turn controls into toys.
3. **Private, not secretive.** Network boundaries and local-only information are stated plainly.
4. **Calm, not inert.** Motion acknowledges state change but yields immediately to user input.
5. **Curious, not chaotic.** Discovery and Journey surfaces can be visually richer than Settings or blocking.
6. **Trustworthy, not clinical.** Operational paper retains warmth while using stable alignment, conventional forms, and direct language.

## Visual hierarchy

Use hierarchy in this order:

1. Current task, consent decision, or companion state.
2. Page title and short orientation sentence.
3. Primary content or form.
4. Primary action, then reversible secondary actions.
5. Metadata, tags, timestamps, and decoration.

- **Existing and correct · Fact:** `NotebookPage`, `PaperCard`, `StickyNote`, section labels, chips, and dark shell navigation already establish these levels.
- **Existing but incomplete · Fact:** all renderer text currently inherits Xiaolai, including dense Settings, Social, form controls, and debug surfaces. This makes hierarchy depend too heavily on size and reduces dense-reading clarity.
- **Required · Recommendation:** destructive actions, errors, privacy disclosures, and upload/Visit state must outrank tape, doodles, photos, and handwritten labels.
- **Recommended · Recommendation:** use one expressive focal item per content cluster—such as a photo frame, a taped label, or a doodle—not all three by default.

## Shell and notebook relationship

### Dark application shell

- **Existing and correct · Fact:** the shell uses a dark plum/near-black background, a left navigation at normal widths, an icon/initial rail at 900 px, and horizontal top navigation at 760 px.
- **Required · Recommendation:** the shell owns window-level navigation, Exit, global connection indication, and modal backdrops. It remains visually stable across pages.
- **Recommended · Recommendation:** navigation labels use a conventional UI face even when notebook headings use an expressive face.
- **Rejected · Recommendation:** paper textures behind the sidebar, taped navigation buttons, rotated navigation labels, or decoration that competes with `aria-current`.

### Notebook interior

- **Existing and correct · Fact:** `notebook-page` combines paper texture, ruling, margin lines, and a subtle center seam; pages scroll inside the application shell.
- **Required · Recommendation:** notebook styling is structural on Home, Discoveries, Journeys, Memories, and Chat, but decorative elements remain optional children rather than layout dependencies.
- **Recommended · Recommendation:** retain a single responsive sheet rather than forcing a literal two-page spread. The center seam may fade or disappear when the content becomes one column.
- **Rejected · Recommendation:** normal navigation as a full page turn, fixed-position rings that consume responsive space, or content split across a physical gutter.

### Operational paper

- **Existing and correct · Fact:** Settings and Social already use paper cards and conventional form controls.
- **Required · Recommendation:** Creation, Settings, Social, account, publishing, Asset Pack, Visit consent, blocking, and developer tools use straight, non-rotated containers and predictable grid alignment.
- **Rejected · Recommendation:** rotated forms, handwritten password/API fields, decorative confirm dialogs, or ambiguous icon-only destructive actions.

## Color system

### Verified base tokens

| Role | Current value | Direction | Classification |
|---|---:|---|---|
| Application background | `#111019` | Stable near-black violet boundary | Existing and correct |
| Sidebar | `#21182d` | Dark plum navigation | Existing and correct |
| Paper | `#fff7e6` token; rendered notebook near `#f4e6c9` | Warm, low-glare interior | Existing and correct |
| Elevated dark | `#342746` | Overlay menus, dialogs, toasts | Existing and correct |
| Paper text | `#2a1c2c` | Ink-like primary text | Existing and correct |
| Secondary text | `#5e5060` | Supporting copy | Existing and correct |
| Purple | `#7952a7` | Bridge color and selection | Existing and correct |
| Success | `#2e9b68` | Completion and online readiness | Existing and correct |
| Warning | `#a96c20` | Expiry, partial state, caution | Existing and correct |
| Danger | `#b44254` | Destructive and failure only | Existing and correct |

### Rules

- **Required · Recommendation:** use semantic tokens, not decorative color, for success, warning, danger, offline, and reconnecting states. Never rely on color alone.
- **Required · Recommendation:** connection states distinguish online, idle, offline, reconnecting, incompatible, and failed with text plus shape/icon; green is reserved for genuinely ready/online states.
- **Recommended · Recommendation:** purple tape and accents are primary; dusty pink, cream, and muted sage are supporting narrative accents. Limit a card to one accent family.
- **Recommended · Recommendation:** add semantic surface tokens for `paper-subtle`, `paper-warning`, `paper-danger`, `dark-backdrop`, `presence-online`, `presence-idle`, and `presence-offline` before more hard-coded colors are added.
- **Rejected · Recommendation:** neon cyberpunk colors, pure white paper over large areas, rainbow status badges, or danger red used as decoration.

Exact final palette values beyond the verified tokens cannot be finalized without contrast measurements against every intended surface and production asset color calibration.

## Typography roles

| Role | Direction | Classification |
|---|---|---|
| Shell navigation, body, forms, metadata, tables, dialogs, debug | System UI or a verified bilingual UI family | Required |
| Notebook H1/H2 and short authored labels | Xiaolai where glyph coverage and rendering are verified | Existing but incomplete |
| Tape labels, short companion notes, empty-state title | Xiaolai or SetoFont, maximum one to two short lines | Recommended |
| User-authored and server-authored content | UI/body face; preserve original language and wrapping | Required |
| Passwords, friend codes, hashes, URLs, file names, timings | Monospace or UI face with tabular/clear characters | Required |

- **Fact:** Xiaolai and SetoFont TTF files exist; only Xiaolai is currently declared as the global renderer family. SetoFont is available but its production usage and full bilingual glyph coverage were not verified.
- **Required · Recommendation:** handwritten fonts are not used for long body text, form controls, codes, technical diagnostics, privacy disclosures, or destructive confirmations.
- **Required · Recommendation:** English and Simplified Chinese layouts allow natural wrapping, avoid fixed text heights, and do not encode meaning in capitalization.
- **Recommended · Recommendation:** cap authored headings at roughly 32–36 px on wide Panel pages and scale down responsively; body text remains at a legible UI size with 1.45–1.6 line height.

## Paper and decoration language

### Meaningful uses

- Tape = a companion-authored label, pinned item, temporary note, or selected narrative highlight.
- Photo frame = evidence, a discovery preview, a Journey place, or a memory image.
- Sticky note = a short next step, aside, reminder, or companion suggestion.
- Doodle = emotional or categorical reinforcement: map for Journey, book for memory/reading, sparkle/star for discovery, heart for relationship.
- Ruled paper = chronology, conversation, or written reflection.

### Density by surface

| Surface | Decoration ceiling | Classification |
|---|---|---|
| Home | Medium: up to one focal decoration per card cluster | Recommended |
| Discoveries | Medium-high on evidence cards; stable grid remains primary | Recommended |
| Journeys | Medium; maps, route marks, and next-step notes are meaningful | Recommended |
| Memories | Medium; chronology and photo evidence are meaningful | Recommended |
| Chat | Low-medium; paper and bubble framing, minimal extra doodles | Recommended |
| Social | Low; correspondence cues at section level only | Required |
| Settings/Creation/Developer | Minimal; one page-level paper identity, no per-control decoration | Required |
| Confirm/error/destructive states | None beyond semantic surface styling | Required |

- **Existing and correct · Fact:** paper, sticky-note, tape, doodle, photo, chat-bubble, and speech-bubble assets already cover the core vocabulary.
- **Existing but incomplete · Fact:** several existing doodle assets are not yet used; some current cards add cream tape automatically even when the content is purely operational.
- **Required · Recommendation:** decoration is `aria-hidden`, does not receive focus, does not alter reading order, and may be removed at narrow widths without information loss.
- **Rejected · Recommendation:** randomized rotation on dense cards, simulated stains or torn edges behind legal/privacy text, decorative paper clips over controls, or photographs used as non-semantic filler.

## Character presentation rules

- **Existing and correct · Fact:** the real active Companion sprite appears in the Overlay and Home; remote visitors render from verified immutable Asset Packs; CSS placeholders are used when an asset is unavailable.
- **Required · Recommendation:** show the user's actual Companion assets whenever the renderer has a verified local source. Do not substitute a generic mascot in operational or consent flows.
- **Required · Recommendation:** remote visitors are visually subordinate to the local desktop context, are pointer-transparent, carry a programmatic visiting label, and never imply remote control.
- **Required · Recommendation:** an away owner leaves clear UI state in the Overlay/Panel; Quick Actions are unavailable while the local Companion is away visiting.
- **Recommended · Recommendation:** use portraits or thumbnails in narrative/Network cards only when supplied by the Companion Asset Pack. Otherwise use a stable initial or semantic placeholder, not newly generated character art.
- **Recommended · Recommendation:** character scale stays consistent within a surface family; do not enlarge sprites solely to fill empty space.
- **Rejected · Recommendation:** humanizing server failures through a distressed character, making a visitor appear before host consent and asset verification, or animating characters behind dialogs that require attention.

## Prohibited visual directions

- Full-page page-turn animation for routine navigation.
- Scrapbook collage treatment on every Panel page.
- Skeuomorphic controls whose function is unclear.
- Rotated functional forms, tables, dense cards, codes, or warnings.
- Handwritten body copy for long text, forms, privacy, errors, or technical data.
- Decorative confirmation dialogs for blocking, removal, deletion, logout, server change, or Visit termination.
- Neon gamer HUD, glassmorphism as the primary paper language, photoreal leather notebook chrome, or kawaii ornament that weakens trust.
- Decoration that masks loading, disabled, offline, reconnecting, or failure state.
- Any visual that implies Network access to local memories, prompts, personality values, files, permissions, or desktop control.

## Reference-to-implementation conflict register

| Reference direction | Verified implementation constraint | Decision | Classification |
|---|---|---|---|
| Literal open two-page notebook with visible rings | Current `NotebookPage` is one responsive scrolling surface; layouts collapse at 900 px and the Panel minimum is 760 px | Preserve the responsive sheet; seam/binding stays cosmetic | Existing and correct |
| Sidebar with pictographic icons and companion portrait | Current navigation uses text and compact initial labels; no coherent functional icon set is present | Keep text semantics; a typed SVG set is a later enhancement | Recommended |
| Dense collage of photos, tape, pins, doodles, and rotated cards | Current real data often has no image and operational pages contain forms, codes, privacy, and destructive actions | Use decoration only where it adds narrative meaning; keep functional surfaces straight | Required |
| Named “Ann” notebook/character throughout | Product supports user-created Companions and actual active assets | Use the current Companion's name and real assets; never bake Ann into shared UI | Required |
| Large character illustration embedded outside the Panel | Current architecture separates a transparent Companion window from Panel and Creation windows | Preserve Overlay as the real desktop presence; do not add a decorative mascot around the Panel | Existing and correct |
| Reference navigation omits Social and separates “Ask Ann” | Current tested IA has Home, Chat, Discoveries, Journeys, Memories, Social, Settings | Preserve current seven destinations; Chat is the single Panel conversation destination | Existing and correct |
| Settings not shown or treated like notebook content | Current Settings has eight categories, forms, credentials, permissions, and developer diagnostics | Use restrained Operational Paper and conventional typography | Required |
| Social metaphor is visually unspecified | Current Network has accounts, exact Friend Codes, blocking, immutable Asset Packs, Visit consent, and failure states | Use address-book/invitation cues only at section level; safety remains conventional | Required |
| Concept boards use idealized image-rich discoveries/memories | Current UI uses source initials/placeholders and no universal image field | Keep stable no-image state; use real authorized evidence only when available | Required |
| Broad global handwritten typography | Current screenshots show Xiaolai across dense settings, codes, and controls | Restrict expressive type to headings/short authored labels; use UI/mono roles elsewhere | Required |
| Full notebook chrome implies page-turn motion | Current tested lifecycle is 140 ms exit/180 ms enter with reduced-motion opacity-only | Preserve short interruptible transition; reject page turns | Existing and correct |

The reference boards do not define active, loading, empty, offline, reconnecting, partial error, validation, destructive confirmation, Asset Pack lifecycle, or Visit failure states. The existing feedback foundation and Network contracts are the authority for those states.

## Unverified items

- Final font licensing, complete Simplified Chinese glyph coverage, and production hinting for both bundled fonts.
- Exact contrast ratios after any future palette changes.
- Final decoration density preference from user testing.
- Behavior at widths below the supported 760 px Panel minimum; the renderer can technically reach smaller CSS widths, but that is not a supported Electron window contract.
