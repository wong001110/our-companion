# UI-002 Screenshot Index

## Run

- Run ID: `2026-07-15-ui002-1`
- Implementation commit: `95a262b84b3e605c5284bb5deb5567a196d2f8d6`
- Runtime: packaged Electron build launched by Playwright with `OUR_COMPANION_SMOKE_TEST=1`
- Fixture: local smoke Companion plus smoke-only Network status; no production account, credential, or API key
- Node: `v22.23.1`
- Visual review: completed for all five PNGs

## Evidence

| Screenshot | State | Language | CSS viewport | Expected result | Observed result | Visual review |
|---|---|---|---|---|---|---|
| `en-settings-ai-1180.png` | Settings AI | English | Default supported Panel width, capped at 1180 px | Untaped operational card; conventional heading; model, endpoint, API-key and language controls unchanged | Paper frame remains; no top-right cream tape or taped label; fields and focused Model input are clear | Pass — no clipping, overlap, exposed key, or focus-ring regression |
| `zh-CN-settings-companion-1180.png` | Settings Companion | Simplified Chinese | Default supported Panel width, capped at 1180 px | Three distinct untaped operational cards with readable localized headings and unchanged controls | Behavior, Attention, and Queued Discoveries remain separated without repeated top-right tape | Pass — localized headings and controls are clear and aligned |
| `zh-CN-settings-ai-760.png` | Settings AI narrow | Simplified Chinese | 760 × 720 px before full-page capture | Untaped card, stable one-column form, no horizontal page overflow | Navigation, category tabs, headings, fields, and selects fit within the page width | Pass — no clipping, overlap, negative-margin artifact, or horizontal overflow |
| `en-social-operational-tape-1180.png` | Social with smoke account | English | Default supported Panel width, capped at 1180 px | One outer page-level taped cue; nested Published Companion untaped; controls unchanged | Outer Social card retains the top-right cream tape; Online Companion keeps its frame without another tape treatment | Pass — hierarchy is clear and publishing fields remain readable |
| `en-home-narrative-tape-1180.png` | Home narrative regression | English | Default supported Panel width, capped at 1180 px | Explicit narrative cards retain taped headings and cream corner tape | Companion Status, Current Focus, and other explicit narrative cards preserve the existing decoration | Pass — narrative appearance is preserved without layout regression |

## Automated Assertions

- Plain `PaperCard` omits `paper-card-taped` and uses a conventional `h2`.
- `tape` adds `paper-card-taped` and the existing notebook section title while preserving compact/custom classes.
- The CSS tape selector targets `.paper-card-taped::after` and retains `.paper-photo-card::after`; `.paper-card::after` is absent.
- Settings and Published Companion source contracts contain no taped `PaperCard` usage.
- Electron assertions verify untaped AI and Companion cards, exactly one Social taped card, an untaped Published Companion card, and a taped Home narrative card.
- Settings and Social axe scans report zero critical and zero serious violations.
- The 760 px page has no horizontal overflow, and the focused Model input retains a visible outline.

## Capture Notes

- Default-window PNGs are captured at the packaged Electron device scale, producing 1872 × 1432 image pixels for the supported 1180 px CSS layout.
- The narrow full-page PNG is 760 × 881 image pixels after starting from a 760 × 720 CSS viewport.
- Screenshot animations are disabled only for deterministic capture; UI-002 adds no motion.
