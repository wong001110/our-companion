# UI-003 Screenshot Evidence — 2026-07-15-ui003-1

## Run Metadata

- Task: `UI-003 — Establish Panel Typography Roles`
- Main starting commit: `c24a4460cb82d7c6d82177230e199071c86c3d2b`
- Implementation commit: pending initial implementation commit
- Runtime: Node `v22.23.1`, Electron smoke fixture, software rendering
- Motion preference: default; the unchanged reduced-motion lifecycle passed in the full Electron suite
- Computed-style evidence: `computed-fonts.json`
- Visual review: all seven final captures reviewed on 2026-07-15

## Computed Font Roles

- UI role: `ui-sans-serif, system-ui, -apple-system, "system-ui", "Segoe UI", sans-serif`
- Handwritten role: `Xiaolai, ui-sans-serif, system-ui, -apple-system, "system-ui", "Segoe UI", sans-serif`
- Creation regression: remains on the pre-existing handwritten root stack and is not matched by Panel-scoped rules

## Captures

### `en-settings-ai-typography-1180.png`

- Surface/state: Panel Settings, AI category; Model field focused
- Language: English
- Viewport: normal supported Panel width
- Expected role: Notebook page H1 handwritten; AI heading, labels, inputs, selects, and buttons UI
- Computed evidence: `settingsTitle` contains Xiaolai; `aiHeading`, `modelInput`, `settingsSelect`, and `settingsButton` exclude Xiaolai; `modelFocus` is true
- Observed: operational typography is conventional and readable, focus is visible, controls are aligned, no real API key is present, and UI-002 untaped hierarchy remains intact
- Visual review: PASS

### `zh-CN-settings-companion-typography-1180.png`

- Surface/state: Panel Settings, Companion category
- Language: Simplified Chinese
- Viewport: normal supported Panel width
- Expected role: page H1 handwritten; operational headings/body use the UI/CJK fallback
- Computed evidence: `zhPageTitle` contains Xiaolai; `zhOperationalHeading` excludes Xiaolai
- Observed: Chinese glyphs are complete and readable, card headings are conventional, controls remain aligned, and no clipping or missing glyphs appear
- Visual review: PASS

### `en-social-typography-1180.png`

- Surface/state: populated smoke account, existing-friend lookup result, Published Companion form
- Language: English
- Viewport: normal supported width with expanded height to show the complete required state
- Expected role: authored Social taped title handwritten; account, publishing, lookup, relationship, and action content UI
- Computed evidence: `socialTitle` contains Xiaolai; `socialRelationship` excludes Xiaolai; severe axe list is empty
- Observed: relationship reads `Already friends`, lookup and publishing controls remain intact, exactly one taped Social card remains, and nested Published Companion is untaped
- Visual review: PASS

### `en-chat-typography-1180.png`

- Surface/state: deterministic stored user and Companion history with metadata and composer
- Language: English
- Viewport: normal supported Panel width
- Expected role: page H1 handwritten; message bodies, metadata, search, filters, composer, and actions UI
- Computed evidence: `chatUser`, `chatCompanion`, and `chatComposer` exclude Xiaolai; severe axe list is empty
- Observed: long-form messages are conventionally readable; bubble assets, tails, alignment, spacing, and composer behavior remain unchanged
- Visual review: PASS

### `en-home-typography-1180.png`

- Surface/state: Home narrative hierarchy with status card, StickyNote, and taped narrative cards
- Language: English
- Viewport: normal supported Panel width
- Expected role: page H1, taped section title, and short StickyNote title handwritten; body copy and actions UI
- Computed evidence: `homeTitle` and `homeSectionTitle` contain Xiaolai; `homeBody` excludes Xiaolai; `homeTape` is true
- Observed: expressive headings remain warm and handwritten, body copy is clearer, and cream tape decoration is preserved
- Visual review: PASS

### `zh-CN-settings-ai-typography-760.png`

- Surface/state: Panel Settings, AI category
- Language: Simplified Chinese
- Viewport: 760 × 720 CSS px
- Expected role: operational heading and controls UI; page H1 handwritten; no horizontal overflow
- Computed evidence: `narrowHeading` excludes Xiaolai; `narrowOverflow` is true
- Observed: Chinese labels and inputs are readable, the full header is visible, no glyph is missing, and there is no clipping or horizontal page overflow
- Visual review: PASS

### `en-creation-typography-regression.png`

- Surface/state: Companion selection in the non-Panel Creation Window
- Language: English
- Viewport: default Creation window
- Expected role: unchanged pre-existing non-Panel typography
- Computed evidence: `creation` retains the Xiaolai-first root stack
- Observed: selection cards, actions, labels, and layout match the baseline; Panel typography selectors do not restyle Creation
- Visual review: PASS

## Baseline Comparison

- Settings, Social, Home, and 760 px starting visuals: `artifacts/ui-ux/UI-002/2026-07-15-ui002-1/`
- UI-003 pre-implementation Chat baseline: `artifacts/ui-ux/UI-003/2026-07-15-ui003-baseline/en-chat-typography-1180.png`
- UI-003 pre-implementation Creation baseline: `artifacts/ui-ux/UI-003/2026-07-15-ui003-baseline/en-creation-typography-regression.png`
- The baseline computed Panel stack contained Xiaolai first. Final computed evidence removes Xiaolai from operational Panel content while retaining it on the explicit expressive roles.

## Secrets and Production Data

No production account, real API key, credential, token, private Network data, or production mutation was used or captured.
