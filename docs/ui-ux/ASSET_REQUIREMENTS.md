# Asset Requirements

## Principles

- **Existing and correct:** reuse the checked-in paper, tape, doodle, frame, and font assets before commissioning anything new.
- **Required:** functional state, focus, validation, presence, progress, warnings, and destructive meaning are CSS/text/SVG concerns, not raster-asset requests.
- **Required:** runtime Companion/visitor imagery comes from the local Companion package or verified immutable Network Asset Pack; it is not part of the Panel decoration library.
- **Recommended:** add a build-time inventory/usage check before producing more decoration.
- **Rejected:** a separate image for each button, status, empty state, Network event, or responsive breakpoint.

Reference boards under `docs/ui-ux/references` are not runtime assets and must not be sliced into production UI.

## Existing runtime inventory

| Asset name/path | Purpose | Current availability | Format | Scalable strategy | States | Dimensions/aspect behavior | Medium | Priority / classification |
|---|---|---|---|---|---|---|---|---|
| `notebook/paper-texture.webp` | Warm repeating notebook grain | Present and used | WebP | Tile at native scale; CSS supplies ruling/margins/seam | One neutral state | 512×512 tile; do not stretch to a single page | Image | P0 · Existing and correct |
| `frames/paper-card-frame.png` | Irregular paper card edge/fill | Present and used | RGBA PNG, nine-slice via `border-image` | Retain border-image; semantic variants use CSS overlay/border | Default only | 512×512 source; slice 176; flexible content box | Image | P0 · Existing and correct |
| `frames/sticky-note-frame.png` | Short aside/next-step note | Present and used | RGBA PNG, `border-image` | Retain nine-slice; avoid fixed dimensions | Default/compact through CSS | 512×512 source; flexible, short content | Image | P1 · Existing and correct |
| `frames/photo-frame.png` | Evidence/photo framing | Present; partly decorative use | RGBA PNG | Use as overlay/border; actual content remains separate `<img>` | Image/no-image/error handled outside frame | 256×220, approximately 1.16:1; preview defaults to 4:3 | Image | P1 · Existing but incomplete |
| `frames/speech-bubble.png` | Transient Overlay speech surface | Present and used | RGBA PNG, `border-image` | Retain stretchable border-image | Entered/exiting via CSS | 1024×1024 source; content-driven max width | Image | P0 · Existing and correct |
| `frames/chat-bubble-ann.png` | Companion history bubble | Present and used | RGBA PNG, `border-image` | Retain nine-slice | Normal; error semantics via CSS/text | 512×512; width follows readable text | Image | P0 · Existing and correct |
| `frames/chat-bubble-user.png` | User history bubble | Present and used | RGBA PNG, `border-image` | Retain nine-slice | Normal; sending/error outside frame | 512×512; width follows readable text | Image | P0 · Existing and correct |
| `frames/chat-bubble-tail-ann.png` | Companion bubble tail | Present and used | RGBA PNG | Hide at constrained sizes if clipping; no separate states | Default | 128×96 source; rendered about 34×26 | Image | P1 · Existing and correct |
| `frames/chat-bubble-tail-user.png` | User bubble tail | Present and used | RGBA PNG | Same as companion tail | Default | 128×96 source; rendered about 34×26 | Image | P1 · Existing and correct |
| `decorations/section-label-tape.png` | Short authored/taped section label | Present and used | RGBA PNG | Stretch only within short-label limits | Default | 192×64; flexible short horizontal label | Image | P1 · Existing and correct |
| `decorations/tape-cream.png` | Neutral pinned-item accent | Present and automatically applied to paper cards | RGBA PNG | Background-size contain; make operational usage opt-in | Default | 192×64; render near 3:1 | Image | P1 · Existing but incomplete |
| `decorations/tape-pink.png` | Warm narrative accent | Present; usage not verified | RGBA PNG | Reuse for authored highlights only | Default | 192×64, 3:1 | Image | P2 · Recommended reuse |
| `decorations/tape-purple.png` | Primary bridge/accent tape | Present; usage not verified | RGBA PNG | Reuse for selected narrative highlights | Default | 192×64, 3:1 | Image | P2 · Recommended reuse |
| `doodles/book.png` | Reading/memory category | Present; current runtime usage not verified | RGBA PNG | Render at multiple CSS sizes; SVG replacement not required | Decorative only | 96×96 square | Image | P2 · Recommended reuse |
| `doodles/heart.png` | Relationship/warmth | Present; current runtime usage not verified | RGBA PNG | Decorative only | Decorative only | 96×96 square | Image | P2 · Optional |
| `doodles/map.png` | Journey/travel category | Present; current runtime uses a text `map` placeholder | RGBA PNG | Use existing asset; keep adjacent text | Decorative only | 96×96 square | Image | P1 · Recommended reuse |
| `doodles/sparkle.png` | Discovery/emphasis | Present; usage not verified | RGBA PNG | Decorative only | Decorative only | 96×96 square | Image | P2 · Optional |
| `doodles/star.png` | Favorite/highlight | Present; usage not verified | RGBA PNG | Decorative only; functional favorite needs SVG/button state | Decorative only | 96×96 square | Image | P2 · Optional |
| `fonts/xiaolaifont/Xiaolai-Regular.ttf` | Expressive handwritten bilingual face | Present and globally used | TTF | Font-face; subset only after licensing/coverage check | Regular only | Font, not dimensioned | Font | P0 · Existing but incomplete |
| `fonts/setofont/SetoFont-1.ttf` | Alternate handwritten label face | Present; runtime usage not verified | TTF | Font-face already supplied; use only after coverage/license QA | Regular only | Font, not dimensioned | Font | P3 · Optional/unverified |
| Local Companion sprite assets | Local character rendering and Home preview | User/package supplied | PNG sprite sheets and supported runtime formats | Manifest-driven; never merge into UI chrome | Required animations plus package variants | Runtime frame contract; current Visit renderer expects 300×300 frames | Sprite | P0 · Existing and correct |
| Network visual Visit Pack | Verified remote visitor | Downloaded/cached through main process when authorized | Manifest V1, PNG animations | Immutable hash-addressed pack; renderer-safe protocol URLs | Idle, Enter, Leave, Walk L/R/U/D; optional diagonals | Frame metadata from manifest; current visitor canvas 300×300 | Sprite | P0 · Existing and correct |

## Required non-image assets and component resources

These are asset requirements in the design-system sense, but should be implemented with CSS, SVG, or code rather than commissioned raster files.

| Asset name | Purpose | Current availability | Required format | Scalable strategy | Required states | Expected dimensions/aspect behavior | Medium | Priority / classification |
|---|---|---|---|---|---|---|---|---|
| Functional icon set | Navigation, search, copy, overflow, close, retry, warning, success, presence, invitation | No coherent set verified; current UI uses text/characters | SVG sprite or typed React SVG components | `currentColor`, shared 16/20/24 px viewBox, no per-color files | Default, hover/focus through parent, selected, disabled; semantic icon variants | 16–24 px, square; 1.5–2 px stroke | SVG | P1 · Recommended |
| Semantic status markers | Online/idle/offline, reconnecting, success/warning/danger | Partially CSS (`online-mode-dot`) | CSS shape plus optional SVG glyph | Token-driven and text paired | All Network/feedback states | 8–12 px marker beside text; never standalone | CSS/SVG | P0 · Required |
| Connection banner surfaces | Offline/reconnecting/incompatible/server error | Shared notices exist | CSS component using `InlineNotice`/`SectionError` | Token variants | Info, reconnecting, warning, error, success | Content-driven, full available width | CSS | P0 · Required |
| Visit step/timeline markers | Prepare → Ready → Visit → End | Not present as reusable component | CSS and semantic ordered list; optional SVG check | Text labels remain primary | Current, complete, error, cancelled | Horizontal wide; vertical/compact narrow | CSS/SVG | P1 · Recommended |
| Correspondence section cue | Give Social/Visits a restrained letter/address-book identity | Not present | CSS border/ruled header using current tape; no new raster | One reusable section header | Neutral only | Flexible width, no fixed envelope aspect | CSS + existing image | P2 · Recommended |
| Avatar/portrait placeholder | Stable no-image identity | CSS placeholders exist in multiple places | CSS initial/shape | Derived from name; deterministic color token | Default, loading, unavailable | 40–64 px square/circle; larger profile option up to 120 px | CSS | P1 · Required |
| Progress/indeterminate treatment | Asset preparation/verification and Visit preparation | Determinate progress exists; spinner exists | CSS | Motion-token driven; static label under reduced motion | Determinate, indeterminate, paused/reconnecting, failed, complete | Full card width; 8 px track | CSS | P0 · Required |
| Focus ring | Keyboard focus across dark and paper surfaces | Present globally | CSS | Tokenize light/dark variants only if contrast testing requires | Focus-visible | 3 px plus 3 px offset currently | CSS | P0 · Existing and correct |
| Paper semantic variants | Neutral, subtle, warning, danger, success | Not tokenized | CSS custom properties and overlays | Reuse same frame; alter border/surface carefully | All feedback variants | Flexible | CSS | P1 · Required |
| Skeleton placeholder | Preserve Social/card layout during initial load if desired | Not present; labeled LoadingState exists | CSS | Use sparingly; static under reduced motion | Loading only | Match row/card blocks | CSS | P3 · Optional |
| Monospace technical role | Friend Codes, hashes, URLs, filenames, logs | System fallback only; no explicit token | CSS font stack, no bundled font required | Platform monospace | Normal/selectable/error | Natural text flow | CSS/font stack | P1 · Required |

## Asset gaps that may justify future production

Only the following gaps plausibly benefit from authored visual assets after the CSS/SVG work is complete.

| Asset name | Purpose | Current availability | Required format | Scalable strategy | Required states | Expected dimensions/aspect behavior | Medium | Priority / classification |
|---|---|---|---|---|---|---|---|---|
| Notebook binding/seam overlay | Slightly strengthen wide-page notebook identity without structural gutter | Simulated in CSS at 1% opacity; reference boards show rings | No asset required initially; evaluate CSS first | CSS repeating gradients; image only if artifact-free result is impossible | Wide narrative page only | Narrow vertical strip, scalable height | CSS first | P3 · Optional |
| Small correspondence stamp/mark family | Section-level Social/Visit identity | No verified assets | Prefer 2–3 simple SVG marks, not raster | `currentColor`, reusable | Decorative only | 24–48 px square | SVG | P3 · Optional |
| Narrative empty-state doodle composition | One calm empty state for Discoveries/Journeys/Memories | Individual doodles exist | Compose existing PNGs/CSS before creating new art | Responsive arrangement | Empty only | Max 160×120 visual area | Existing images/CSS | P3 · Optional |

No new character art, photographs, stickers, tape, paper frames, chat bubbles, or speech bubbles are required for the next implementation phase.

## Runtime Asset Pack requirements

### Base publish

- `Idle_Neutral`, `Enter`, and `Leave` mappings are mandatory.
- Sprite-sheet files are PNG; manifest validation rejects SVG, links, traversal, hidden files, case collisions, and unsupported types.
- Manifest paths stay under managed `assets/`; timestamps, local/server IDs, object keys, and URLs are excluded from canonical identity.
- Portrait and icon are optional manifest paths. The UI should use them when present and verified; otherwise use a CSS placeholder.
- Voice files are optional and require explicit opt-in.

### Visual Visits

- Add `Walk_Left`, `Walk_Right`, `Walk_Up`, and `Walk_Down` to the base requirements.
- Diagonal animation mappings are optional; current controller can choose cardinal fallbacks.
- `frameDurationMs` and loop metadata must be present for the required Visit animations.
- The visual renderer must not fabricate missing animation art. Missing requirements produce a clear unavailable state.

## Maintenance rules

1. Put decorative Panel assets under `public/assets/panel/{notebook,frames,decorations,doodles}` and preserve semantic file names.
2. Keep functional icons in one SVG/code system outside the raster decoration folders.
3. Record intrinsic size, intended CSS size, nine-slice values, alpha behavior, and contrast assumptions for any new image.
4. Test every asset at 760, 900, 1180, and 1440 px Panel widths and against English/Simplified Chinese content.
5. Decorations must survive removal: automated visual or accessibility behavior must not depend on them.
6. Check unused assets before adding variants; pink/purple tape and all five doodles already exist.
7. Do not expose Network storage URLs or local file paths as renderer image sources; use the existing safe protocols.

## Unverified items

- License and redistribution status for Xiaolai and SetoFont.
- Complete glyph coverage and weight behavior for English and Simplified Chinese.
- Whether current raster frames retain acceptable edge quality above their present CSS sizes on high-DPI displays.
- Whether a production Companion package always includes portrait/icon assets; the manifest permits them but does not require them.
