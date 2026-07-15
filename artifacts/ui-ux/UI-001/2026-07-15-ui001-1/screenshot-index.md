# UI-001 Screenshot Index

## Run

- Run ID: `2026-07-15-ui001-1`
- Runtime: packaged Electron build launched by Playwright with `OUR_COMPANION_SMOKE_TEST=1`
- Fixture source: smoke-runtime-only friend lookup fixture; no personal account or live Network data
- Node: `v22.23.1`
- Visual review: completed against all four PNGs

## Evidence

| Screenshot | State | Language | CSS viewport | Expected result | Visual review |
|---|---|---|---|---|---|
| `en-existing-friend-1180.png` | `friend` | English | Default supported Panel width, capped at 1180 px | Mira and `MIRA0001`; “Already friends”; no Send Request action | Pass — copy is clear; no duplicate action, clipping, overlap, or layout regression |
| `en-no-relationship-1180.png` | `none` | English | Default supported Panel width, capped at 1180 px | Sol and `SOL00001`; “No existing connection”; Send Request visible | Pass — action and relationship copy are distinct and readable |
| `zh-CN-incoming-request-1180.png` | `incoming_request` | Simplified Chinese | Default supported Panel width, capped at 1180 px | 小安 and `AN000001`; localized incoming-request status; no Send Request action | Pass — localized copy is complete and unclipped |
| `zh-CN-incoming-request-760.png` | `incoming_request` | Simplified Chinese | 760 × 720 px | Populated result remains readable without duplicate action or horizontal overflow | Pass — responsive navigation and result card fit without clipping or overlap |

## Automated Assertions

- All four authoritative relationship values are covered by focused unit tests.
- Legacy `friends`, renderer-visible `blocked`, arbitrary strings, `undefined`, and `null` use the safe fallback and never enable Send Request.
- Keyboard focus moves from the Friend Code input to Find, and Enter submits the lookup.
- Axe reported no new critical or serious violations on the populated Social surface.
- The 760 px state asserted `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.

## Privacy Review

All names, Friend Codes, accounts, and relationship states are deterministic fictional fixtures. The screenshots contain no personal credentials, tokens, local paths, production account data, or private Network content.
