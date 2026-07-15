# Review Request — UI-002

## Verdict Requested

Return exactly one verdict: PASS, PASS WITH FOLLOW-UP, CHANGES REQUIRED, or BLOCKED.

## Objective

Make `PaperCard` corner tape explicit, remove repeated operational tape from Settings and Published Companion, and preserve the intentional narrative and Social page-level treatments.

## Starting Main Commit

`12b715b2ab948dbb822606f3bb631484b76e1204`

## Implementation Commit

`95a262b84b3e605c5284bb5deb5567a196d2f8d6`

## Branch

`main`

## Relevant Specifications

- `docs/ui-ux/ART_DIRECTION.md`
- `docs/ui-ux/UI_LAYER_SYSTEM.md`
- `docs/ui-ux/COMPONENT_VISUAL_RULES.md`
- `docs/ui-ux/ASSET_REQUIREMENTS.md`
- `docs/ui-ux/MOTION_LANGUAGE.md`

## Changed Files

- `apps/desktop/renderer/src/ui/NotebookPrimitives.tsx`
- `apps/desktop/renderer/src/ui/NotebookPrimitives.test.ts`
- `apps/desktop/renderer/src/styles/panel-layout.css`
- `apps/desktop/renderer/src/pages/SettingsPage.tsx`
- `apps/desktop/renderer/src/features/social/PublishedCompanionSection.tsx`
- `apps/desktop/renderer/src/pages/MemoriesPage.tsx`
- `tests/ui/settings-page.spec.ts`
- `tasks/ui/active/UI-002.md`
- UI-002 screenshot evidence and this review request in the follow-up evidence commit

## PaperCard API Decision

- `tape` now adds the stable root hook `paper-card-taped`.
- The existing title behavior remains: taped cards use `NotebookSectionTitle`; plain cards use a conventional `h2`.
- Compact and custom classes retain their existing behavior.
- Section semantics and the accessibility tree are unchanged.
- CSS now applies cream corner tape through `.paper-card-taped::after`, while `.paper-photo-card::after` remains in the shared decoration rule.

## Operational Usages Changed

- Removed `tape` from all Settings `PaperCard` call sites: Companion, Attention, Queued Discoveries, Appearance, Privacy/Permissions, Voice, Online, Advanced, AI, and Developer.
- Removed `tape` from the nested `PublishedCompanionSection` card.
- No form, field, action, validation, Network, publishing, AI, Voice, Privacy, or developer behavior changed.

## Narrative Usages Preserved

- Home and Journeys keep their existing explicit `tape` props.
- The Memory editor remains explicitly taped.
- Raw narrative Memory result cards now explicitly include `paper-card-taped`, preserving their prior appearance after the selector becomes opt-in.
- Social retains one intentional outer page-level taped card in both available and unavailable states.
- Photo/evidence cards retain their existing selector and visual behavior.

## Verification Results

| Command | Result | Counts / notes |
|---|---|---|
| `npm test -- apps/desktop/renderer/src/ui/NotebookPrimitives.test.ts` | PASS | 1 file, 5 tests; 0 failed, 0 skipped |
| `OUR_COMPANION_UI_QA_RUN_ID=2026-07-15-ui002-1 npm run test:ui -- --grep "PaperCard tape"` | PASS | 1 Electron test; 0 failed, 0 skipped |
| `npm run typecheck` | PASS | Node `v22.23.1` |
| `npm run arch:check` | PASS | Architecture boundaries OK |
| `npm test` | PASS | 71 files, 490 tests; 0 failed, 0 skipped |
| `npm run build` | PASS | Renderer, Electron main, and preload production bundles |
| Full `npm run test:ui` wrapper invocation | PASS WITH EXISTING SKIP | 31 passed, 0 failed, 1 skipped live-AI test gated by credentials |

## Runtime and Accessibility Evidence

- English Settings AI renders an untaped operational card with Model, Endpoint, API Key, language, Save, and Clear controls unchanged.
- Simplified Chinese Settings Companion renders three untaped cards with localized headings.
- At 760 px, Settings has no horizontal page overflow or card-edge artifact.
- Social contains exactly one `paper-card-taped` card; Published Companion is untaped.
- Home retains explicit narrative cream tape.
- Settings and Social focused axe runs returned zero critical and zero serious violations.
- Keyboard focus remains visible on the Settings Model input.
- No motion behavior, transition, or reduced-motion rule changed; the full reduced-motion Electron suite passed.

## Screenshot Evidence

- Index: `artifacts/ui-ux/UI-002/2026-07-15-ui002-1/screenshot-index.md`
- English Settings AI: `artifacts/ui-ux/UI-002/2026-07-15-ui002-1/en-settings-ai-1180.png`
- Simplified Chinese Settings Companion: `artifacts/ui-ux/UI-002/2026-07-15-ui002-1/zh-CN-settings-companion-1180.png`
- Simplified Chinese Settings AI at 760 px: `artifacts/ui-ux/UI-002/2026-07-15-ui002-1/zh-CN-settings-ai-760.png`
- English Social operational hierarchy: `artifacts/ui-ux/UI-002/2026-07-15-ui002-1/en-social-operational-tape-1180.png`
- English Home narrative regression: `artifacts/ui-ux/UI-002/2026-07-15-ui002-1/en-home-narrative-tape-1180.png`

## Known Limitations

- Production accounts, production Network data, and real API keys were intentionally not used.
- The existing live-AI Electron test remains skipped without its external credential; it is unrelated to tape semantics.
- Default-window screenshots reflect Electron device scaling rather than one image pixel per CSS pixel; viewport behavior is asserted in the runtime.

## Deviations from Specification

None.

## Unverified Areas

- Live production-account data and publishing mutations were not exercised because UI-002 changes decoration only.

## Product Decisions Required

None.

## Reviewer Questions

None.
